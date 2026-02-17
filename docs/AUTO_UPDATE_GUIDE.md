# RedlyAI Auto-Update System

This document explains the auto-update architecture, setup, and deployment process for the RedlyAI Electron desktop application.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User's Machine                               │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│  │   Electron      │    │  React UI       │    │  Express API    │ │
│  │   Main Process  │◄──►│  (Renderer)     │    │  (Embedded)     │ │
│  │                 │    │                 │    │                 │ │
│  │  ┌───────────┐  │    │  Update UI      │    │  Local Data     │ │
│  │  │ updater.js│  │    │  Notifications  │    │  Operations     │ │
│  │  └─────┬─────┘  │    └─────────────────┘    └─────────────────┘ │
│  │        │        │                                               │
│  │        │ electron-updater                                       │
│  └────────┼────────┘                                               │
└───────────┼─────────────────────────────────────────────────────────┘
            │
            │ HTTPS (checkForUpdates)
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      GitHub Releases                                 │
├─────────────────────────────────────────────────────────────────────┤
│  latest.yml               ◄── Version metadata                      │
│  latest-mac.yml                                                      │
│  latest-linux.yml                                                    │
│                                                                      │
│  RedlyAI-Setup-1.0.0.exe  ◄── NSIS Installer                        │
│  RedlyAI-1.0.0.exe        ◄── Portable                               │
│  RedlyAI-1.0.0.dmg        ◄── macOS                                  │
│  RedlyAI-1.0.0.AppImage   ◄── Linux                                  │
│                                                                      │
│  *.blockmap               ◄── Delta update data                      │
└─────────────────────────────────────────────────────────────────────┘
```

## How Auto-Updates Work

### Update Check Flow

1. **Startup Check**: App checks for updates 10 seconds after launch
2. **Periodic Check**: Checks every hour (configurable)
3. **Manual Check**: User can trigger via menu or UI

### Detection Mechanism

```javascript
// electron-updater compares:
currentVersion = app.getVersion(); // from package.json
latestVersion = latest.yml.version; // from GitHub Releases

if (semver.gt(latestVersion, currentVersion)) {
  // Update available!
}
```

### Update Process

1. **Check**: Download `latest.yml` from GitHub Releases
2. **Compare**: Compare version strings using semver
3. **Notify**: Show "Update Available" dialog
4. **Download**: Download new installer (differential using blockmap)
5. **Verify**: Verify signature and checksum
6. **Install**: On restart, NSIS runs in update mode

## NSIS Installer Compatibility

The NSIS installer is fully compatible with auto-updates:

| Feature              | Status | Notes                             |
| -------------------- | ------ | --------------------------------- |
| Differential updates | ✅     | Uses blockmap for delta downloads |
| Silent install       | ✅     | Updates don't show installer UI   |
| Preserve settings    | ✅     | User data in %APPDATA% untouched  |
| Rollback             | ⚠️     | Manual only (keep old installer)  |
| Admin rights         | ✅     | Uses per-user install by default  |

## Configuration Files

### electron-builder.json

```json
{
  "appId": "com.redlyai.desktop",
  "productName": "RedlyAI",
  "publish": {
    "provider": "github",
    "owner": "YOUR_GITHUB_USERNAME",
    "repo": "RedlyEA",
    "releaseType": "release"
  },
  "win": {
    "target": ["nsis", "portable"]
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "perMachine": false
  }
}
```

### package.json (relevant sections)

```json
{
  "name": "redly-ea",
  "version": "1.0.0",
  "author": {
    "name": "RedlyAI",
    "email": "support@redlyai.com"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/YOUR_GITHUB_USERNAME/RedlyEA.git"
  },
  "dependencies": {
    "electron-updater": "^6.3.9"
  }
}
```

## GitHub Token Setup

### Creating a Personal Access Token

1. Go to GitHub → Settings → Developer settings → Personal access tokens
2. Click "Generate new token (classic)"
3. Name: `REDLY_RELEASE_TOKEN`
4. Scopes required:
   - `repo` (Full control of private repositories)
   - Or `public_repo` (for public repos only)
5. Copy the token immediately (shown only once)

### Configuring the Token

#### For Local Development/Manual Releases

```bash
# Windows (PowerShell)
$env:GH_TOKEN = "ghp_xxxxxxxxxxxxxxxxxxxx"
pnpm run release:win

# Windows (Command Prompt)
set GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
pnpm run release:win

# macOS/Linux
export GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
pnpm run release
```

#### For GitHub Actions CI/CD

1. Go to your repository → Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `GH_TOKEN`
4. Value: Your personal access token
5. Click "Add secret"

## Release Commands

### First Release

```bash
# Ensure version is set in package.json
# "version": "1.0.0"

# Build and publish
export GH_TOKEN=your_token_here
pnpm run release:win

# This will:
# 1. Build the web app
# 2. Generate icons
# 3. Package Electron app
# 4. Create GitHub Release v1.0.0
# 5. Upload installer + latest.yml
```

### Publishing Updates

```bash
# Option 1: Automatic version bump + release
pnpm run version:patch  # 1.0.0 → 1.0.1
# Then push to trigger CI/CD, or:
export GH_TOKEN=your_token_here && pnpm run release:win

# Option 2: Manual version bump
npm version patch  # Updates package.json
git push && git push --tags  # Triggers GitHub Actions

# Option 3: Minor/Major updates
pnpm run version:minor  # 1.0.1 → 1.1.0
pnpm run version:major  # 1.1.0 → 2.0.0
```

### Testing Updates

```bash
# 1. Install an older version (e.g., 1.0.0)
# 2. Publish a new version (1.0.1)
# 3. Wait for the installed app to check for updates
#    (10 seconds after startup, then every hour)
# 4. Or trigger manual check in the app

# For faster testing, modify updater.js:
# checkInterval: 30 * 1000  // Check every 30 seconds
```

## GitHub Actions Workflow

The workflow (`.github/workflows/release-desktop.yml`) automatically:

1. **Triggers on**: Push of version tags (`v*.*.*`)
2. **Builds**: Windows, macOS, and Linux simultaneously
3. **Signs**: Code if certificates are configured
4. **Uploads**: All artifacts to GitHub Releases

### Triggering a Release

```bash
# Create and push a version tag
git tag v1.0.1
git push origin v1.0.1

# Or use npm version (auto-creates tag)
npm version patch
git push --follow-tags
```

### Required Secrets

| Secret                        | Required    | Description                            |
| ----------------------------- | ----------- | -------------------------------------- |
| `GH_TOKEN`                    | ✅ Yes      | GitHub token for publishing releases   |
| `APPLE_CERTIFICATE_BASE64`    | ❌ Optional | macOS code signing cert (base64)       |
| `APPLE_CERTIFICATE_PASSWORD`  | ❌ Optional | Certificate password                   |
| `APPLE_ID`                    | ❌ Optional | For macOS notarization                 |
| `APPLE_APP_SPECIFIC_PASSWORD` | ❌ Optional | App-specific password for notarization |
| `WIN_CSC_LINK`                | ❌ Optional | Windows code signing cert URL          |
| `WIN_CSC_KEY_PASSWORD`        | ❌ Optional | Certificate password                   |

## Troubleshooting Checklist

### Update Not Triggering

- [ ] **Version check**: Is `package.json` version lower than GitHub Release?
- [ ] **Network**: Can the app reach `api.github.com`?
- [ ] **Release published**: Is the GitHub Release published (not draft)?
- [ ] **latest.yml exists**: Check GitHub Release assets include `latest.yml`
- [ ] **App is packaged**: Auto-updater only runs in packaged apps
- [ ] **Console logs**: Check DevTools console for `[Updater]` messages

### No Update Popup

- [ ] **Silent mode**: Is `silent: false` in `initAutoUpdater()` options?
- [ ] **Window exists**: Is `mainWindow` valid when update is detected?
- [ ] **Event handlers**: Are update event handlers registered?

### Download Fails

- [ ] **GH_TOKEN**: Was token set during build? (required for private repos)
- [ ] **File exists**: Does the installer exist in GitHub Release assets?
- [ ] **Blockmap**: Does `.blockmap` file exist for delta updates?
- [ ] **Disk space**: Enough space in temp directory?

### White Screen After Update

- [ ] **asar integrity**: Rebuild with `npm run desktop:build:win`
- [ ] **Path issues**: Check `dist/index.html` exists in package
- [ ] **Preload script**: Ensure `preload.js` is in `asarUnpack`

### Installation Fails

- [ ] **Admin rights**: For per-machine install, needs elevation
- [ ] **Antivirus**: May block unsigned executables
- [ ] **File locks**: Close all app instances before update

## Windows-Specific Requirements

### Code Signing (Recommended for Production)

Without code signing:

- Windows SmartScreen shows warning
- Browser may block download
- Corporate environments may block execution

To sign your app:

1. **Get a certificate**: Purchase from DigiCert, Sectigo, etc.
2. **Export as .pfx**: Include private key
3. **Configure electron-builder**:
   ```json
   "win": {
     "certificateFile": "path/to/certificate.pfx",
     "certificatePassword": "your_password"
   }
   ```
4. **Or use environment variables**:
   ```bash
   export CSC_LINK=path/to/certificate.pfx
   export CSC_KEY_PASSWORD=your_password
   ```

### Installer Location Requirements

| Install Type       | Location                          | UAC Required | Auto-Update        |
| ------------------ | --------------------------------- | ------------ | ------------------ |
| Per-user (default) | `%LOCALAPPDATA%\Programs\RedlyAI` | No           | ✅ Works           |
| Per-machine        | `C:\Program Files\RedlyAI`        | Yes          | ⚠️ Needs elevation |

### User Data Location

Auto-updates preserve user data stored in:

```
%APPDATA%\RedlyAI\          # Application data
%LOCALAPPDATA%\RedlyAI\     # Cache, logs
```

## Renderer Integration (Optional)

To show update status in the UI, add to your React app:

```typescript
// src/hooks/useUpdater.ts
import { useEffect, useState } from "react";

interface UpdateStatus {
  status:
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "downloaded"
    | "error";
  version?: string;
  percent?: number;
  error?: string;
}

export function useUpdater() {
  const [status, setStatus] = useState<UpdateStatus>({ status: "idle" });

  useEffect(() => {
    if (!window.electron) return;

    const handler = (_event: any, data: any) => {
      setStatus(data);
    };

    window.electron.ipcRenderer.on("updater:status", handler);
    return () => {
      window.electron.ipcRenderer.removeListener("updater:status", handler);
    };
  }, []);

  const checkForUpdates = async () => {
    return window.electron?.ipcRenderer.invoke("updater:check");
  };

  const downloadUpdate = async () => {
    return window.electron?.ipcRenderer.invoke("updater:download");
  };

  const installUpdate = () => {
    window.electron?.ipcRenderer.invoke("updater:install");
  };

  return { status, checkForUpdates, downloadUpdate, installUpdate };
}
```

## File Structure

```
electron/
├── main.js           # Main process, imports updater
├── preload.js        # Exposes IPC to renderer
├── updater.js        # Auto-update module (NEW)
└── devtools-control.html

.github/
└── workflows/
    └── release-desktop.yml  # CI/CD workflow (NEW)

release/                     # Build output
├── latest.yml              # Update metadata
├── RedlyAI Setup 1.0.0.exe # NSIS installer
├── RedlyAI 1.0.0.exe       # Portable
└── *.blockmap              # Delta update data
```

## Quick Start Checklist

1. [ ] Update `electron-builder.json` with your GitHub username/repo
2. [ ] Update `package.json` with author and repository fields
3. [ ] Install electron-updater: `pnpm add electron-updater`
4. [ ] Create GitHub Personal Access Token
5. [ ] Add `GH_TOKEN` to GitHub repository secrets
6. [ ] Commit and push changes
7. [ ] Create first release: `npm version 1.0.0 && git push --tags`
8. [ ] Install the released version
9. [ ] Publish update: `npm version patch && git push --tags`
10. [ ] Verify update appears in installed app
