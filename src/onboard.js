const MAX_HOURS = 14;
const MAX_DAYS = 5; // 计划最多 5 天（奖励要"更勤"而非"更大"）

// 选择状态（真值来源）
let selGoal = 12;        // 目标小时
let selDays = 1;         // 计划天数
let selOneShot = true;   // 是否"仅此一次"
let rewardCustom = false;// 用户是否自定义过奖励文案
let continuing = false;  // 是否在继续一个进行中的多天计划

function defaultReward(oneShot, days) {
  if (oneShot) return '给今天的自己一点小奖励 🎁';
  return `坚持 ${days} 天 → 给自己一份心仪的奖励 🎁`;
}

function shake() {
  document.body.classList.remove('shake');
  void document.body.offsetWidth;
  document.body.classList.add('shake');
  setTimeout(() => document.body.classList.remove('shake'), 460);
}
function warnGoal() {
  document.getElementById('goal-warn').classList.remove('hidden');
  shake();
}
function warnDays() {
  document.getElementById('day-warn').classList.remove('hidden');
  shake();
}

// ---------- 奖励预览：徽章 + 文案 ----------
function renderPreview() {
  const wrap = document.getElementById('pv-badges');
  wrap.innerHTML = '';
  const lit = Math.min(MAX_HOURS, Math.round(selGoal));
  for (let i = 1; i <= MAX_HOURS; i++) {
    const b = document.createElement('div');
    b.className = 'pv-badge' + (i <= lit ? ' lit' : '');
    b.textContent = i;
    wrap.appendChild(b);
  }
  const rewardEl = document.getElementById('pv-reward');
  const inp = document.getElementById('reward-input');
  rewardEl.textContent = (rewardCustom && inp.value.trim()) ? inp.value.trim() : defaultReward(selOneShot, selDays);
}

// 未自定义时，奖励输入框的占位/默认随天数变化
function syncRewardPlaceholder() {
  const inp = document.getElementById('reward-input');
  inp.placeholder = defaultReward(selOneShot, selDays);
}

// ---------- 目标小时选择 ----------
function setGoalChip(h) {
  selGoal = h;
  document.querySelectorAll('#goal-chips .chip').forEach(c => c.classList.toggle('active', Number(c.dataset.h) === h));
  document.getElementById('goal-input').value = '';
  document.getElementById('goal-warn').classList.add('hidden');
  renderPreview();
}

// ---------- 计划天数选择 ----------
function setDayChip(days, oneShot) {
  selDays = oneShot ? 1 : days;
  selOneShot = !!oneShot;
  document.querySelectorAll('#day-chips .chip').forEach(c => {
    const isOne = c.dataset.one === '1';
    c.classList.toggle('active', isOne ? oneShot : (!oneShot && Number(c.dataset.d) === days));
  });
  document.getElementById('day-input').value = '';
  syncRewardPlaceholder();
  renderPreview();
}

function bind() {
  document.querySelectorAll('#goal-chips .chip').forEach(c => {
    c.addEventListener('click', () => setGoalChip(Number(c.dataset.h)));
  });
  document.getElementById('goal-input').addEventListener('input', (e) => {
    const v = Number(e.target.value);
    if (!v) return;
    document.querySelectorAll('#goal-chips .chip').forEach(c => c.classList.remove('active'));
    selGoal = v;
    renderPreview();
  });

  document.querySelectorAll('#day-chips .chip').forEach(c => {
    c.addEventListener('click', () => setDayChip(Number(c.dataset.d), c.dataset.one === '1'));
  });
  document.getElementById('day-input').addEventListener('input', (e) => {
    let v = Number(e.target.value);
    if (!v) return;
    if (v > MAX_DAYS) { v = MAX_DAYS; e.target.value = MAX_DAYS; warnDays(); }
    else document.getElementById('day-warn').classList.add('hidden');
    document.querySelectorAll('#day-chips .chip').forEach(c => c.classList.remove('active'));
    selOneShot = false;
    selDays = v;
    syncRewardPlaceholder();
    renderPreview();
  });

  document.getElementById('reward-input').addEventListener('input', () => {
    rewardCustom = true;
    renderPreview();
  });

  // 预设奖励 chip：点选即填入文本框（可再手动改）
  document.querySelectorAll('#reward-chips .chip').forEach(c => {
    c.addEventListener('click', () => {
      const text = c.textContent.trim();
      document.getElementById('reward-input').value = text;
      rewardCustom = true;
      document.querySelectorAll('#reward-chips .chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      renderPreview();
    });
  });

  document.getElementById('confirm').addEventListener('click', confirmPlan);
}

async function confirmPlan() {
  // 目标合法性：>14 给提示并修正
  if (selGoal > MAX_HOURS) {
    selGoal = MAX_HOURS;
    document.getElementById('goal-input').value = MAX_HOURS;
    warnGoal();
    renderPreview();
    return;
  }
  if (selGoal < 1) selGoal = 1;
  const inp = document.getElementById('reward-input');
  const reward = (rewardCustom && inp.value.trim()) ? inp.value.trim() : defaultReward(selOneShot, selDays);
  // 继续进行中的多天计划 → 不重置；否则全新（含选了"仅此一次"）
  const restart = !continuing || selOneShot;
  await window.api.confirmPlan({
    goalHours: selGoal,
    oneShot: selOneShot,
    durationDays: selOneShot ? 1 : selDays,
    reward,
    rewardCustom,
    restart
  });
  window.close(); // 主进程也会关，这里兜底
}

async function init() {
  const plan = await window.api.loadPlan();
  // 进行中的多天计划（未完成、非仅此一次）→ 继续模式，预填上次设定
  continuing = !!(plan && !plan.oneShot && !plan.planDone);

  if (continuing) {
    selGoal = plan.goalHours || 12;
    selOneShot = false;
    selDays = plan.durationDays || 1;
    rewardCustom = !!plan.rewardCustom;

    const banner = document.getElementById('plan-banner');
    if (plan.broken) {
      banner.className = 'broken';
      banner.style.display = 'block';
      banner.innerHTML = `昨天断签了 😣 没关系，从今天重新攒「连续天数」吧 —— 目标 <b>${plan.totalDays}</b> 天`;
    } else {
      banner.className = 'continue';
      banner.style.display = 'block';
      banner.innerHTML = `进行中的计划：第 <b>${Math.min(plan.dayIndex, plan.totalDays)}/${plan.totalDays}</b> 天 · 已连续 <b>${plan.currentStreak}</b> 天，继续保持！`;
    }
    document.getElementById('confirm').textContent = '继续今天的专注';

    // 预选目标 chip / 自定义
    const gchip = [...document.querySelectorAll('#goal-chips .chip')].find(c => Number(c.dataset.h) === selGoal);
    if (gchip) setGoalChip(selGoal);
    else { document.querySelectorAll('#goal-chips .chip').forEach(c => c.classList.remove('active')); document.getElementById('goal-input').value = selGoal; }
    // 预选天数 chip / 自定义
    const dchip = [...document.querySelectorAll('#day-chips .chip')].find(c => c.dataset.one !== '1' && Number(c.dataset.d) === selDays);
    document.querySelectorAll('#day-chips .chip').forEach(c => c.classList.remove('active'));
    if (dchip) dchip.classList.add('active');
    else document.getElementById('day-input').value = selDays;
    if (plan.reward) document.getElementById('reward-input').value = plan.reward;
  }

  syncRewardPlaceholder();
  renderPreview();
  bind();
}

init();
