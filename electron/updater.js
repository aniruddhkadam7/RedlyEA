/**
 * Auto-updater module for RedlyEA Electron app.
 * Uses electron-updater with GitHub Releases as the update server.
 *
 * Architecture:
 * - electron-updater checks GitHub Releases for latest.yml
 * - Compares version in latest.yml with app.getVersion()
 * - Downloads update differentially using blockmap files
 * - Installs on app quit or user-triggered restart
 *
 * Compatible with:
 * - NSIS installer (Windows)
 * - DMG/ZIP (macOS)
 * - AppImage (Linux)
 */

const { app, dialog, BrowserWindow, ipcMain } = require("electron");
const _path = require("node:path");

// Only import autoUpdater in packaged app to avoid dev errors
let autoUpdater = null;

// Track whether the current check was triggered by the renderer via IPC.
// When true, native dialogs are suppressed so the renderer can show its own UI.
let isRendererTriggeredCheck = false;

// Track whether a download was triggered by the renderer via IPC.
let isRendererTriggeredDownload = false;

/**
 * Register IPC handlers for updater.
 * These are registered ALWAYS (dev + production) so the renderer never gets
 * "No handler registered" errors.  In dev mode the handlers return
 * graceful "not available" responses.
 */
function registerUpdaterIpc() {
  ipcMain.handle("updater:check", async () => {
    const currentVersion = app.getVersion();
    if (!autoUpdater) {
      return {
        ok: false,
        currentVersion,
        error: "Auto-updates are only available in the packaged desktop app.",
      };
    }
    try {
      // Suppress native dialogs for renderer-triggered checks
      isRendererTriggeredCheck = true;
      const result = await autoUpdater.checkForUpdates();
      const updateInfo = result?.updateInfo ?? null;
      // Determine whether the remote version is actually newer than current.
      const remoteVersion = updateInfo?.version ?? null;
      // Normalize both versions (strip leading "v") before comparison to
      // avoid false positives due to prefix mismatch (v1.0.3 vs 1.0.3).
      const normalizedRemote = remoteVersion
        ? String(remoteVersion).replace(/^v/i, "")
        : null;
      const normalizedCurrent = String(currentVersion).replace(/^v/i, "");
      const updateAvailable =
        normalizedRemote != null &&
        normalizedRemote !== normalizedCurrent &&
        isNewerVersion(normalizedRemote, normalizedCurrent);
      return { ok: true, currentVersion, updateAvailable, updateInfo };
    } catch (err) {
      return { ok: false, currentVersion, error: err.message };
    } finally {
      // Reset after a tick so the event handler can read the flag
      setTimeout(() => {
        isRendererTriggeredCheck = false;
      }, 500);
    }
  });

  ipcMain.handle("updater:download", async () => {
    if (!autoUpdater) {
      return {
        ok: false,
        error: "Auto-updates are only available in the packaged desktop app.",
      };
    }
    try {
      isRendererTriggeredDownload = true;
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    } finally {
      setTimeout(() => {
        isRendererTriggeredDownload = false;
      }, 500);
    }
  });

  ipcMain.handle("updater:install", () => {
    if (!autoUpdater) {
      return {
        ok: false,
        error: "Auto-updates are only available in the packaged desktop app.",
      };
    }

    // The renderer no longer shows an overlay, so we proceed immediately.

    // --- Failsafe relaunch watchdog (Windows only) ---
    // NSIS --force-run is supposed to relaunch the app after a silent
    // install, but it doesn't work reliably with oneClick:true.
    // We spawn a hidden PowerShell process that waits ~12 seconds
    // (plenty for NSIS to finish), then starts the exe.
    //
    // If NSIS *did* relaunch successfully, the watchdog-started
    // instance hits requestSingleInstanceLock() in main.js and
    // silently exits — so there is never a duplicate.
    if (process.platform === "win32") {
      try {
        const exePath = app.getPath("exe");
        const { spawn } = require("node:child_process");
        const watchdog = spawn(
          "powershell.exe",
          [
            "-NoProfile",
            "-WindowStyle",
            "Hidden",
            "-Command",
            `Start-Sleep -Seconds 12; Start-Process -FilePath '${exePath.replace(/'/g, "''")}'`,
          ],
          { detached: true, stdio: "ignore", windowsHide: true },
        );
        watchdog.unref();
        console.log(
          "[Updater] Relaunch watchdog spawned — will start app in ~12 s if needed",
        );
      } catch (e) {
        console.error(
          "[Updater] Failed to spawn relaunch watchdog:",
          e.message,
        );
      }
    }

    // quitAndInstall(true, true):
    //   isSilent=true         — NSIS runs silently (no wizard UI)
    //   isForceRunAfter=true  — relaunches the app after install
    //
    // quitAndInstall internally closes all windows, quits the app,
    // and spawns the NSIS installer.  Do NOT manually destroy windows.
    autoUpdater.quitAndInstall(true, true);

    return { ok: true };
  });

  ipcMain.handle("updater:getVersion", () => {
    return { version: app.getVersion() };
  });
}

/**
 * Simple semver comparison: returns true if a > b.
 * Handles the common "major.minor.patch" format.
 */
function isNewerVersion(a, b) {
  const pa = String(a).replace(/^v/, "").split(".").map(Number);
  const pb = String(b).replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return true;
    if (na < nb) return false;
  }
  return false;
}

// Register IPC handlers immediately so they are available before app.ready
registerUpdaterIpc();

/**
 * Initialize the auto-updater.
 * Call this after app is ready and main window is created.
 *
 * @param {BrowserWindow} mainWindow - The main browser window
 * @param {Object} options - Configuration options
 * @param {boolean} options.silent - If true, don't show dialogs (default: false)
 * @param {number} options.checkInterval - Check interval in ms (default: 1 hour)
 */
function initAutoUpdater(mainWindow, options = {}) {
  // Only run in packaged app
  if (!app.isPackaged) {
    console.log(
      "[Updater] Skipping auto-updater in development mode (IPC stubs are active)",
    );
    return;
  }

  try {
    // Dynamic import to avoid issues in development
    const { autoUpdater: updater } = require("electron-updater");
    autoUpdater = updater;
  } catch (err) {
    console.error("[Updater] Failed to load electron-updater:", err.message);
    return;
  }

  const { silent = false, checkInterval = 60 * 60 * 1000 } = options;

  // Configure updater
  autoUpdater.autoDownload = false; // Don't download automatically, wait for user
  autoUpdater.autoInstallOnAppQuit = false; // Only install via explicit user action (quitAndInstall)
  autoUpdater.allowDowngrade = false; // Don't allow downgrade to older versions

  // Logging
  autoUpdater.logger = {
    info: (msg) => console.log("[Updater]", msg),
    warn: (msg) => console.warn("[Updater]", msg),
    error: (msg) => console.error("[Updater]", msg),
    debug: (msg) => console.log("[Updater:debug]", msg),
  };

  // ---------------------------------------------------------------------------
  // Event Handlers
  // ---------------------------------------------------------------------------

  autoUpdater.on("checking-for-update", () => {
    console.log("[Updater] Checking for updates...");
    sendStatusToWindow(mainWindow, "checking");
  });

  autoUpdater.on("update-available", (info) => {
    console.log("[Updater] Update available:", info.version);
    sendStatusToWindow(mainWindow, "available", info);

    // Verify the remote version is actually newer than what we're running.
    // electron-updater fires "update-available" when versions differ (not
    // strictly newer), so we need our own semver check.
    const remoteVer = String(info.version || "").replace(/^v/i, "");
    const currentVer = String(app.getVersion()).replace(/^v/i, "");
    if (!isNewerVersion(remoteVer, currentVer)) {
      console.log(
        `[Updater] Remote ${remoteVer} is not newer than current ${currentVer} — skipping dialog`,
      );
      return;
    }

    // Only show native dialog for automatic/background checks.
    // When the renderer triggered the check, it will show its own UI.
    if (!silent && !isRendererTriggeredCheck) {
      showUpdateAvailableDialog(mainWindow, info);
    }
  });

  autoUpdater.on("update-not-available", (info) => {
    console.log("[Updater] Already up to date:", info.version);
    sendStatusToWindow(mainWindow, "not-available", info);
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent = Math.round(progress.percent);
    console.log(`[Updater] Download progress: ${percent}%`);
    sendStatusToWindow(mainWindow, "downloading", {
      percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log("[Updater] Update downloaded:", info.version);
    sendStatusToWindow(mainWindow, "downloaded", info);

    // Only show native dialog for automatic downloads.
    // When the renderer triggered the download, it will show its own UI.
    if (!silent && !isRendererTriggeredDownload) {
      showUpdateDownloadedDialog(mainWindow, info);
    }
  });

  autoUpdater.on("error", (err) => {
    console.error("[Updater] Error:", err.message);
    sendStatusToWindow(mainWindow, "error", { message: err.message });
  });

  // ---------------------------------------------------------------------------
  // Initial check and periodic checks
  // ---------------------------------------------------------------------------

  // Check for updates after a short delay (let app fully initialize)
  setTimeout(() => {
    checkForUpdates();
  }, 10000); // 10 seconds after startup

  // Periodic update checks
  if (checkInterval > 0) {
    setInterval(() => {
      checkForUpdates();
    }, checkInterval);
  }

  console.log("[Updater] Auto-updater initialized");
}

/**
 * Manually trigger an update check.
 */
async function checkForUpdates() {
  if (!autoUpdater) {
    console.log("[Updater] Updater not initialized");
    return null;
  }

  try {
    return await autoUpdater.checkForUpdates();
  } catch (err) {
    console.error("[Updater] Check failed:", err.message);
    return null;
  }
}

/**
 * Send update status to the renderer process.
 */
function sendStatusToWindow(mainWindow, status, data = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("updater:status", { status, ...data });
  }
}

/**
 * Show dialog when an update is available.
 */
function showUpdateAvailableDialog(mainWindow, info) {
  const releaseNotes =
    typeof info.releaseNotes === "string"
      ? info.releaseNotes
      : Array.isArray(info.releaseNotes)
        ? info.releaseNotes.map((n) => n.note || n).join("\n")
        : "";

  const dialogOpts = {
    type: "info",
    buttons: ["Download Update", "Later"],
    defaultId: 0,
    cancelId: 1,
    title: "Update Available",
    message: `A new version of RedlyEA is available!`,
    detail: `Version ${info.version} is ready to download.\n\nCurrent version: ${app.getVersion()}\n\n${releaseNotes ? `What's new:\n${releaseNotes.substring(0, 500)}` : ""}`,
  };

  dialog.showMessageBox(mainWindow, dialogOpts).then((result) => {
    if (result.response === 0) {
      // User clicked "Download Update"
      autoUpdater.downloadUpdate();
    }
  });
}

/**
 * Show dialog when update has been downloaded.
 */
function showUpdateDownloadedDialog(mainWindow, info) {
  const dialogOpts = {
    type: "info",
    buttons: ["Restart Now", "Later"],
    defaultId: 0,
    cancelId: 1,
    title: "Update Ready",
    message: "Update downloaded!",
    detail: `Version ${info.version} has been downloaded and is ready to install.\n\nThe app will restart to complete the update.`,
  };

  dialog.showMessageBox(mainWindow, dialogOpts).then((result) => {
    if (result.response === 0) {
      // User clicked "Restart Now" — silent install + force relaunch.
      // Let quitAndInstall handle window closing natively (no manual destroy).
      autoUpdater.quitAndInstall(true, true);
    }
  });
}

/**
 * Show dialog for manual update check (from menu).
 */
async function checkForUpdatesInteractive(mainWindow) {
  if (!autoUpdater) {
    dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Updates",
      message: "Auto-updates are not available in development mode.",
    });
    return;
  }

  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result || !result.updateInfo) {
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "No Updates",
        message: "You're running the latest version!",
        detail: `Current version: ${app.getVersion()}`,
      });
    }
    // If update is available, the 'update-available' event will trigger the dialog
  } catch (err) {
    dialog.showMessageBox(mainWindow, {
      type: "error",
      title: "Update Check Failed",
      message: "Could not check for updates.",
      detail: err.message,
    });
  }
}

module.exports = {
  initAutoUpdater,
  checkForUpdates,
  checkForUpdatesInteractive,
};
