const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'index.html');
const outputDir = path.join(root, 'www');

if (!fs.existsSync(source)) {
  console.error('Could not find index.html in the repository root.');
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });
fs.copyFileSync(source, path.join(outputDir, 'index.html'));
fs.copyFileSync(path.join(root, 'manifest.webmanifest'), path.join(outputDir, 'manifest.webmanifest'));
for (const dir of ['fonts', 'icons', 'js', 'vendor']) {
  fs.cpSync(path.join(root, dir), path.join(outputDir, dir), { recursive: true });
}
console.log('Prepared www/ (index.html, manifest, fonts, icons, js, vendor).');
