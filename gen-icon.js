// 生成"橙色眼睛"图标 SVG，并渲染成多尺寸 icon.ico / icon.png
const sharp = require('sharp');
const _ico = require('png-to-ico');
const pngToIco = _ico.default || _ico;
const fs = require('fs');
const path = require('path');

const ORANGE = '#f3742a';
const BG = '#161616';
const cx = 256, cy = 258;

// 放射状刻度（16 根，指向圆心）
function ticks() {
  const n = 16, rin = 90, rout = 110, out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x1 = cx + Math.cos(a) * rin, y1 = cy + Math.sin(a) * rin;
    const x2 = cx + Math.cos(a) * rout, y2 = cy + Math.sin(a) * rout;
    out.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`);
  }
  return out.join('\n      ');
}

const svg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="512" height="512" rx="112" fill="${BG}"/>
  <g fill="none" stroke="${ORANGE}" stroke-width="15" stroke-linejoin="round" stroke-linecap="round">

    <!-- 眼睛杏仁轮廓 -->
    <path d="M 70 258 Q 256 70 442 258 Q 256 446 70 258 Z" stroke-linejoin="miter"/>

    <!-- 内眼角折线 -->
    <path d="M 150 200 Q 108 258 150 316" stroke-width="13"/>
    <path d="M 362 200 Q 404 258 362 316" stroke-width="13"/>

    <!-- 虹膜外环 -->
    <circle cx="${cx}" cy="${cy}" r="132" stroke-width="15"/>
    <!-- 瞳孔环 -->
    <circle cx="${cx}" cy="${cy}" r="74" stroke-width="14"/>

    <!-- 放射刻度 -->
    <g stroke-width="9" stroke-linecap="round">
      ${ticks()}
    </g>
  </g>

  <!-- 月牙瞳孔 -->
  <g>
    <circle cx="${cx - 6}" cy="${cy + 8}" r="56" fill="${ORANGE}"/>
    <circle cx="${cx + 22}" cy="${cy - 12}" r="48" fill="${BG}"/>
  </g>
</svg>
`;

(async () => {
  fs.writeFileSync(path.join(__dirname, 'icon.svg'), svg);
  const buf = Buffer.from(svg);
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = [];
  for (const s of sizes) pngs.push(await sharp(buf).resize(s, s).png().toBuffer());
  fs.writeFileSync(path.join(__dirname, 'icon.ico'), await pngToIco(pngs));
  fs.writeFileSync(path.join(__dirname, 'icon.png'), await sharp(buf).resize(256, 256).png().toBuffer());
  console.log('eye icon written');
})().catch(e => { console.error(e); process.exit(1); });
