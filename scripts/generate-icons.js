/**
 * Icon generation helper for electron-builder file associations.
 *
 * Generates:
 *   build/icons/icon.ico        — Multi-size ICO (Windows app icon)
 *   build/icons/icon.icns       — 512×512 ICNS (macOS app icon)
 *   build/icons/icon.png        — 512×512 PNG fallback (Linux)
 *   build/icons/eapkg-icon.ico  — Document type icon (Windows .eapkg association)
 *   build/icons/eapkg-icon.icns — Document type icon (macOS .eapkg association)
 *
 * Prerequisites:
 *   - Requires `sharp` and `png-to-ico` packages
 *   - For .icns on macOS: uses built-in `iconutil` (no extra deps)
 *   - For .icns on Windows/Linux: skip (builder can use .ico fallback)
 *
 * Usage:
 *   node scripts/generate-icons.js
 */

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const SRC_512 = path.join(ROOT, "public", "icons", "icon-512x512.png");
const OUT_DIR = path.join(ROOT, "build", "icons");
const TEMP_DIR = path.join(OUT_DIR, "temp");

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(TEMP_DIR, { recursive: true });

// --- PNG copy (always works) ---
fs.copyFileSync(SRC_512, path.join(OUT_DIR, "icon.png"));
fs.copyFileSync(SRC_512, path.join(OUT_DIR, "eapkg-icon.png"));
console.log("✓ Copied icon.png and eapkg-icon.png");

// --- ICO generation with multiple sizes for NSIS compatibility ---
const generateIco = async () => {
  try {
    const sharp = (await import("sharp")).default;
    const pngToIco = await import("png-to-ico");
    const convert = pngToIco.default || pngToIco;

    // Generate multiple sizes required for proper ICO
    const sizes = [16, 24, 32, 48, 64, 128, 256];
    const pngPaths = [];

    for (const size of sizes) {
      const outPath = path.join(TEMP_DIR, `icon-${size}.png`);
      await sharp(SRC_512)
        .resize(size, size, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toFile(outPath);
      pngPaths.push(outPath);
    }

    // Create multi-size ICO from all PNG sizes
    const icoBuf = await convert(pngPaths);
    fs.writeFileSync(path.join(OUT_DIR, "icon.ico"), icoBuf);
    fs.writeFileSync(path.join(OUT_DIR, "eapkg-icon.ico"), icoBuf);

    // Cleanup temp files
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });

    console.log("✓ Generated icon.ico and eapkg-icon.ico (multi-size)");
  } catch (err) {
    console.warn("⚠ ICO generation failed:", err.message);
    console.warn("  Attempting fallback with png-to-ico only...");
    try {
      const pngToIco = await import("png-to-ico");
      const convert = pngToIco.default || pngToIco;
      const icoBuf = await convert([SRC_512]);
      fs.writeFileSync(path.join(OUT_DIR, "icon.ico"), icoBuf);
      fs.writeFileSync(path.join(OUT_DIR, "eapkg-icon.ico"), icoBuf);
      console.log("✓ Generated icon.ico (single-size fallback)");
    } catch (e) {
      console.warn("⚠ Fallback ICO generation also failed:", e.message);
    }
  }
};

generateIco().then(() => {
  // --- ICNS generation (macOS only via iconutil) ---
  if (process.platform === "darwin") {
    try {
      const iconset = path.join(OUT_DIR, "icon.iconset");
      fs.mkdirSync(iconset, { recursive: true });
      const sizes = [16, 32, 64, 128, 256, 512];
      // sips is available on macOS
      for (const s of sizes) {
        execSync(
          `sips -z ${s} ${s} "${SRC_512}" --out "${path.join(iconset, `icon_${s}x${s}.png`)}"`,
          { stdio: "ignore" },
        );
        execSync(
          `sips -z ${s * 2} ${s * 2} "${SRC_512}" --out "${path.join(iconset, `icon_${s}x${s}@2x.png`)}"`,
          { stdio: "ignore" },
        );
      }
      execSync(
        `iconutil -c icns "${iconset}" -o "${path.join(OUT_DIR, "icon.icns")}"`,
        { stdio: "ignore" },
      );
      fs.copyFileSync(
        path.join(OUT_DIR, "icon.icns"),
        path.join(OUT_DIR, "eapkg-icon.icns"),
      );
      fs.rmSync(iconset, { recursive: true, force: true });
      console.log("✓ Generated icon.icns and eapkg-icon.icns");
    } catch (e) {
      console.warn("⚠ ICNS generation failed:", e.message);
    }
  } else {
    console.log(
      "ℹ ICNS generation skipped (not macOS). electron-builder will use PNG fallback.",
    );
  }

  console.log("\nDone. Icons written to build/icons/");
});
