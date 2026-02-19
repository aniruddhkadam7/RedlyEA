#!/usr/bin/env node

/**
 * Validate that the build output exists and contains the expected files
 * Run this before electron-builder to ensure the build succeeded
 */

const fs = require("fs");
const path = require("path");

const REQUIRED_DIRS = ["dist", "electron"];
const REQUIRED_FILES = ["dist/index.html", "electron/main.js", "package.json"];

let hasErrors = false;

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  Validating build output...");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

// Check for required directories
for (const dir of REQUIRED_DIRS) {
  const dirPath = path.join(process.cwd(), dir);
  if (!fs.existsSync(dirPath)) {
    console.error(`❌ Missing directory: ${dir}`);
    hasErrors = true;
  } else {
    const stats = fs.statSync(dirPath);
    const files = fs.readdirSync(dirPath);
    console.log(`✅ ${dir} exists (${files.length} items)`);
  }
}

// Check for required files
for (const file of REQUIRED_FILES) {
  const filePath = path.join(process.cwd(), file);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Missing file: ${file}`);
    hasErrors = true;
  } else {
    const stats = fs.statSync(filePath);
    const sizeKb = (stats.size / 1024).toFixed(2);
    console.log(`✅ ${file} exists (${sizeKb} KB)`);
  }
}

// Check dist directory has substantial content (not empty or nearly empty)
try {
  const distPath = path.join(process.cwd(), "dist");
  if (fs.existsSync(distPath)) {
    const distFiles = fs
      .readdirSync(distPath, { recursive: true })
      .filter((f) => {
        const filePath = path.join(distPath, f);
        return fs.statSync(filePath).isFile();
      });

    if (distFiles.length < 10) {
      console.error(
        `⚠️  dist directory has very few files (${distFiles.length}). Build might be incomplete.`,
      );
      hasErrors = true;
    } else {
      console.log(`✅ dist directory has ${distFiles.length} files`);
    }
  }
} catch (err) {
  console.error(`❌ Error checking dist directory: ${err.message}`);
  hasErrors = true;
}

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

if (hasErrors) {
  console.error("\n❌ Build validation FAILED");
  console.error("\nPossible causes:");
  console.error("  1. The build step (npm run build) may have failed");
  console.error("  2. The build output directory is corrupt or incomplete");
  console.error("  3. File system issues or missing dependencies");
  console.error("\nTo fix:");
  console.error('  1. Run "npm run build" separately to check for errors');
  console.error(
    "  2. Delete dist/ and node_modules/ and reinstall dependencies",
  );
  console.error("  3. Check available disk space");
  process.exit(1);
} else {
  console.log(
    "✅ Build validation PASSED - safe to proceed with electron-builder\n",
  );
  process.exit(0);
}
