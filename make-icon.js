// 把 icon.svg 渲染成多尺寸 icon.ico（打包用）
const sharp = require('sharp');
const _ico = require('png-to-ico');
const pngToIco = _ico.default || _ico;
const fs = require('fs');
const path = require('path');

(async () => {
  const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'));
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = [];
  for (const s of sizes) {
    pngs.push(await sharp(svg).resize(s, s).png().toBuffer());
  }
  const ico = await pngToIco(pngs);
  fs.writeFileSync(path.join(__dirname, 'icon.ico'), ico);
  fs.writeFileSync(path.join(__dirname, 'icon.png'), await sharp(svg).resize(256, 256).png().toBuffer());
  console.log('icon.ico (' + ico.length + ' bytes) + icon.png written');
})().catch(e => { console.error(e); process.exit(1); });
