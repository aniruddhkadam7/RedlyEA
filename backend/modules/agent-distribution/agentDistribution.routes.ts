import { Router, type Request, type Response } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const installerScriptPath = path.join(workspaceRoot, 'agent-installer', 'setup.iss');
const cacheDir = path.join(workspaceRoot, 'agent-installer', '.cache');
const certDir = path.join(workspaceRoot, '.certs');

/* ------------------------------------------------------------------ */
/*  Agent source detection                                            */
/* ------------------------------------------------------------------ */

function resolveAgentSourceDir(): string | null {
  const candidates = [
    process.env.REDLY_AGENT_SOURCE_DIR,
    path.join(workspaceRoot, 'agent'),
    path.join(workspaceRoot, '..', 'RedlyAgent'),
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    if (
      fs.existsSync(c) &&
      fs.existsSync(path.join(c, 'service.js')) &&
      fs.existsSync(path.join(c, 'bin', 'node.exe'))
    ) {
      return c;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Inno Setup compiler detection                                     */
/* ------------------------------------------------------------------ */

function resolveInnoCompilerPath(): string | null {
  const localAppData = process.env.LOCALAPPDATA;
  const candidates = [
    process.env.INNO_SETUP_COMPILER,
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
    localAppData
      ? path.join(localAppData, 'Programs', 'Inno Setup 6', 'ISCC.exe')
      : undefined,
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Inno Setup 6', 'ISCC.exe'),
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Server URL helper                                                 */
/* ------------------------------------------------------------------ */

function normalizeBaseUrl(req: Request): string {
  const explicit = process.env.REDLY_AGENT_SERVER_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const proto = (
    (req.headers['x-forwarded-proto'] as string) ??
    req.protocol ??
    'http'
  )
    .split(',')[0]
    .trim();
  const host =
    req.get('host') ?? `127.0.0.1:${process.env.LOCAL_SERVICE_PORT ?? '3001'}`;
  return `${proto}://${host}`.replace(/\/$/, '');
}

/* ------------------------------------------------------------------ */
/*  Source staging                                                     */
/* ------------------------------------------------------------------ */

function stageAgentSource(src: string, dst: string): void {
  fs.cpSync(src, dst, {
    recursive: true,
    force: true,
    filter: (s) => {
      const name = path.basename(s).toLowerCase();
      return (
        name !== '.git' &&
        name !== '.github' &&
        name !== 'dist' &&
        name !== 'installer'
      );
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Cache key — changes when source files or ISS script change        */
/* ------------------------------------------------------------------ */

function computeCacheKey(sourceDir: string, serverUrl: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(serverUrl);

  const keyFiles = [
    'service.js',
    'agent.js',
    'config.js',
    'package.json',
    'bin/node.exe',
  ];

  for (const f of keyFiles) {
    try {
      const stat = fs.statSync(path.join(sourceDir, f));
      hash.update(`${f}:${stat.mtimeMs}:${stat.size}`);
    } catch {
      hash.update(`${f}:missing`);
    }
  }

  try {
    const stat = fs.statSync(installerScriptPath);
    hash.update(`iss:${stat.mtimeMs}:${stat.size}`);
  } catch {}

  return hash.digest('hex').substring(0, 16);
}

function getCachedInstaller(cacheKey: string): string | null {
  const cached = path.join(cacheDir, `RedlyAgentSetup-${cacheKey}.exe`);
  if (fs.existsSync(cached)) {
    console.log(`[agent-dist] Serving cached installer (key=${cacheKey})`);
    return cached;
  }
  return null;
}

function pruneOldCaches(keepKey: string): void {
  try {
    if (!fs.existsSync(cacheDir)) return;
    for (const entry of fs.readdirSync(cacheDir)) {
      if (entry.endsWith('.exe') && !entry.includes(keepKey)) {
        fs.unlinkSync(path.join(cacheDir, entry));
      }
    }
  } catch {}
}

/* ------------------------------------------------------------------ */
/*  Self-signed code-signing certificate (auto-created for dev)       */
/* ------------------------------------------------------------------ */

async function ensureDevSigningCert(): Promise<string | null> {
  const thumbprintFile = path.join(certDir, 'thumbprint.txt');
  const pfxFile = path.join(certDir, 'redly-dev-signing.pfx');

  // If we already created a cert previously, verify it's still in the store
  if (fs.existsSync(thumbprintFile) && fs.existsSync(pfxFile)) {
    const thumbprint = fs.readFileSync(thumbprintFile, 'utf8').trim();
    try {
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Get-ChildItem "Cert:\\CurrentUser\\My\\${thumbprint}" -ErrorAction Stop | Select-Object -ExpandProperty Thumbprint`,
      ], { windowsHide: true, timeout: 10000 });
      if (stdout.trim()) return thumbprint;
    } catch {
      // Cert was removed from store — recreate below
    }
  }

  // Create a new self-signed code-signing certificate via PowerShell script
  fs.mkdirSync(certDir, { recursive: true });
  const password = 'RedlyDev2026';
  const pfxEscaped = pfxFile.replace(/'/g, "''");

  const psScript = [
    '$ErrorActionPreference = "Stop"',
    `$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=Redly EA Development, O=RedlyEA" -FriendlyName "Redly EA Dev Code Signing" -KeyExportPolicy Exportable -CertStoreLocation "Cert:\\CurrentUser\\My" -NotAfter (Get-Date).AddYears(5) -KeyLength 2048 -HashAlgorithm SHA256`,
    `$pwd = ConvertTo-SecureString -String "${password}" -Force -AsPlainText`,
    `Export-PfxCertificate -Cert "Cert:\\CurrentUser\\My\\$($cert.Thumbprint)" -FilePath '${pfxEscaped}' -Password $pwd | Out-Null`,
    // Trust the cert so Windows recognises the publisher for current user
    '$store = New-Object System.Security.Cryptography.X509Certificates.X509Store("TrustedPublisher","CurrentUser")',
    '$store.Open("ReadWrite")',
    '$store.Add($cert)',
    '$store.Close()',
    '$store2 = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root","CurrentUser")',
    '$store2.Open("ReadWrite")',
    '$store2.Add($cert)',
    '$store2.Close()',
    'Write-Output $cert.Thumbprint',
  ].join('; ');

  const scriptPath = path.join(certDir, '_create-cert.ps1');
  fs.writeFileSync(scriptPath, psScript, 'utf8');

  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
    ], { windowsHide: true, timeout: 30000 });

    const thumbprint = stdout.trim().split(/\r?\n/).pop()!.trim();
    fs.writeFileSync(thumbprintFile, thumbprint, 'utf8');
    console.log(`[agent-dist] Created dev code-signing certificate: ${thumbprint}`);
    return thumbprint;
  } catch (error) {
    console.warn('[agent-dist] Failed to create dev signing cert:', error);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Signing: manual PFX (production) → signtool                      */
/*           OR auto dev cert         → Set-AuthenticodeSignature     */
/* ------------------------------------------------------------------ */

async function signInstaller(installerPath: string): Promise<void> {
  // Priority 1 — Manual PFX via env vars (for production / CI)
  const manualPfx = process.env.REDLY_AGENT_SIGN_PFX_PATH?.trim();
  if (manualPfx) {
    await signWithSignTool(installerPath, manualPfx);
    return;
  }

  // Priority 2 — Auto-generated dev certificate
  const thumbprint = await ensureDevSigningCert();
  if (thumbprint) {
    await signWithPowerShell(installerPath, thumbprint);
    return;
  }

  console.warn('[agent-dist] Installer is unsigned — no certificate available');
}

/** Sign using signtool.exe with a PFX file (production path) */
async function signWithSignTool(
  installerPath: string,
  pfxPath: string,
): Promise<void> {
  if (!fs.existsSync(pfxPath)) {
    throw new Error(`Code signing certificate file not found: ${pfxPath}`);
  }

  const signToolPath = resolveSignToolPath();
  if (!signToolPath) {
    throw new Error(
      'signtool.exe not found. Install Windows SDK SignTool or set SIGNTOOL_PATH.',
    );
  }

  const timestampUrl =
    process.env.REDLY_AGENT_SIGN_TIMESTAMP_URL?.trim() ??
    'http://timestamp.digicert.com';
  const args = [
    'sign',
    '/fd',
    'SHA256',
    '/td',
    'SHA256',
    '/tr',
    timestampUrl,
    '/f',
    pfxPath,
  ];
  const pfxPassword = process.env.REDLY_AGENT_SIGN_PFX_PASSWORD?.trim();
  if (pfxPassword) args.push('/p', pfxPassword);
  args.push(installerPath);

  await execFileAsync(signToolPath, args, {
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  console.log('[agent-dist] Installer signed with PFX certificate (signtool)');
}

/** Sign using PowerShell Set-AuthenticodeSignature (dev path — no SDK needed) */
async function signWithPowerShell(
  installerPath: string,
  thumbprint: string,
): Promise<void> {
  const exeEscaped = installerPath.replace(/'/g, "''");
  const cmd = [
    `$cert = Get-ChildItem "Cert:\\CurrentUser\\My\\${thumbprint}" -ErrorAction Stop`,
    `Set-AuthenticodeSignature -FilePath '${exeEscaped}' -Certificate $cert -TimestampServer 'http://timestamp.digicert.com' -HashAlgorithm SHA256 | Out-Null`,
  ].join('; ');

  await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    cmd,
  ], { windowsHide: true, timeout: 30000 });
  console.log('[agent-dist] Installer signed with dev certificate (PowerShell)');
}

function resolveSignToolPath(): string | null {
  const envPath = process.env.SIGNTOOL_PATH;
  const programFilesX86 = process.env['ProgramFiles(x86)'];
  const programFiles = process.env.ProgramFiles;

  const kitRoots = [
    programFilesX86
      ? path.join(programFilesX86, 'Windows Kits', '10', 'bin')
      : undefined,
    programFiles
      ? path.join(programFiles, 'Windows Kits', '10', 'bin')
      : undefined,
  ].filter(Boolean) as string[];

  const candidates: string[] = [];
  if (envPath) candidates.push(envPath);

  for (const root of kitRoots) {
    if (!fs.existsSync(root)) continue;
    const versions = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const v of versions) {
      candidates.push(path.join(root, v, 'x64', 'signtool.exe'));
      candidates.push(path.join(root, v, 'x86', 'signtool.exe'));
    }
  }

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Router                                                            */
/* ------------------------------------------------------------------ */

/**
 * Agent distribution routes.
 *
 *   GET /api/agent/download/windows — builds installer (cached) and downloads it
 *   GET /agent/download/windows     — compatibility alias
 */
export function createAgentDistributionRouter(): Router {
  const router = Router();

  // Kick off cert creation in the background at startup so it's ready
  // before the first download request.
  ensureDevSigningCert().catch(() => {});

  const downloadHandler = async (req: Request, res: Response) => {
    /* ---------- Pre-flight checks ---------- */

    const sourceDir = resolveAgentSourceDir();
    if (!sourceDir) {
      res.status(500).json({
        success: false,
        errorMessage:
          'Agent source folder not found. Set REDLY_AGENT_SOURCE_DIR or ensure ../RedlyAgent contains service.js and bin/node.exe.',
      });
      return;
    }

    if (!fs.existsSync(installerScriptPath)) {
      res.status(500).json({
        success: false,
        errorMessage: 'Installer script missing: agent-installer/setup.iss',
      });
      return;
    }

    const innoCompilerPath = resolveInnoCompilerPath();
    if (!innoCompilerPath) {
      res.status(500).json({
        success: false,
        errorMessage:
          'Inno Setup compiler not found. Install Inno Setup 6 or set INNO_SETUP_COMPILER to ISCC.exe.',
      });
      return;
    }

    /* ---------- Cache check ---------- */

    const serverUrl = normalizeBaseUrl(req);
    const cacheKey = computeCacheKey(sourceDir, serverUrl);

    const cached = getCachedInstaller(cacheKey);
    if (cached) {
      sendInstaller(res, cached);
      return;
    }

    /* ---------- Build installer ---------- */

    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'redly-agent-installer-'),
    );
    const stagedAgentDir = path.join(tempRoot, 'agent-src');
    const outputDir = path.join(tempRoot, 'output');
    const installerPath = path.join(outputDir, 'RedlyAgentSetup.exe');

    const cleanup = () => {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    };

    try {
      console.log('[agent-dist] Building installer (first request or source changed)…');

      stageAgentSource(sourceDir, stagedAgentDir);
      fs.mkdirSync(outputDir, { recursive: true });

      // Inject config.json with server URL
      fs.writeFileSync(
        path.join(stagedAgentDir, 'config.json'),
        `${JSON.stringify({ serverUrl, tenant: 'default' }, null, 2)}\n`,
        'utf8',
      );

      await execFileAsync(
        innoCompilerPath,
        [
          installerScriptPath,
          `/DSourceDir=${stagedAgentDir}`,
          `/DOutputDir=${outputDir}`,
        ],
        { windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
      );

      if (!fs.existsSync(installerPath)) {
        throw new Error(
          'Installer build completed but RedlyAgentSetup.exe was not generated.',
        );
      }

      // Sign the installer
      try {
        await signInstaller(installerPath);
      } catch (signErr) {
        console.warn('[agent-dist] Signing failed (continuing unsigned):', signErr);
      }

      // Cache the built + signed installer for future requests
      fs.mkdirSync(cacheDir, { recursive: true });
      const cachedPath = path.join(cacheDir, `RedlyAgentSetup-${cacheKey}.exe`);
      fs.copyFileSync(installerPath, cachedPath);
      pruneOldCaches(cacheKey);

      console.log(`[agent-dist] Installer built & cached (key=${cacheKey})`);
      sendInstaller(res, cachedPath);
      cleanup();
    } catch (error) {
      cleanup();
      const message =
        error instanceof Error ? error.message : 'Failed to build Windows installer';
      if (!res.headersSent) {
        res.status(500).json({ success: false, errorMessage: message });
      }
    }
  };

  router.get('/api/agent/download/windows', downloadHandler);
  router.get('/agent/download/windows', downloadHandler);

  return router;
}

/* ------------------------------------------------------------------ */
/*  Send the installer file to the client                             */
/* ------------------------------------------------------------------ */

function sendInstaller(res: Response, filePath: string): void {
  const stat = fs.statSync(filePath);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="RedlyAgentSetup.exe"',
  );
  res.setHeader('Content-Length', stat.size);
  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate',
  );
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  stream.on('error', (err) => {
    if (!res.headersSent) {
      res.status(500).json({ success: false, errorMessage: err.message });
    }
  });
}
