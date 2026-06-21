// 今日总结独立窗口：从主进程取走悬浮窗算好的 payload 并展示。
// payload 结构（由 timer.js buildSummaryPayload 生成）：
//   { mode, emoji, title, sub, rows:[[k,v,gold],...], reward, closeLabel, thenQuit }

let thenQuit = false;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function render(p) {
  if (!p) return;
  thenQuit = !!p.thenQuit;
  document.getElementById('ce-emoji').textContent = p.emoji || '🌙';
  document.getElementById('ce-title').textContent = p.title || '今天收工啦';
  document.getElementById('ce-sub').textContent = p.sub || '';
  document.getElementById('ce-stats').innerHTML = (p.rows || []).map(([k, v, gold]) =>
    `<div class="ce-row"><span class="k">${escapeHtml(k)}</span><span class="v${gold ? ' gold' : ''}">${escapeHtml(v)}</span></div>`
  ).join('');
  document.getElementById('ce-reward').textContent = p.reward || '';
  document.getElementById('ce-close').textContent = p.closeLabel || '好的';
  if (p.mode === 'plan') fireConfetti(240), playDing(true);
  else fireConfetti(140);
}

// ---------- 提示音（Web Audio，无需音频文件，移植自 timer.js）----------
let audioCtx = null;
function playDing(bigger = false) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = bigger ? [784, 988, 1319] : [880, 1175];
    notes.forEach((freq, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      const t = audioCtx.currentTime + i * 0.14;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t); o.stop(t + 0.55);
    });
  } catch (e) { /* 忽略音频错误 */ }
}

// ---------- 撒花（移植自 timer.js）----------
const canvas = document.getElementById('confetti');
const ctx = canvas.getContext('2d');
let particles = [];
function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
function fireConfetti(count = 140) {
  const colors = ['#DF6F21', '#D38D4F', '#FDDDAA', '#C2A489', '#f0a25a'];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: canvas.width / 2, y: canvas.height / 3,
      vx: (Math.random() - 0.5) * 8, vy: Math.random() * -7 - 2, g: 0.18,
      size: Math.random() * 5 + 3, color: colors[(Math.random() * colors.length) | 0],
      life: 90 + Math.random() * 40, rot: Math.random() * 6
    });
  }
}
function confettiLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles = particles.filter(p => p.life > 0);
  for (const p of particles) {
    p.vy += p.g; p.x += p.vx; p.y += p.vy; p.life--; p.rot += 0.2;
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.fillStyle = p.color; ctx.globalAlpha = Math.min(1, p.life / 40);
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    ctx.restore();
  }
  requestAnimationFrame(confettiLoop);
}
confettiLoop();

// ---------- 关闭 ----------
document.getElementById('ce-close').addEventListener('click', () => {
  window.api.closeSummary(thenQuit);
});
// Enter 也可关闭
window.addEventListener('keydown', (e) => { if (e.key === 'Enter') window.api.closeSummary(thenQuit); });

async function init() {
  try { render(await window.api.loadSummary()); }
  catch (e) { /* 取不到数据就保留默认占位 */ }
}
init();
