// 安全引用 lucide：即使打包后图标资源缺失，也只是图标不显示，绝不让整个界面卡死
const LU = window.lucide || null;
function luCreate(name) {
  try { return LU && LU[name] ? LU.createElement(LU[name]) : null; }
  catch (e) { return null; }
}
function luRender() { try { if (LU) LU.createIcons(); } catch (e) { /* 忽略 */ } }

const HOUR_MS = 3600 * 1000;
const SAMPLE_MS = 5000; // 每 5 秒采样一次前台窗口做内容分类
const GOLD_STREAK_MS = 2 * HOUR_MS; // 单段连续专注 ≥ 2h 算金牌级

let data = null;
let running = false;
let runStartEpoch = 0;   // 当前运行段的起点（Date.now）
let curIdx = -1;         // 进行中的 session 在 data.sessions 里的下标
let lastMilestone = 0;   // 已点亮到第几个整点小时
let goalDone = false;
let restStartEpoch = 0;  // 休息计时起点（暂停时启动）
let userResized = false; // 用户是否手动拉伸过窗口（拉伸后不再自动按内容改高）
let overLimit = false;   // 是否已超过 14 小时上限（进入劝退态）
let overStartEpoch = 0;  // 超过 14h 的起点（用于"数字继续走但不计入"）
let lastFlagTotal = 0;   // 上次插暂停旗时的累计专注（防短期密集插旗）
let planState = null;    // 当前计划（含派生进度）
let launchState = 'no-goal'; // 'has-goal' | 'no-goal' | 'failed'：决定暂停态大按钮文案与点击行为
let lastBucket = 'other';// 最近一次采样的粗类（分神判定豁免"看视频"用）
// 分神检测状态
let idleSettings = { idleEnabled: true, idleMinutes: 5, idleRemind: true };
let idleRemind = true;   // 本日运行期"是否还要再提醒"（与设置同步）
let distractShown = false; // 分神弹窗是否正显示
let idleHandled = false;   // 本轮空闲是否已处理（恢复键鼠后重置，避免连环弹）
let ceremonyThenQuit = false; // 仪式总结卡关闭时是否退出应用（退出场景 true / 计划庆祝 false）
let lastRestTipBlock = 0;  // 已提醒到第几个"连续 2h"块（单段内，暂停/开始重置）
const MAX_HOURS = 14;    // 徽章 / 目标 / 有效专注的上限（与窗口宽度匹配）
const IDLE_CHECK_MS = 15000;     // 分神检测轮询间隔
const REST_TIP_MS = 2 * HOUR_MS; // 连续专注每满 2 小时提醒休息
const FLAG_MIN_GAP_MS = 60000; // 两面暂停旗之间至少 60s 有效专注，否则不插（防狂点）
const FLAG_MAX_PER_HOUR = 12;  // 每小时浓缩条最多 12 面暂停旗（兜底）

// 状态眼睛图标：睁眼=上眼睑+虹膜+上睫毛（专注）/ 闭眼=同一条下弧线+下睫毛（暂停）。
// 两态共用 viewBox 0 0 120 90 与同一条下弧线 M15,39 c30,20,60,20,90,0（不动支点），
// 切换时只有上眼睑/虹膜起落 → 产生「眨眼」开合感。颜色走 currentColor，由 timer.css 给色。
const EYE_OPEN = '<svg width="26" height="18" viewBox="0 0 120 90" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M15 39 c30 20 60 20 90 0"/><path d="M15 39 c30 -20 60 -20 90 0"/><circle cx="60" cy="39" r="12.75" stroke-width="6"/><circle cx="60" cy="39" r="5" fill="currentColor" stroke="none"/><path d="M37.5 26.25 l-6 -15"/><path d="M60 22.5 V6.75"/><path d="M82.5 26.25 l6 -15"/></svg>';
const EYE_CLOSED = '<svg width="26" height="18" viewBox="0 0 120 90" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M15 39 c30 20 60 20 90 0"/><path d="M37.5 50 l-6 15"/><path d="M60 54 V69"/><path d="M82.5 50 l6 15"/></svg>';
function updateEye(open) {
  const el = document.getElementById('status-eye');
  if (el) el.innerHTML = open ? EYE_OPEN : EYE_CLOSED;
}

// 休息计时（暂停时从 0 起算）
function showRest() {
  const r = document.getElementById('rest-time');
  r.style.opacity = '1';   // 瞬时显示，无动画
  restStartEpoch = Date.now();
  updateRest();
}
function hideRest() {
  const r = document.getElementById('rest-time');
  r.style.opacity = '0';   // 瞬时隐藏，无动画
  restStartEpoch = 0;
}
function fmtRest(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${m}:${ss}` : `${m}:${ss}`;
}
function updateRest() {
  if (!restStartEpoch) return;
  const el = document.getElementById('rest-clock');
  if (el) el.textContent = fmtRest(Date.now() - restStartEpoch);
}

// ---------- 工具 ----------
const nowISO = () => new Date().toISOString();

function liveTotalMs() {
  if (overLimit) return MAX_HOURS * HOUR_MS; // 超额后"有效专注"封顶在 14h（徽章/里程碑/复盘用）
  return data.totalFocusedMs + (running ? Date.now() - runStartEpoch : 0);
}
// 中央显示用的时间：超额态下数字继续往上走（但不计入有效专注）
function displayTotalMs() {
  if (overLimit) return MAX_HOURS * HOUR_MS + (Date.now() - overStartEpoch);
  return liveTotalMs();
}
function liveSessionMs() {
  if (!running || curIdx < 0) return 0;
  return data.sessions[curIdx].durationMs + (Date.now() - runStartEpoch);
}
function fmtClock(ms) {
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${ss}`;
}

// 把当前运行段的时间结算进数据（滚动提交，防崩溃丢数据）
function commitElapsed() {
  if (!running || curIdx < 0) return;
  const now = Date.now();
  const elapsed = now - runStartEpoch;
  runStartEpoch = now;
  if (overLimit) return; // 超额后不再累计进有效专注、不持久化（数字只在视觉上走）
  data.totalFocusedMs += elapsed;
  const s = data.sessions[curIdx];
  s.durationMs += elapsed;
  s.end = new Date(now).toISOString();
  if (s.durationMs > data.longestStreakMs) data.longestStreakMs = s.durationMs;
}

async function save() {
  await window.api.saveDay(data);
}

// ---------- 开始 / 暂停 ----------
function start() {
  // 关闭上一个未结束的暂停段
  for (let i = data.pauses.length - 1; i >= 0; i--) {
    if (!data.pauses[i].resumeAt) { data.pauses[i].resumeAt = nowISO(); break; }
  }
  data.sessions.push({ start: nowISO(), end: nowISO(), durationMs: 0 });
  curIdx = data.sessions.length - 1;
  runStartEpoch = Date.now();
  running = true;
  lastRestTipBlock = 0; // 新一段连续专注，休息提醒计数归零
  updateEye(true);
  hideRest();   // 休息计时消失
  render();
  setTimeVisibility(); // 顶部小字隐、中央大字显（瞬时，无动画）
  save();
}

function pause() {
  commitElapsed();
  data.pauses.push({ pauseAt: nowISO(), resumeAt: null });
  // 在当前小时浓缩条上记一面白旗（位置 = 本小时已专注的点）。
  // 防短期密集：与上一面旗的有效专注差 < 60s 不插；且每小时最多 12 面。
  const total = data.totalFocusedMs;
  const hourIdx = Math.floor(total / HOUR_MS);
  if (data.currentHour && data.currentHour.hourIdx === hourIdx) {
    const marks = data.currentHour.pauseMarks;
    if ((total - lastFlagTotal) >= FLAG_MIN_GAP_MS && marks.length < FLAG_MAX_PER_HOUR) {
      marks.push(total - hourIdx * HOUR_MS);
      lastFlagTotal = total;
    }
  }
  running = false;
  curIdx = -1;
  lastRestTipBlock = 0; // 暂停即中断连续，休息提醒计数归零
  updateEye(false);
  render();
  // 先 showRest 赋值 restStartEpoch 并显示休息数字，再 setTimeVisibility，
  // 否则 setTimeVisibility 会因 restStartEpoch 还是 0 而误判"未开始"、保留中央计数大字 → 与休息数字重叠。
  showRest();          // 休息计时出现并从 0 起算
  setTimeVisibility(); // 此时正确命中休息分支：中央计数大字隐、总时长缩到左上角
  save();
}

function toggle() {
  if (overLimit) return; // 超额劝退态：不再有"继续专注/休息"之分，按钮失效
  if (goalDone && !running) {
    // 目标已达成，仍允许继续累计
    document.getElementById('goal-celebrate').classList.add('hidden');
  }
  running ? pause() : start();
}

// 大按钮/Enter/快捷键 的统一入口：无目标或上个目标失败 → 先去设定目标；否则正常开始/暂停
function primaryAction() {
  if (overLimit) return;
  if (!running && (launchState === 'no-goal' || launchState === 'failed')) {
    window.api.openOnboard();
    return;
  }
  toggle();
}

// ---------- 奖励 ----------
function checkMilestones() {
  if (overLimit) return; // 已达上限，不再有新里程碑
  const total = liveTotalMs(); // 此时未 overLimit，是真实累计值
  let h = Math.floor(total / HOUR_MS);
  while (h > lastMilestone && lastMilestone < MAX_HOURS) {
    lastMilestone++;
    lightBadge(lastMilestone);
    fireConfetti();
    playDing();                                   // 叮~ 提示音
    window.api.notifyHour(lastMilestone, data.goalHours); // 系统通知（别的软件里也能看到，静音）
    if (lastMilestone >= data.goalHours && !goalDone) {
      goalDone = true;
      celebrateGoal();
      markPlanDayDone(); // 今日达标 → 记入计划连续打卡
    }
  }
  if (total >= MAX_HOURS * HOUR_MS) enterOverLimit(); // 满 14h → 劝退态
}

// 今日达标后，把今天记入计划。若刚好完成整个多天计划，放计划完成大庆祝。
async function markPlanDayDone() {
  try {
    const res = await window.api.markDayComplete();
    if (!res) return;
    planState = res;
    renderPlanLine();
    if (res.justFinishedPlan) celebratePlan(res);
  } catch (e) { /* 忽略 */ }
}

// 进入"超额劝退态"：有效专注封顶 14h，按钮区变劝退提示，眼睛闭上；数字继续走但不计入
function enterOverLimit() {
  if (overLimit) return;
  commitElapsed();                          // 先把到此刻的有效时间结算
  data.totalFocusedMs = MAX_HOURS * HOUR_MS; // 有效专注精确封顶 14h
  overLimit = true;
  overStartEpoch = Date.now();
  save();
  updateEye(false);                         // 眼睛闭上（即使仍 running）
  setToggleButton();                        // 暂停/专注按钮整块替换成劝退提示卡
}

// ---------- 提示音（Web Audio，无需音频文件）----------
let audioCtx = null;
function playDing(bigger = false) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = bigger ? [784, 988, 1319] : [880, 1175]; // 达成目标用更欢快的三连音
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

function lightBadge(n) {
  if (n > MAX_HOURS) return; // 超过 14 不再有徽章（交给超额劝退态）
  let badges = document.querySelectorAll('.badge');
  if (n > badges.length) { // 超额完成：先长出新徽章，再点亮
    buildBadges();
    badges = document.querySelectorAll('.badge');
    if (!userResized) requestAnimationFrame(fitWindow); // 多出徽章可能换行，按内容重新贴合（用户未手动拉伸时）
  }
  const b = badges[n - 1];
  if (b) {
    b.classList.add('lit', 'pop');
    if (data.longestStreakMs >= GOLD_STREAK_MS) b.classList.add('gold');
    if (n > data.goalHours) b.classList.add('over'); // 超额福利徽章
    setTimeout(() => b.classList.remove('pop'), 500);
  }
}

function celebrateGoal() {
  const el = document.getElementById('goal-celebrate');
  el.classList.remove('hidden');
  fireConfetti(180);
  playDing(true);
  setTimeout(() => el.classList.add('hidden'), 6000);
}

// ---------- 收工 / 终止 / 计划完成 仪式 ----------
function fmtDur(ms) {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h > 0 ? `${h} 小时 ${mm} 分` : `${mm} 分`;
}
// 今天用时最多的任务（来自细粒度 apps 累计）
function topTask() {
  const apps = data.apps || {};
  let best = null, bestMs = 0;
  for (const k in apps) { if (apps[k] > bestMs) { bestMs = apps[k]; best = k; } }
  return best ? `${best}（${fmtDur(bestMs)}）` : '—';
}

// 渲染仪式总结卡。mode: 'done'(收工) | 'abort'(终止) | 'plan'(计划完成)
function showCeremony(mode) {
  const total = liveTotalMs();
  const goalPct = Math.min(100, Math.round(total / (data.goalHours * HOUR_MS) * 100));
  const litBadges = Math.min(MAX_HOURS, Math.floor(total / HOUR_MS));

  const emoji = { done: '🌙', abort: '🍵', plan: '🏆' }[mode] || '🌙';
  const title = { done: '今天收工啦', abort: '今天先到这里', plan: '计划全部达成！' }[mode] || '今天收工啦';
  const sub = {
    done: '已经做了很多了，好好休息，明天再战 💪',
    abort: '停下来也没关系，照顾好自己最重要 🤍',
    plan: '你完成了整个计划，这份坚持值得奖励 🎉'
  }[mode] || '';

  document.getElementById('ce-emoji').textContent = emoji;
  document.getElementById('ce-title').textContent = title;
  document.getElementById('ce-sub').textContent = sub;

  const rows = [];
  rows.push(['专注总时长', fmtDur(total), false]);
  rows.push(['目标完成度', `${goalPct}%`, goalPct >= 100]);
  rows.push(['最长连续专注', fmtDur(data.longestStreakMs), data.longestStreakMs >= GOLD_STREAK_MS]);
  rows.push(['点亮徽章', `${litBadges} / ${data.goalHours}`, false]);
  rows.push(['今天主要在', topTask(), false]);
  if (planState && !planState.oneShot) {
    const dayTxt = `第 ${Math.min(planState.dayIndex, planState.totalDays)}/${planState.totalDays} 天 · 连续 ${planState.currentStreak} 天`;
    rows.push(['计划进度', dayTxt, false]);
  }
  document.getElementById('ce-stats').innerHTML = rows.map(([k, v, gold]) =>
    `<div class="ce-row"><span class="k">${k}</span><span class="v${gold ? ' gold' : ''}">${escapeHtml(v)}</span></div>`
  ).join('');

  const rewardEl = document.getElementById('ce-reward');
  if (planState && planState.reward) {
    const reached = mode === 'plan' || goalPct >= 100;
    rewardEl.textContent = reached ? `🎁 兑现奖励：${planState.reward}` : `🎁 目标达成可得：${planState.reward}`;
  } else { rewardEl.textContent = ''; }

  // 关闭按钮文案：退出场景→「退出应用」，计划庆祝→「好的」
  document.getElementById('ce-close').textContent = ceremonyThenQuit ? '退出应用' : '好的';
  document.getElementById('ceremony').classList.remove('hidden');
  fireConfetti(mode === 'plan' ? 240 : 140);
  if (mode === 'plan') playDing(true);
}
function hideCeremony() { document.getElementById('ceremony').classList.add('hidden'); }

// 计划完成大庆祝（首次达成整个多天计划时触发）——关闭只收起、悬浮窗留着
function celebratePlan(res) {
  planState = res;
  renderPlanLine();
  ceremonyThenQuit = false;
  showCeremony('plan');
}

// ---------- 退出流程（智能弹窗，按今日目标做完没分流） ----------
function openExit() {
  // 没有今日目标（无目标 / 上个目标失败）→ 无所谓"完成与否"，直接退出，不弹"目标未完成"
  if (launchState === 'no-goal' || launchState === 'failed') { quitNow(); return; }
  const done = liveTotalMs() >= data.goalHours * HOUR_MS;
  document.getElementById('exit-done').classList.toggle('hidden', !done);
  document.getElementById('exit-undone').classList.toggle('hidden', done);
  if (!done) {
    document.getElementById('exit-undone-desc').textContent =
      `已专注 ${fmtDur(liveTotalMs())} / 目标 ${data.goalHours}h，再坚持一下？`;
  }
  document.getElementById('exit-overlay').classList.remove('hidden');
}
function hideExit() { document.getElementById('exit-overlay').classList.add('hidden'); }
// 真正退出：先结算+保存，再退
function quitNow() { commitElapsed(); save().then(() => window.api.quitApp()); }

// ---------- 渲染 ----------
function buildBadges() {
  const wrap = document.getElementById('badges');
  wrap.innerHTML = '';
  const goal = data.goalHours;
  const doneHours = Math.min(MAX_HOURS, Math.floor(liveTotalMs() / HOUR_MS));
  const count = Math.min(MAX_HOURS, Math.max(goal, doneHours)); // 超额完成时长出新徽章，但封顶 14、永不换两行
  for (let i = 1; i <= count; i++) {
    const b = document.createElement('div');
    b.className = 'badge';
    b.textContent = i;
    if (i <= doneHours) {
      b.classList.add('lit');
      if (data.longestStreakMs >= GOLD_STREAK_MS) b.classList.add('gold');
      if (i > goal) b.classList.add('over'); // 超出原定目标的"额外福利徽章"：鎏金星光描边
    }
    wrap.appendChild(b);
  }
}

// 大按钮图标+文案：仅在状态切换时重建（render 每 250ms 调用，避免重复造 SVG）
let toggleState = null;
function setToggleButton() {
  const btn = document.getElementById('big-toggle');
  btn.innerHTML = '';
  // 超额劝退态：整块按钮变成劝退提示卡（不可点）
  btn.classList.toggle('over-rest', overLimit);
  if (overLimit) {
    const main = document.createElement('span');
    main.className = 'over-main';
    main.textContent = '今天已经可以了';
    const sub = document.createElement('span');
    sub.className = 'over-sub';
    sub.textContent = '今天已经做了很多了；再做下去，很难保证你真的在专注';
    btn.appendChild(main);
    btn.appendChild(sub);
    return;
  }
  // 主行：图标 + 文案
  const mainRow = document.createElement('span');
  mainRow.className = 'bt-main';
  const iconName = running ? 'Pause' : (launchState === 'failed' ? 'RotateCcw' : (launchState === 'no-goal' ? 'Target' : 'Play'));
  const icon = luCreate(iconName);
  if (icon) {
    icon.classList.add('bt-icon');
    mainRow.appendChild(icon);
  } else { // 兜底：图标库缺失时用字符，按钮仍可见可点
    const fb = document.createElement('span');
    fb.className = 'bt-icon';
    fb.textContent = running ? '⏸' : '▶';
    mainRow.appendChild(fb);
  }
  const label = document.createElement('span');
  label.className = 'bt-label';
  label.textContent = running ? '暂停一下，就一下！'
    : (launchState === 'no-goal' ? '开始设定目标'
      : launchState === 'failed' ? '目标已失败，请重新设立目标'
        : '点我开始专注');
  mainRow.appendChild(label);
  btn.appendChild(mainRow);

  // 副行：计划进度 + 奖励（仅有目标/专注中、且有计划、非全屏时显示）
  const sub = document.createElement('span');
  sub.className = 'bt-sub';
  sub.id = 'bt-sub';
  btn.appendChild(sub);
  updateToggleSubline();
}

// 由 launchState 推导（broken→失败；无/已完成/oneShot过期→无目标；其余→有目标）
function computeLaunchState() {
  if (!planState) { launchState = 'no-goal'; return; }
  if (planState.broken) { launchState = 'failed'; return; }
  if (planState.planDone) { launchState = 'no-goal'; return; }
  if (planState.oneShot && !planState.confirmedToday) { launchState = 'no-goal'; return; }
  launchState = 'has-goal';
}
// 大按钮副行：第N/X天 · 连续K天 · 🎁奖励
function updateToggleSubline() {
  const sub = document.getElementById('bt-sub');
  if (!sub) return;
  const showSub = !overLimit && planState && !planState.oneShot && (launchState === 'has-goal' || running) && !document.body.classList.contains('fullscreen');
  if (!showSub) { sub.style.display = 'none'; sub.textContent = ''; return; }
  sub.style.display = '';
  // 只显示计划进度，不显示奖励具体文案（各人奖励长短不一，放按钮里会撑乱尺寸）
  const dayTxt = planState.oneShot ? '仅此一次' : `第 ${Math.min(planState.dayIndex, planState.totalDays)}/${planState.totalDays} 天`;
  const streakTxt = planState.currentStreak > 0 ? ` · 连续 ${planState.currentStreak} 天` : '';
  sub.textContent = `${dayTxt}${streakTxt}`;
}

// 设定中央大数字 / 顶部小数字的静态可见性（无动画，用于 init、动画收尾、全屏切换）
function setTimeVisibility() {
  const focus = document.getElementById('focus-time');
  const mini = document.getElementById('mini-focus');
  if (!focus || !mini) return;
  focus.style.transform = '';
  if (document.body.classList.contains('fullscreen')) { focus.style.opacity = '1'; mini.style.opacity = '0'; return; }
  if (running) { focus.style.opacity = '1'; mini.style.opacity = '0'; }          // 专注：中央大字
  else if (restStartEpoch) { focus.style.opacity = '0'; mini.style.opacity = '1'; } // 休息：顶部小字 + 中央休息计时
  else { focus.style.opacity = '1'; mini.style.opacity = '0'; }                  // 引导/未开始：中央显示总时长（没记录时即 00:00:00）
}

function render() {
  const card = document.getElementById('card');
  card.classList.toggle('running', running);
  card.classList.toggle('paused', !running);
  document.getElementById('status-text').textContent = running ? '专注中' : '已暂停';
  if (toggleState !== running) { toggleState = running; setToggleButton(); }

  const total = liveTotalMs();
  const totalStr = fmtClock(displayTotalMs()); // 超额态下数字继续走（不计入有效专注）
  document.getElementById('focus-time').textContent = totalStr;
  document.getElementById('mini-focus').textContent = totalStr;

  renderHour();

  document.getElementById('session-info').textContent =
    `本次专注 ${Math.floor(liveSessionMs() / 60000)} 分钟`;
  document.getElementById('pause-info').textContent =
    `今日暂停 ${data.pauses.length} 次`;

  if (!running) updateCatLabel('other'); // 暂停时显示 —
}

// ---------- 当前小时浓缩时间轴 ----------
function buildHourGradient(samples, intoHour) {
  const track = 'var(--bistre-line)';
  const per = SAMPLE_MS / HOUR_MS * 100; // 每个采样占百分比
  const intoPct = Math.min(100, intoHour / HOUR_MS * 100);
  if (!samples || samples.length === 0) {
    if (intoPct <= 0) return track;
    // 还没采到样但已在专注：先用"其他"色填到当前进度
    return `linear-gradient(90deg, ${CAT_COLOR.other} 0%, ${CAT_COLOR.other} ${intoPct.toFixed(2)}%, transparent ${intoPct.toFixed(2)}%, transparent 100%), ${track}`;
  }
  const stops = [];
  let i = 0;
  while (i < samples.length) {
    let j = i;
    while (j + 1 < samples.length && samples[j + 1] === samples[i]) j++;
    const c = CAT_COLOR[samples[i]] || track;
    stops.push(`${c} ${(i * per).toFixed(2)}%`, `${c} ${((j + 1) * per).toFixed(2)}%`);
    i = j + 1;
  }
  let fillEnd = Math.min(100, samples.length * per);
  if (intoPct > fillEnd) { // 实时进度略超最后一个采样，用最后的颜色补齐，避免空隙
    const lastC = CAT_COLOR[samples[samples.length - 1]] || track;
    stops.push(`${lastC} ${fillEnd.toFixed(2)}%`, `${lastC} ${intoPct.toFixed(2)}%`);
    fillEnd = intoPct;
  }
  return `linear-gradient(90deg, ${stops.join(', ')}, transparent ${fillEnd.toFixed(2)}%, transparent 100%), ${track}`;
}

// 自绘三角小旗：细旗杆 + 实心三角旗面（朝右）。颜色走 currentColor（CSS 按 flag-end/flag-pause 给色）。
// lucide 只有方旗、不符合期待，故此处自绘（其它图标仍用 lucide）。
const FLAG_SVG = '<svg width="13" height="17" viewBox="0 0 13 17" fill="none">'
  + '<line x1="2" y1="1.5" x2="2" y2="16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
  + '<path d="M2 2 L12 5.4 L2 8.8 Z" fill="currentColor"/>'
  + '</svg>';
// posPct=旗杆所在百分比；旗面朝右展开。maxLeftPct 把位置夹紧，保证整面旗不超出浓缩条。
function makeFlag(posPct, type, maxLeftPct) {
  const el = document.createElement('div');
  el.className = 'flag ' + (type === 'red' ? 'flag-end' : 'flag-pause'); // 颜色由 CSS（currentColor）控制
  const cap = (typeof maxLeftPct === 'number') ? maxLeftPct : 100;
  el.style.left = Math.min(Math.max(posPct, 0), cap) + '%';
  el.innerHTML = FLAG_SVG;
  return el;
}

function renderHour() {
  const total = liveTotalMs();
  const hourIdx = Math.floor(total / HOUR_MS);
  const intoHour = total - hourIdx * HOUR_MS;
  const ch = (data.currentHour && data.currentHour.hourIdx === hourIdx)
    ? data.currentHour : { samples: [], pauseMarks: [] };

  document.getElementById('hour-bar').style.background = buildHourGradient(ch.samples, intoHour);

  const flags = document.getElementById('hour-flags');
  flags.innerHTML = '';
  // 旗子以"旗杆"为锚点向右展开；按容器实宽算出最大 left%，保证整面旗（含旗面尖）不戳出浓缩条
  const fw = flags.getBoundingClientRect().width || 1;
  const FLAG_PX = 13;
  const maxLeftPct = Math.max(0, 100 - FLAG_PX / fw * 100);
  (ch.pauseMarks || []).forEach(mark => {
    flags.appendChild(makeFlag(mark / HOUR_MS * 100, 'white', maxLeftPct));
  });
  flags.appendChild(makeFlag(100, 'red', maxLeftPct)); // 60 分钟终点红旗

  const mins = Math.floor(intoHour / 60000);
  document.getElementById('hour-label').innerHTML =
    `第 <b>${hourIdx + 1}</b> 小时 · <b>${mins}</b> / 60 分钟`;
}

// ---------- 撒花 ----------
const canvas = document.getElementById('confetti');
const ctx = canvas.getContext('2d');
let particles = [];
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function fireConfetti(count = 90) {
  const colors = ['#DF6F21', '#D38D4F', '#FDDDAA', '#C2A489', '#f0a25a'];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 3,
      vx: (Math.random() - 0.5) * 8,
      vy: Math.random() * -7 - 2,
      g: 0.18,
      size: Math.random() * 5 + 3,
      color: colors[(Math.random() * colors.length) | 0],
      life: 90 + Math.random() * 40,
      rot: Math.random() * 6
    });
  }
}
function confettiLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles = particles.filter(p => p.life > 0);
  for (const p of particles) {
    p.vy += p.g;
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
    p.rot += 0.2;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.min(1, p.life / 40);
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    ctx.restore();
  }
  requestAnimationFrame(confettiLoop);
}
confettiLoop();

// 目标设置 / 开机自启 / 快捷键 已移到独立设置窗口（src/settings.html + settings.js）。

// ---------- 事件绑定 ----------
function bindEvents() {
  // 大按钮：主要入口。无目标/失败态点击 → 打开设定窗；否则切换专注/暂停
  document.getElementById('big-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    primaryAction();
  });

  // 注意：刻意不再监听整张卡片的点击——以前点中央跳动的数字也会暂停，属误触。
  // 现在切换专注/暂停只能通过：大按钮、Enter 键、全局快捷键。

  // 设置：打开独立窗口；打开即进入暂停（也是一种休息，且确保数据已保存供设置窗读取）
  document.getElementById('btn-goal').addEventListener('click', (e) => {
    e.stopPropagation();
    if (running) pause();
    window.api.openSettings();
  });
  document.getElementById('btn-stats').addEventListener('click', (e) => { e.stopPropagation(); window.api.openStats(); });

  // ✕ 退出：智能退出弹窗（按今日目标做完没分流）
  document.getElementById('btn-quit').addEventListener('click', (e) => { e.stopPropagation(); openExit(); });
  document.getElementById('exit-summary').addEventListener('click', (e) => { e.stopPropagation(); hideExit(); ceremonyThenQuit = true; showCeremony('done'); });
  document.getElementById('exit-now-done').addEventListener('click', (e) => { e.stopPropagation(); quitNow(); });
  document.getElementById('exit-keep').addEventListener('click', (e) => { e.stopPropagation(); hideExit(); });
  document.getElementById('exit-giveup').addEventListener('click', (e) => { e.stopPropagation(); hideExit(); document.getElementById('abort-confirm').classList.remove('hidden'); });

  // 放弃今天 二次确认
  document.getElementById('ac-keep').addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('abort-confirm').classList.add('hidden'); });
  document.getElementById('ac-stop').addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('abort-confirm').classList.add('hidden'); quitNow(); });

  // 仪式总结：关闭——退出场景则退出应用，计划庆祝场景仅关闭
  document.getElementById('ce-close').addEventListener('click', (e) => {
    e.stopPropagation();
    if (ceremonyThenQuit) quitNow(); else hideCeremony();
  });

  // 分神弹窗
  document.getElementById('dx-keep').addEventListener('click', (e) => { e.stopPropagation(); hideDistract(); });
  document.getElementById('dx-pause').addEventListener('click', (e) => { e.stopPropagation(); hideDistract(); if (running) pause(); });
  document.getElementById('distract-remind').addEventListener('change', (e) => {
    idleRemind = e.target.checked;
    idleSettings.idleRemind = idleRemind;
    window.api.setIdleSettings({ idleRemind: idleRemind });
  });

  // 连续 2 小时休息提醒
  document.getElementById('rest-go').addEventListener('click', (e) => { e.stopPropagation(); hideRestTip(); if (running) pause(); });
  document.getElementById('rest-skip').addEventListener('click', (e) => { e.stopPropagation(); hideRestTip(); });

  // 设置窗修改目标后，主进程通知这里即时更新徽章/进度
  window.api.onGoalUpdated((h) => {
    data.goalHours = h;
    goalDone = Math.floor(liveTotalMs() / HOUR_MS) >= h;
    buildBadges();
    render();
  });

  // 计划确认/变更后，主进程推送最新计划进度
  window.api.onPlanUpdated((p) => {
    planState = p;
    if (p) {
      data.goalHours = p.goalHours;
      goalDone = Math.floor(liveTotalMs() / HOUR_MS) >= p.goalHours;
      buildBadges();
    }
    renderPlanLine();
    render();
  });

  // 分神设置变更后重新拉取
  window.api.onIdleSettingsUpdated(async () => {
    try { idleSettings = await window.api.getIdleSettings(); idleRemind = idleSettings.idleRemind; } catch (e) { /* 忽略 */ }
  });

  // 清除今日记录后，主进程通知这里从零重载（清除时已是暂停态）
  window.api.onDayCleared(async () => {
    const today = await window.api.todayStr();
    data = await window.api.loadDay(today);
    running = false; curIdx = -1;
    lastMilestone = 0; goalDone = false;
    overLimit = false; overStartEpoch = 0; lastFlagTotal = 0;
    hideRest();
    updateEye(false);
    setToggleButton(); // 若之前是超14劝退卡，恢复正常"开始"按钮
    buildBadges();
    render();
    setTimeVisibility(); // 回到引导态：中央 00:00:00
  });

  // 聚焦时按 Enter 切换
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      primaryAction();
    }
  });

  // 在设定窗主动设完目标 → 主进程通知直接开始计数
  window.api.onStartFocus(() => { if (!running && !overLimit) start(); });

  // 全屏专注：工具栏按钮进入、角落按钮退出
  document.getElementById('btn-fullscreen').addEventListener('click', (e) => { e.stopPropagation(); window.api.toggleFullscreen(); });
  document.getElementById('exit-fullscreen').addEventListener('click', (e) => { e.stopPropagation(); window.api.toggleFullscreen(); });
  window.api.onFullscreenChanged((isFull) => {
    document.body.classList.toggle('fullscreen', isFull);
    luRender(); // 重渲染图标
    setTimeVisibility(); // 全屏/退出时重设中央大字与顶部小字的可见性
    updateToggleSubline(); // 全屏时隐藏按钮副行
    if (!isFull && !userResized) requestAnimationFrame(fitWindow); // 退出全屏后恢复贴合
  });
  // 用户手动拉伸过窗口 → 之后尊重用户尺寸，不再自动按内容改高
  window.api.onUserResized(() => { userResized = true; });

  // 全局快捷键
  window.api.onGlobalToggle(() => primaryAction());
}

// 让窗口高度自适应卡片内容（始终刚好包住，不留多余空白也不裁切）
// 改用"固定初始高度 + flex 自适应 + 用户可拉伸"后，不再按内容强制改窗口高：
// 因为 #card height:100vh 会让"按内容测高"失真（card 高恒等于窗口高）。
// 徽章数量变化由 #center-slot 的 flex:1 在窗口内自动吸收/让出空间。保留空实现以兼容调用点。
function fitWindow() {}

// ---------- 内容分类采样 ----------
const CAT_LABELS = (window.Categories && window.Categories.LABELS) ||
  { video: '看视频', client: '客户沟通', other: '其他工作/学习' };
const CAT_COLOR = { video: 'var(--cat-video)', client: 'var(--cat-client)', other: 'var(--cat-other)' };

// 显示"当前任务"：细粒度任务名（如 Photoshop (PS) / B站），颜色按粗类着色
function updateCatLabel(bucket, task) {
  const el = document.getElementById('cat-now');
  if (!el) return;
  if (!running) { el.textContent = '—'; el.className = ''; return; }
  el.textContent = task || CAT_LABELS[bucket] || '其他';
  el.className = bucket;
}

async function sampleCategory() {
  if (!running) return;
  let bucket = 'other', task = '其他';
  try {
    const win = await window.api.getActiveWindow();
    if (window.Categories && window.Categories.detail) {
      const d = window.Categories.detail(win);
      bucket = d.bucket; task = d.task;
    } else if (window.Categories) {
      bucket = window.Categories.classify(win);
    }
  } catch (e) { /* 读取失败按"其他"处理 */ }
  lastBucket = bucket; // 供分神检测豁免"看视频"
  data.categories[bucket] = (data.categories[bucket] || 0) + SAMPLE_MS;
  // 细粒度任务用时累计（扁平 + 按大类分组）
  if (!data.apps) data.apps = {};
  data.apps[task] = (data.apps[task] || 0) + SAMPLE_MS;
  if (!data.appsByCat) data.appsByCat = { video: {}, client: {}, other: {} };
  if (!data.appsByCat[bucket]) data.appsByCat[bucket] = {};
  data.appsByCat[bucket][task] = (data.appsByCat[bucket][task] || 0) + SAMPLE_MS;

  // 当前小时浓缩条：跨入新小时则重置，再记录这次采样（仍记粗类，保持配色）
  const hourIdx = Math.floor(liveTotalMs() / HOUR_MS);
  if (!data.currentHour || data.currentHour.hourIdx !== hourIdx) {
    data.currentHour = { hourIdx, samples: [], pauseMarks: [] };
  }
  data.currentHour.samples.push(bucket);

  updateCatLabel(bucket, task);
}

// 计划/状态变化后刷新大按钮（文案随 launchState、副行随 planState）。沿用旧名 renderPlanLine。
function renderPlanLine() {
  computeLaunchState();
  setToggleButton(); // 重建大按钮（含状态文案 + 计划/奖励副行）
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- 分神检测（系统空闲时间） ----------
async function checkIdle() {
  if (!running || overLimit) { idleHandled = false; return; }
  if (!idleSettings.idleEnabled || !idleRemind) return;
  if (distractShown) return;
  if (lastBucket === 'video') { idleHandled = false; return; } // 看视频不动键鼠属正常，豁免
  let idleSec = 0;
  try { idleSec = await window.api.getIdleTime(); } catch (e) { return; }
  const threshold = (idleSettings.idleMinutes || 5) * 60;
  if (idleSec >= threshold) {
    if (idleHandled) return; // 同一轮空闲只弹一次
    idleHandled = true;
    showDistract();
  } else {
    idleHandled = false;     // 已恢复键鼠活动，允许下次再判定
  }
}

function showDistract() {
  if (distractShown) return;
  distractShown = true;
  const ov = document.getElementById('distract-overlay');
  document.getElementById('distract-min').textContent = idleSettings.idleMinutes || 5;
  const chk = document.getElementById('distract-remind');
  if (chk) chk.checked = idleRemind;
  ov.classList.remove('hidden');
  playDing();                              // 提示音
  try { window.api.flashAttention(); } catch (e) { /* 忽略 */ }
}
function hideDistract() {
  distractShown = false;
  document.getElementById('distract-overlay').classList.add('hidden');
}

// ---------- 连续 2 小时休息提醒 ----------
const REST_TIPS = [
  '已经连续 2 小时啦，起来喝口水、活动下肩颈 💧',
  '盯屏幕有点久了，远眺窗外 20 秒，放松一下眼睛 👀',
  '专注得真久，站起来走两步、伸个懒腰吧 🧍',
  '听一首喜欢的歌回回血，再继续 🎵',
  '刷两分钟喜欢的内容换换脑子，别太久哦 📱',
  '泡杯热饮犒劳一下自己 ☕',
  '吃一小块巧克力，给大脑充个电 🍫'
];
function checkRestTip() {
  if (!running || overLimit) return;
  if (!document.getElementById('rest-tip-overlay').classList.contains('hidden')) return; // 已在显示
  const block = Math.floor(liveSessionMs() / REST_TIP_MS); // 本段连续专注满了几个 2h
  if (block > lastRestTipBlock) {
    lastRestTipBlock = block;
    showRestTip();
  }
}
function showRestTip() {
  document.getElementById('rest-tip-text').textContent = REST_TIPS[(Math.random() * REST_TIPS.length) | 0];
  document.getElementById('rest-tip-overlay').classList.remove('hidden');
  playDing();
  try { window.api.flashAttention(); } catch (e) { /* 忽略 */ }
}
function hideRestTip() { document.getElementById('rest-tip-overlay').classList.add('hidden'); }

// ---------- 主循环 ----------
function tick() {
  if (running) {
    render();
    checkMilestones();
    checkRestTip(); // 连续 2 小时休息提醒
  } else {
    updateRest(); // 暂停时刷新休息计时
  }
}

async function init() {
  luRender(); // 渲染 HTML 里的 data-lucide 占位图标（工具栏/庆祝层/弹层标题）
  const today = await window.api.todayStr();
  data = await window.api.loadDay(today);
  if (!data.categories) data.categories = { video: 0, client: 0, other: 0 };
  if (!data.apps) data.apps = {};
  if (!data.appsByCat) data.appsByCat = { video: {}, client: {}, other: {} };
  if (!data.currentHour) {
    data.currentHour = { hourIdx: Math.floor(data.totalFocusedMs / HOUR_MS), samples: [], pauseMarks: [] };
  }
  lastMilestone = Math.floor(data.totalFocusedMs / HOUR_MS);
  goalDone = lastMilestone >= data.goalHours;

  // 计划进度 + 分神设置
  try { planState = await window.api.loadPlan(); } catch (e) { planState = null; }
  try { idleSettings = await window.api.getIdleSettings(); idleRemind = idleSettings.idleRemind; } catch (e) { /* 用默认 */ }

  buildBadges();
  renderPlanLine();
  render();
  bindEvents();

  // 初始为暂停态：闭眼，但「不」启动休息计时。
  // 休息只在「开始专注后再暂停」时才计——刚打开程序还没专注，不该记录休息。
  updateEye(false);
  hideRest();
  setTimeVisibility(); // 暂停态：中央大字隐、顶部小字显

  // 等布局/字体就绪后，按内容自适应窗口高度
  requestAnimationFrame(() => requestAnimationFrame(fitWindow));

  setInterval(tick, 250);              // 刷新显示
  setInterval(() => { if (running) { commitElapsed(); save(); } }, 10000); // 10s 自动保存
  setInterval(sampleCategory, SAMPLE_MS); // 内容分类采样
  setInterval(checkIdle, IDLE_CHECK_MS);  // 分神检测（系统空闲时间）
}

init();
