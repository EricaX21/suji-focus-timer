// 直接用原图生成图标：裁白边 -> 正方形 -> 圆角透明遮罩 -> 多尺寸 .ico
const sharp = require('sharp');
const _ico = require('png-to-ico');
const pngToIco = _ico.default || _ico;
const fs = require('fs');
const path = require('path');

const SRC = 'D:\\Users\\Downloads\\ChatGPT Image 2026年6月13日 17_43_01.png';
const SIZE = 512;
const RADIUS = 96; // 圆角半径（在 512 画布上），需与原图圆角匹配

(async () => {
  // 1) 裁掉四周白边，强制成正方形
  const trimmed = await sharp(SRC).trim({ threshold: 30 }).toBuffer();
  const square = await sharp(trimmed).resize(SIZE, SIZE, { fit: 'fill' }).toBuffer();

  // 2) 圆角透明遮罩
  const mask = Buffer.from(
    `<svg width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" rx="${RADIUS}" ry="${RADIUS}" fill="#fff"/></svg>`
  );
  const rounded = await sharp(square)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  // 3) 输出预览 + 多尺寸 ico
  fs.writeFileSync(path.join(__dirname, 'icon.png'), rounded);
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = [];
  for (const s of sizes) pngs.push(await sharp(rounded).resize(s, s).png().toBuffer());
  fs.writeFileSync(path.join(__dirname, 'icon.ico'), await pngToIco(pngs));
  console.log('icon.ico built from original image');
})().catch(e => { console.error(e); process.exit(1); });
