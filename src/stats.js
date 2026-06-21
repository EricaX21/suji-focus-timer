const HOUR_MS = 3600 * 1000;
const GOLD_STREAK_MS = 2 * HOUR_MS;

function fmtDur(ms) {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h > 0) return `${h}小时${mm}分`;
  return `${mm}分`;
}
function fmtTime(iso) {
  if (!iso) return '进行中';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function render() {
  const today = await window.api.todayStr();
  const data = await window.api.loadDay(today);

  document.getElementById('date').textContent = data.date;
  document.getElementById('total').textContent = fmtDur(data.totalFocusedMs);
  const pct = Math.min(100, (data.totalFocusedMs / (data.goalHours * HOUR_MS)) * 100);
  document.getElementById('goal').textContent = `${pct.toFixed(0)}%`;
  const streakTxt = fmtDur(data.longestStreakMs);
  document.getElementById('streak').innerHTML =
    data.longestStreakMs >= GOLD_STREAK_MS
      ? `<i data-lucide="trophy" class="medal"></i> ${streakTxt}` : streakTxt;
  document.getElementById('pauses').textContent = data.pauses.length;

  await renderPlanInfo();
  renderHourlyChart(data);
  renderCategories(data);
  renderSessions(data);
  renderArchives(data);
  try { if (window.lucide) window.lucide.createIcons(); } catch (e) { /* 图标库缺失不影响数据展示 */ }
  syncCardsHeight();
}

// 计划进度：第 N/X 天 · 连续 K 天 · 🎁奖励
async function renderPlanInfo() {
  const el = document.getElementById('plan-info');
  let plan = null;
  try { plan = await window.api.loadPlan(); } catch (e) { plan = null; }
  if (!plan) { el.style.display = 'none'; return; }
  el.style.display = '';
  const nameTxt = plan.name ? `「${escapeHtml(plan.name)}」 ` : '';
  const dayTxt = plan.oneShot ? '仅此一次' : `第 <b>${Math.min(plan.dayIndex, plan.totalDays)}/${plan.totalDays}</b> 天`;
  const streakTxt = plan.currentStreak > 0 ? ` · 连续 <b>${plan.currentStreak}</b> 天` : '';
  const qTxt = (typeof plan.quality === 'number' && !plan.oneShot) ? ` · 完成度 <b>${plan.quality}%</b>` : '';
  const reward = plan.reward ? ` · <span class="reward">🎁 ${escapeHtml(plan.reward)}</span>` : '';
  const doneTxt = plan.planDone ? ' · ✅ 计划已完成' : '';
  el.innerHTML = `${nameTxt}${dayTxt}${streakTxt}${qTxt}${reward}${doneTxt}`;
}

// ---------- 每小时产出折线图 ----------
// 把每段 [start,end] 按时钟小时切分累加 → 每小时专注毫秒
function hourlyMinutes(data) {
  const hourly = new Array(24).fill(0);
  for (const s of (data.sessions || [])) {
    if (!s.start || !s.end) continue;
    let a = new Date(s.start).getTime();
    const b = new Date(s.end).getTime();
    while (a < b) {
      const d = new Date(a);
      const hourEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1, 0, 0, 0).getTime();
      hourly[d.getHours()] += Math.min(b, hourEnd) - a;
      a = hourEnd;
    }
  }
  return hourly.map(ms => ms / 60000); // 分钟
}

function renderHourlyChart(data) {
  const wrap = document.getElementById('hour-chart');
  const mins = hourlyMinutes(data);
  let minH = -1, maxH = -1;
  for (let h = 0; h < 24; h++) { if (mins[h] > 0) { if (minH < 0) minH = h; maxH = h; } }
  if (minH < 0) {
    wrap.innerHTML = '<div class="empty">今天还没有专注记录</div>';
    return;
  }
  // 两端各留 1 小时让折线不贴边
  minH = Math.max(0, minH - 1);
  maxH = Math.min(23, maxH + 1);

  const W = 640, H = 220, ml = 34, mr = 12, mt = 12, mb = 26;
  const n = maxH - minH + 1;
  const xAt = (i) => ml + (n === 1 ? (W - ml - mr) / 2 : i / (n - 1) * (W - ml - mr));
  const yAt = (m) => H - mb - Math.min(60, m) / 60 * (H - mt - mb);

  let grid = '';
  [0, 30, 60].forEach(v => {
    const y = yAt(v);
    grid += `<line class="hc-grid" x1="${ml}" y1="${y.toFixed(1)}" x2="${W - mr}" y2="${y.toFixed(1)}"/>`;
    grid += `<text class="hc-axis" x="${ml - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end">${v}</text>`;
  });

  const pts = [];
  let xlabels = '';
  for (let i = 0; i < n; i++) {
    const h = minH + i;
    pts.push([xAt(i), yAt(mins[h])]);
    // X 轴每个小时标一个（点多时隔一个标，避免拥挤）
    if (n <= 12 || i % 2 === 0) {
      xlabels += `<text class="hc-axis" x="${xAt(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${h}</text>`;
    }
  }
  const lineD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const areaD = `M${xAt(0).toFixed(1)},${(H - mb).toFixed(1)} ` +
    pts.map(p => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') +
    ` L${xAt(n - 1).toFixed(1)},${(H - mb).toFixed(1)} Z`;
  let dots = '';
  for (let i = 0; i < n; i++) {
    const h = minH + i;
    dots += `<circle class="hc-dot" cx="${pts[i][0].toFixed(1)}" cy="${pts[i][1].toFixed(1)}" r="3.2">` +
      `<title>${String(h).padStart(2, '0')}:00  ${Math.round(mins[h])} 分钟</title></circle>`;
  }

  wrap.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">` +
    grid +
    `<path class="hc-area" d="${areaD}"/>` +
    `<path class="hc-line" d="${lineD}"/>` +
    dots + xlabels +
    `</svg>`;
}

// ---------- 内容分类（可展开看各应用） ----------
const CAT_BASE = {
  video: { name: '🎬 看视频 / 网课', shades: ['#DF6F21', '#c25e18', '#f0a25a', '#a84f12', '#e88840', '#8f420d'] },
  client: { name: '💬 客户沟通', shades: ['#C2A489', '#a98968', '#d8c0a4', '#8f7252', '#e0cdb4', '#766049'] },
  other: { name: '📝 其他工作/学习', shades: ['#FDDDAA', '#e8c98e', '#d4b46f', '#f5e6c4', '#c9a85e', '#b89248'] }
};

function renderCategories(data) {
  const wrap = document.getElementById('cat-breakdown');
  wrap.innerHTML = '';
  const cats = data.categories || { video: 0, client: 0, other: 0 };
  const byCat = data.appsByCat || { video: {}, client: {}, other: {} };
  const order = ['video', 'client', 'other'];
  const total = order.reduce((s, k) => s + (cats[k] || 0), 0);
  if (total === 0) {
    wrap.innerHTML = '<div class="empty">还没有分类数据（开始专注后自动统计）</div>';
    return;
  }
  for (const key of order) {
    const ms = cats[key] || 0;
    if (ms <= 0) continue;
    const pct = ms / total * 100;
    const base = CAT_BASE[key];
    const apps = Object.keys(byCat[key] || {})
      .map(t => ({ name: t, ms: byCat[key][t] || 0 }))
      .filter(a => a.ms > 0)
      .sort((a, b) => b.ms - a.ms);
    const hasApps = apps.length > 0;

    // 主条：按应用堆叠的多色段（深浅区分）
    let seg = '';
    apps.forEach((a, i) => {
      seg += `<span class="seg" style="width:${(a.ms / ms * 100).toFixed(2)}%;background:${base.shades[i % base.shades.length]}" title="${escapeHtml(a.name)} ${fmtDur(a.ms)}"></span>`;
    });
    if (!hasApps) seg = `<span class="seg" style="width:100%;background:${base.shades[0]}"></span>`;

    const row = document.createElement('div');
    row.className = 'cat-row';
    row.innerHTML =
      `<div class="cat-head">` +
      `<span class="cat-name">${hasApps ? '<span class="chev">▸</span>' : '<span class="chev"></span>'}${base.name}</span>` +
      `<span class="cat-val">${fmtDur(ms)} · ${pct.toFixed(0)}%</span></div>` +
      `<div class="cat-track"><div class="cat-fill" style="width:${pct}%">${seg}</div></div>` +
      `<div class="cat-apps" style="display:none"></div>`;

    // 展开明细：每个应用一条深浅细分条
    const det = row.querySelector('.cat-apps');
    apps.forEach((a, i) => {
      const w = a.ms / ms * 100;
      const ar = document.createElement('div');
      ar.className = 'app-row';
      ar.innerHTML =
        `<div class="app-head"><span>${escapeHtml(a.name)}</span><span>${fmtDur(a.ms)} · ${w.toFixed(0)}%</span></div>` +
        `<div class="cat-track sm"><div class="cat-fill" style="width:${w.toFixed(2)}%;background:${base.shades[i % base.shades.length]}"></div></div>`;
      det.appendChild(ar);
    });

    if (hasApps) {
      const head = row.querySelector('.cat-head');
      head.style.cursor = 'pointer';
      head.addEventListener('click', () => {
        const open = det.style.display === 'none';
        det.style.display = open ? '' : 'none';
        row.querySelector('.chev').textContent = open ? '▾' : '▸';
      });
    }
    wrap.appendChild(row);
  }
}

// 已清除归档的早先记录
function renderArchives(data) {
  const tab = document.getElementById('tab-arch');
  const sec = document.getElementById('sec-arch');
  const list = document.getElementById('archives');
  const arr = data.archives || [];
  if (!arr.length) { sec.style.display = 'none'; tab.style.display = 'none'; return; }
  sec.style.display = ''; tab.style.display = '';
  list.innerHTML = '';
  arr.forEach((a, i) => {
    const real = (a.sessions || []).filter(s => s.durationMs > 0);
    const start = real.length ? real[0].start : null;
    const end = real.length ? real[real.length - 1].end : null;
    const div = document.createElement('div');
    div.className = 'arch-row';
    div.innerHTML =
      `<span class="arch-idx">第 ${i + 1} 段</span>` +
      `<span class="arch-dur">${fmtDur(a.totalFocusedMs)}</span>` +
      `<span class="arch-time">${start ? fmtTime(start) : '—'}${end ? ' – ' + fmtTime(end) : ''}</span>`;
    list.appendChild(div);
  });
}

function renderSessions(data) {
  const tbody = document.getElementById('session-rows');
  tbody.innerHTML = '';
  const real = data.sessions.filter(s => s.durationMs > 0);
  if (real.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">还没有专注记录</td></tr>';
    return;
  }
  real.forEach((s, i) => {
    const tr = document.createElement('tr');
    const gold = s.durationMs >= GOLD_STREAK_MS ? ' <i data-lucide="trophy" class="medal"></i>' : '';
    tr.innerHTML =
      `<td>${i + 1}</td><td>${fmtTime(s.start)}</td><td>${fmtTime(s.end)}</td>` +
      `<td class="dur">${fmtDur(s.durationMs)}${gold}</td>`;
    tbody.appendChild(tr);
  });
}

// ---------- 吸顶看板高度 + 左标签栏（点击滚动 + 滚动高亮） ----------
function syncCardsHeight() {
  const cards = document.getElementById('cards');
  if (cards) document.documentElement.style.setProperty('--cards-h', cards.getBoundingClientRect().height + 'px');
}
function setupTabs() {
  const links = [...document.querySelectorAll('#tabs a')];
  links.forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const sec = document.getElementById(a.dataset.target);
      if (sec && sec.style.display !== 'none') sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  // 滚动高亮当前段
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        const id = en.target.id;
        links.forEach(a => a.classList.toggle('active', a.dataset.target === id));
      }
    });
  }, { rootMargin: '-30% 0px -60% 0px', threshold: 0 });
  ['sec-timeline', 'sec-cat', 'sec-sessions', 'sec-arch'].forEach(id => {
    const el = document.getElementById(id);
    if (el) obs.observe(el);
  });
}

render();
setupTabs();
window.addEventListener('resize', syncCardsHeight);
setInterval(render, 5000); // 实时刷新
