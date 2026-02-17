const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const TARGET_DIRS = [
  path.join(ROOT, 'public', 'icons', 'explorer'),
  path.join(ROOT, 'public', 'rendering', 'archimate-icons'),
];

const walk = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
};

const toPng = async (svgFile) => {
  const pngFile = svgFile.replace(/\.svg$/i, '.png');
  const svgBuffer = fs.readFileSync(svgFile);
  await sharp(svgBuffer)
    .resize(18, 18, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, quality: 100 })
    .toFile(pngFile);
  return pngFile;
};

(async () => {
  const svgFiles = TARGET_DIRS.filter((dir) => fs.existsSync(dir))
    .flatMap((dir) => walk(dir))
    .filter((file) => /\.svg$/i.test(file));

  let count = 0;
  for (const svgFile of svgFiles) {
    await toPng(svgFile);
    count += 1;
  }

  console.log(`Generated ${count} PNG icons from SVG sources.`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
