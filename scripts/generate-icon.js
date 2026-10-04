const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '..', 'build');
const svgPath = path.join(buildDir, 'icon.svg');
const sizes = [16, 32, 48, 64, 128, 256, 512];

async function generateIcons() {
  console.log('Generating icons from SVG...');

  // Generate PNG at 512px (for electron-builder to auto-convert to ICO)
  const png512 = await sharp(svgPath)
    .resize(512, 512)
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(buildDir, 'icon.png'), png512);
  console.log('  ✓ icon.png (512x512)');

  // Generate individual PNGs for various sizes
  for (const size of sizes) {
    const buf = await sharp(svgPath)
      .resize(size, size)
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(buildDir, `icon-${size}.png`), buf);
    console.log(`  ✓ icon-${size}.png (${size}x${size})`);
  }

  // Tray icon (32px)
  fs.copyFileSync(path.join(buildDir, 'icon-32.png'), path.join(buildDir, 'tray.png'));
  console.log('  ✓ tray.png (32x32)');

  console.log('\nAll icons generated!');
}

generateIcons().catch(console.error);
