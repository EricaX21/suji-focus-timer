const { app, BrowserWindow, globalShortcut, ipcMain, screen, Notification, Menu, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');

// Windows 通知需要一个 AppUserModelId 才能正常弹 toast
app.setAppUserModelId('com.studytimer.app');

// 数据根目录：默认 %APPDATA%\study-timer（与应用显示名解耦，改名不丢数据）。
// 开发/测试时可设环境变量 STUDYTIMER_DATA_DIR 指向另一个目录，与正在运行的正式版数据隔离、互不干扰。
function appRoot() {
  return process.env.STUDYTIMER_DATA_DIR || path.join(app.getPath('appData'), 'study-timer');
}

// 数据目录：放在 <数据根>\data
function getDataDir() {
  return path.join(appRoot(), 'data');
}

// 应用设置（与每日数据分开存）：目前存自定义全局快捷键
function getSettingsFile() {
  return path.join(appRoot(), 'settings.json');
}
function loadSettings() {
  try { return JSON.parse(fs.readFileSync(getSettingsFile(), 'utf-8')) || {}; }
  catch (e) { return {}; }
}
function saveSettings(s) {
  try {
    const dir = appRoot();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getSettingsFile(), JSON.stringify(s, null, 2), 'utf-8');
  } catch (e) { /* 忽略写失败 */ }
}

// 计划文件（app 级、跨天）：承载多天计划 + 连续打卡。与每日数据/设置都分开存。
function getPlanFile() {
  return path.join(appRoot(), 'plan.json');
}
function loadPlan() {
  try { return JSON.parse(fs.readFileSync(getPlanFile(), 'utf-8')) || null; }
  catch (e) { return null; }
}
function savePlan(p) {
  try {
    const dir = appRoot();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getPlanFile(), JSON.stringify(p, null, 2), 'utf-8');
  } catch (e) { /* 忽略写失败 */ }
}

// 依「奖励」关键词取一个有趣的默认计划名；无匹配则用日期兜底（如「6月21日计划」）。
// 每类多个候选随机取一个增加惊喜。仅在用户没自定义名字时使用。
const PLAN_NAME_TABLE = [
  { kw: ['咖啡', '拿铁', '美式', '咖啡因', 'latte', 'coffee'], names: ['咖啡续命计划', '牛马快乐水计划', '续命咖啡计划'] },
  { kw: ['奶茶', '茶', '可乐', '快乐水'], names: ['奶茶自由计划', '快乐水续命计划'] },
  { kw: ['剧', '电影', '番', '追剧', '电视', '动画', '综艺'], names: ['追剧基金计划', '看剧回血计划'] },
  { kw: ['睡', '懒觉', '补觉', '躺'], names: ['补觉计划', '睡到自然醒计划'] },
  { kw: ['吃', '火锅', '餐', '饭', '零食', '好吃', '美食', '炸鸡', '烧烤', '甜', '蛋糕', '冰淇淋'], names: ['干饭计划', '犒劳干饭计划', '大餐基金计划'] },
  { kw: ['买', '心愿', '剁手', '购', '包', '鞋', '裙', '衣'], names: ['剁手基金计划', '心愿剁手计划'] },
  { kw: ['玩', '游戏', '打游戏', 'steam', '开黑'], names: ['开黑基金计划', '快乐游戏计划'] },
  { kw: ['旅', '出去', '逛', '出门', '放风', '玩耍'], names: ['出逃计划', '放风计划'] }
];
function planNameFromReward(reward, startDate) {
  const r = String(reward || '').toLowerCase();
  for (const e of PLAN_NAME_TABLE) {
    if (e.kw.some(k => r.includes(k.toLowerCase()))) {
      return e.names[Math.floor(Math.random() * e.names.length)];
    }
  }
  const [, m, d] = String(startDate || todayStr()).split('-').map(Number);
  return `${m}月${d}日计划`;
}

let timerWin = null;
let statsWin = null;
let settingsWin = null;
let onboardWin = null;
let summaryWin = null;
let pendingSummary = null; // 待展示的今日总结数据（由悬浮窗算好、新窗加载时取走）
let activeHotkey = null; // 实际注册成功的全局快捷键

// get-windows 是 ESM，CommonJS 里用动态 import 调用并缓存
let _activeWindowFn = null;
async function getActiveWindowFn() {
  if (!_activeWindowFn) {
    const mod = await import('get-windows');
    _activeWindowFn = mod.activeWindow;
  }
  return _activeWindowFn;
}

// 「一天」从几点开始：默认 0（午夜）；熬夜党模式=6（凌晨 6 点前算前一天）
function getDayResetHour() {
  try { return loadSettings().nightOwl === true ? 6 : 0; }
  catch (e) { return 0; }
}
function todayStr() {
  // 用本地时间生成 YYYY-MM-DD，并按日界偏移：减去 resetHour，使深夜专注归前一天
  const resetH = getDayResetHour();
  const d = new Date(Date.now() - resetH * 3600 * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dataFileFor(date) {
  return path.join(getDataDir(), `${date}.json`);
}

// ---------- 计划日期工具 + 派生进度 ----------
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
function daysBetween(a, b) {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  const da = new Date(pa[0], pa[1] - 1, pa[2]);
  const db = new Date(pb[0], pb[1] - 1, pb[2]);
  return Math.round((db - da) / 86400000);
}
// 在 plan 上附加运行时派生量（不持久化）：第几天/连续打卡/是否完成/是否断签
function planWithDerived(plan) {
  if (!plan) return null;
  const today = todayStr();
  const done = new Set(plan.completedDates || []);
  const totalDays = plan.oneShot ? 1 : (plan.durationDays || 1);
  const dayIndex = Math.max(1, daysBetween(plan.startDate || today, today) + 1);
  // 连续打卡：从今天（或昨天）往回数连续达标的天数
  let streak = 0;
  let cur = done.has(today) ? today : addDays(today, -1);
  while (done.has(cur)) { streak++; cur = addDays(cur, -1); }
  const completedCount = (plan.completedDates || []).length;
  const planDone = !plan.oneShot && completedCount >= totalDays;
  const yesterday = addDays(today, -1);
  const confirmedToday = plan.lastConfirmedDate === today;

  // 计划完成度（按用户定义：实际专注小时 ÷ 目标小时，每天封顶在当天目标）。
  // 只统计"已过的完整天数"（startDate..昨天，且不超过计划末日）；今天进行中不计入。第 1 天暂无缺额 → 100%。
  let quality = 100;
  if (!plan.oneShot) {
    const goalMs = (plan.goalHours || 12) * 3600000;
    const planEnd = addDays(plan.startDate || today, totalDays - 1);
    let denomDays = 0, sumMs = 0;
    let d = plan.startDate || today;
    while (d < today && d <= planEnd) {
      denomDays++;
      let act = 0;
      try { act = loadDay(d).totalFocusedMs || 0; } catch (e) { act = 0; }
      sumMs += Math.min(act, goalMs); // 每天封顶在当天目标：超额不替别天补账
      d = addDays(d, 1);
    }
    if (denomDays > 0 && goalMs > 0) quality = Math.round(sumMs / (goalMs * denomDays) * 100);
  }
  // 是否存在"已过天数里的缺额"（用于第二天温柔提示，不再静默接续）
  const hasShortfall = !plan.oneShot && dayIndex > 1 && quality < 100;
  const promptedToday = plan.lastPromptDate === today; // 今天是否已提示过（避免重复弹）

  return {
    ...plan, totalDays, dayIndex, currentStreak: streak, completedCount, planDone,
    quality, hasShortfall, promptedToday,
    todayDone: done.has(today), confirmedToday
  };
}

// 进行中的计划在新的一天自动接续：把计划目标写进当天数据 + 标记今天已确认（避免再弹设定窗）
function applyPlanToToday(plan) {
  const today = todayStr();
  const d = loadDay(today);
  d.goalHours = plan.goalHours;
  saveDay(d);
  plan.lastConfirmedDate = today;
  savePlan(plan);
}

function ensureDataDir() {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadDay(date) {
  ensureDataDir();
  const file = dataFileFor(date);
  if (fs.existsSync(file)) {
    try {
      const d = JSON.parse(fs.readFileSync(file, 'utf-8'));
      // 兼容旧文件：缺字段时补默认值
      if (!d.categories) d.categories = { video: 0, client: 0, other: 0 };
      if (!d.apps) d.apps = {}; // 细粒度任务用时累计（Photoshop/B站… → 毫秒）
      if (!d.appsByCat) d.appsByCat = { video: {}, client: {}, other: {} }; // 按大类分组的细粒度用时（复盘可展开）
      if (!d.currentHour) d.currentHour = { hourIdx: Math.floor((d.totalFocusedMs || 0) / 3600000), samples: [], pauseMarks: [] };
      if (!d.archives) d.archives = []; // 已"清除"归档的早先记录（复盘仍可见）
      return d;
    } catch (e) {
      // 文件损坏就重建
    }
  }
  return {
    date,
    goalHours: 12,
    totalFocusedMs: 0,
    sessions: [], // { start, end, durationMs }
    pauses: [],   // { pauseAt, resumeAt }
    longestStreakMs: 0,
    categories: { video: 0, client: 0, other: 0 }, // 看视频 / 客户沟通 / 其他（毫秒）
    apps: {}, // 细粒度任务用时累计（Photoshop/B站… → 毫秒）
    appsByCat: { video: {}, client: {}, other: {} }, // 按大类分组的细粒度用时（复盘可展开）
    currentHour: { hourIdx: 0, samples: [], pauseMarks: [] }, // 当前小时浓缩条
    archives: [] // 已"清除"归档的早先记录
  };
}

function saveDay(data) {
  ensureDataDir();
  fs.writeFileSync(dataFileFor(data.date), JSON.stringify(data, null, 2), 'utf-8');
}

// 悬浮窗的拉伸上限（模块级，供全屏切换临时解除/恢复）
let maxW = 720, maxH = 600;

function createTimerWindow() {
  const primary = screen.getPrimaryDisplay();
  const wa = primary.workAreaSize;
  const winWidth = 384; // 宽度按"最多 14 个徽章单行"定：14×19 + 13×5 间隙 ≈ 331，加卡片内边距/外边距 ≈ 384
  const winHeight = 268; // 初始高度，给足以容纳标题/时间/浓缩条/按钮/徽章/三信息；之后用户可自由拉伸
  // 拉伸上限：推荐值与"屏幕工作区 70%"取小——小屏不超出、大屏也明显小于全屏，与全屏形态区分
  maxW = Math.min(720, Math.round(wa.width * 0.7));
  maxH = Math.min(600, Math.round(wa.height * 0.7));

  timerWin = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: Math.round((wa.width - winWidth) / 2), // 屏幕顶部居中
    y: 16,
    icon: path.join(__dirname, 'icon.ico'),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,        // 允许用户自由拉伸
    minWidth: 360,          // 保证最小尺寸下 14 个徽章仍能单行排开
    minHeight: 240,
    maxWidth: maxW,
    maxHeight: maxH,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // 置顶到最高层级，盖住全屏应用
  timerWin.setAlwaysOnTop(true, 'screen-saver');
  timerWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  timerWin.loadFile(path.join(__dirname, 'src', 'timer.html'));

  // 用户手动拖拽边缘改尺寸时通知渲染层（'will-resize' 只在交互式 resize 时触发，
  // 程序 setBounds（fitWindow/全屏）不会触发，因此能区分"用户拉伸" vs "程序改尺寸"）
  timerWin.on('will-resize', () => {
    if (!isFull && timerWin && !timerWin.isDestroyed()) {
      timerWin.webContents.send('user-resized');
    }
  });
}

// ---------- 全屏切换（撑满整屏的极简界面） ----------
let isFull = false;
let prevBounds = null;
function toggleFullscreen() {
  if (!timerWin || timerWin.isDestroyed()) return;
  if (!isFull) {
    prevBounds = timerWin.getBounds();
    const disp = screen.getDisplayNearestPoint(timerWin.getBounds());
    timerWin.setMaximumSize(0, 0);       // 解除上限以便铺满
    timerWin.setBounds(disp.bounds);     // 撑满整块屏幕（含任务栏区域）
    isFull = true;
  } else {
    if (prevBounds) timerWin.setBounds(prevBounds);
    timerWin.setMaximumSize(maxW, maxH); // 恢复拉伸上限
    isFull = false;
  }
  timerWin.webContents.send('fullscreen-changed', isFull);
}

// ---------- 外部全屏检测（看视频/游戏全屏时，悬浮窗自动变迷你数字或隐藏） ----------
let externalFull = false;     // 当前是否处于"别的应用全屏"
let prevMiniBounds = null;    // 进入迷你态前的悬浮窗位置/尺寸，退出时还原
function fullscreenMode() {
  const m = loadSettings().fullscreenMode;
  return m === 'hide' ? 'hide' : 'mini'; // 默认 mini
}
async function checkExternalFullscreen() {
  if (!timerWin || timerWin.isDestroyed() || isFull) return; // 自身全屏专注时不处理
  let isExt = false;
  try {
    const fn = await getActiveWindowFn();
    const w = await fn();
    if (w && w.bounds) {
      const ownerPath = ((w.owner && (w.owner.path || w.owner.name)) || '').toLowerCase();
      const isOurs = ownerPath.includes('study-timer') || ownerPath.includes('溯迹') || ownerPath.includes('electron');
      if (!isOurs && (w.title || '').length >= 0) {
        const disp = screen.getDisplayMatching(w.bounds);
        const b = disp.bounds;
        const near = (a, c) => Math.abs(a - c) <= 2;
        if (near(w.bounds.x, b.x) && near(w.bounds.y, b.y) && near(w.bounds.width, b.width) && near(w.bounds.height, b.height)) {
          isExt = true; // 前台窗口铺满整块屏幕（含任务栏区）→ 判为外部全屏
        }
      }
    }
  } catch (e) { return; }

  if (isExt === externalFull) return; // 状态没变，不重复处理
  externalFull = isExt;
  const mode = fullscreenMode();
  if (isExt) {
    if (mode === 'hide') {
      timerWin.hide();
    } else {
      prevMiniBounds = timerWin.getBounds();
      const disp = screen.getDisplayMatching(timerWin.getBounds());
      const mw = 150, mh = 40;
      timerWin.setMinimumSize(60, 24);
      timerWin.setBounds({ x: Math.round(disp.bounds.x + (disp.bounds.width - mw) / 2), y: disp.bounds.y + 2, width: mw, height: mh });
      timerWin.webContents.send('external-fullscreen-changed', { active: true, mode: 'mini' });
      if (!timerWin.isVisible()) timerWin.show();
    }
  } else {
    if (mode === 'hide') {
      if (!timerWin.isVisible()) timerWin.show();
    } else {
      timerWin.webContents.send('external-fullscreen-changed', { active: false, mode: 'mini' });
      timerWin.setMinimumSize(360, 240);
      if (prevMiniBounds) timerWin.setBounds(prevMiniBounds);
    }
  }
}

function createStatsWindow() {
  if (statsWin && !statsWin.isDestroyed()) {
    statsWin.focus();
    return;
  }
  statsWin = new BrowserWindow({
    width: 720,
    height: 640,
    title: '溯迹 · 今日复盘',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  statsWin.loadFile(path.join(__dirname, 'src', 'stats.html'));
  statsWin.on('closed', () => { statsWin = null; });
}

// 今日总结：独立窗口（不再挤在悬浮窗里）。数据由悬浮窗经 open-summary 传来。
function createSummaryWindow() {
  if (summaryWin && !summaryWin.isDestroyed()) { summaryWin.focus(); return; }
  summaryWin = new BrowserWindow({
    width: 380,
    height: 580,
    title: '溯迹 · 今日总结',
    icon: path.join(__dirname, 'icon.ico'),
    resizable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  summaryWin.loadFile(path.join(__dirname, 'src', 'summary.html'));
  summaryWin.on('closed', () => { summaryWin = null; });
}

// 设置：独立窗口（不再是悬浮窗内的蒙版弹层），不受悬浮窗尺寸限制
function createSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 480,
    height: 620,
    title: '溯迹 · 设置',
    icon: path.join(__dirname, 'icon.ico'),
    resizable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  settingsWin.loadFile(path.join(__dirname, 'src', 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

// 开机目标/计划/奖励设定窗（独立窗口，居中）。确认后才显示悬浮窗。
function createOnboardWindow() {
  if (onboardWin && !onboardWin.isDestroyed()) { onboardWin.focus(); return; }
  onboardWin = new BrowserWindow({
    width: 500,
    height: 740,
    title: '溯迹 · 今天的目标',
    icon: path.join(__dirname, 'icon.ico'),
    resizable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  onboardWin.loadFile(path.join(__dirname, 'src', 'onboard.html'));
  onboardWin.on('closed', () => {
    onboardWin = null;
    // 用户没确认就关掉了设定窗 → 仍把悬浮窗显示出来，避免应用"看不见"
    if (timerWin && !timerWin.isDestroyed() && !timerWin.isVisible()) timerWin.show();
  });
}

// 全局快捷键：在任何软件里都能暂停/继续
function hotkeyHandler() {
  if (timerWin && !timerWin.isDestroyed()) timerWin.webContents.send('toggle-from-global');
}
function tryRegisterHotkey(acc) {
  try { return globalShortcut.register(acc, hotkeyHandler) && globalShortcut.isRegistered(acc); }
  catch (e) { return false; }
}
// 候选：用户没自定义时，按顺序挑一个没被占用的（如 Claude 的 Ctrl+Alt+空格会被跳过）
const HOTKEY_CANDIDATES = ['Control+Alt+S', 'Control+Shift+S', 'Control+Alt+X', 'Alt+Shift+S', 'Control+Alt+D'];
function setupHotkey() {
  const saved = loadSettings().hotkey;
  const list = saved ? [saved, ...HOTKEY_CANDIDATES] : HOTKEY_CANDIDATES; // 用户自定义优先
  for (const acc of list) { if (tryRegisterHotkey(acc)) { activeHotkey = acc; break; } }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null); // 去掉默认英文菜单栏（File/Edit/View…），统计窗口不再显示
  createTimerWindow();
  setupHotkey();
  setInterval(checkExternalFullscreen, 3000); // 外部全屏检测（迷你数字/隐藏）

  // 启动判定：进行中的多天计划 → 继续接续今天（即便昨天有缺额也不再硬失败，
  //   缺额由悬浮窗温柔提示并可补救）；仅当计划周期整个走完仍未完成 / 无目标 / oneShot 过期 → 弹设定窗
  const plan = loadPlan();
  const derived = planWithDerived(plan);
  const expired = derived && !derived.oneShot && !derived.planDone && derived.dayIndex > derived.totalDays;
  const active = derived && !expired && (
    (!derived.oneShot && !derived.planDone) ||
    (derived.oneShot && derived.confirmedToday)
  );
  if (active) {
    applyPlanToToday(plan); // 把计划目标写进当天，悬浮窗正常显示（暂停态）
  } else {
    if (timerWin && !timerWin.isDestroyed()) timerWin.hide();
    createOnboardWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createTimerWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// macOS 之外，关掉窗口就退出
app.on('window-all-closed', () => {
  app.quit();
});

// ---------- IPC：渲染进程读写数据 ----------
ipcMain.handle('load-day', (e, date) => loadDay(date || todayStr()));
ipcMain.handle('save-day', (e, data) => { saveDay(data); return true; });
ipcMain.handle('today-str', () => todayStr());
ipcMain.handle('get-hotkey', () => activeHotkey);

// 用户自定义快捷键：注册成功则持久化；失败（被占用/无效）则恢复原快捷键并返回 ok:false
ipcMain.handle('set-hotkey', (e, accel) => {
  if (!accel) return { ok: false, hotkey: activeHotkey };
  const prev = activeHotkey;
  if (prev) globalShortcut.unregister(prev);
  if (tryRegisterHotkey(accel)) {
    activeHotkey = accel;
    const s = loadSettings(); s.hotkey = accel; saveSettings(s);
    return { ok: true, hotkey: accel };
  }
  if (prev && tryRegisterHotkey(prev)) activeHotkey = prev; // 恢复
  return { ok: false, hotkey: activeHotkey };
});

// 读取当前最前台窗口（进程路径 + 标题），用于内容分类；读不到返回 null
ipcMain.handle('active-window', async () => {
  try {
    const fn = await getActiveWindowFn();
    const w = await fn();
    if (!w) return null;
    return { title: w.title || '', owner: (w.owner && (w.owner.path || w.owner.name)) || '' };
  } catch (e) {
    return null;
  }
});
ipcMain.on('open-stats', () => createStatsWindow());
ipcMain.on('open-settings', () => createSettingsWindow());
ipcMain.on('open-onboard', () => createOnboardWindow());
ipcMain.on('quit-app', () => app.quit());

// 今日总结独立窗口：悬浮窗算好 payload → 暂存 → 开窗；新窗加载时取走
ipcMain.on('open-summary', (e, payload) => { pendingSummary = payload || null; createSummaryWindow(); });
ipcMain.handle('load-summary', () => pendingSummary);
// 总结窗关闭：退出场景直接退应用（数据悬浮窗已先结算保存）；庆祝场景仅关窗
ipcMain.on('close-summary', (e, thenQuit) => {
  if (thenQuit) { app.quit(); return; }
  if (summaryWin && !summaryWin.isDestroyed()) summaryWin.close();
});

// 设置窗修改目标时长：写入当天数据并通知悬浮窗即时更新（打开设置时悬浮窗已暂停，文件是最新的）
ipcMain.handle('set-goal', (e, h) => {
  const d = loadDay(todayStr());
  d.goalHours = h;
  saveDay(d);
  if (timerWin && !timerWin.isDestroyed()) timerWin.webContents.send('goal-updated', h);
  return true;
});

// 清除今日记录：当前记录归档（复盘仍可查），其余字段从零重置（目标/归档保留），通知悬浮窗重载
ipcMain.handle('clear-today', () => {
  const d = loadDay(todayStr());
  const hasContent = (d.totalFocusedMs > 0) || (d.sessions && d.sessions.length > 0);
  if (hasContent) {
    if (!d.archives) d.archives = [];
    d.archives.push({
      totalFocusedMs: d.totalFocusedMs,
      sessions: d.sessions || [],
      pauses: d.pauses || [],
      longestStreakMs: d.longestStreakMs || 0,
      categories: d.categories || { video: 0, client: 0, other: 0 },
      apps: d.apps || {},
      appsByCat: d.appsByCat || { video: {}, client: {}, other: {} },
      archivedAt: new Date().toISOString()
    });
  }
  d.totalFocusedMs = 0;
  d.sessions = [];
  d.pauses = [];
  d.longestStreakMs = 0;
  d.categories = { video: 0, client: 0, other: 0 };
  d.apps = {};
  d.appsByCat = { video: {}, client: {}, other: {} };
  d.currentHour = { hourIdx: 0, samples: [], pauseMarks: [] };
  saveDay(d);
  if (timerWin && !timerWin.isDestroyed()) timerWin.webContents.send('day-cleared');
  return true;
});
ipcMain.on('toggle-fullscreen', () => toggleFullscreen());

// 渲染层按内容自适应窗口高度（保持位置/宽度不变）
ipcMain.on('resize-window', (e, height) => {
  if (isFull) return; // 全屏态不按内容改高
  if (timerWin && !timerWin.isDestroyed()) {
    const b = timerWin.getBounds();
    timerWin.setBounds({ x: b.x, y: b.y, width: b.width, height: Math.max(120, Math.round(height)) });
  }
});

// 系统通知：满整点小时时弹 Windows toast（即使在别的软件里也能看到）
ipcMain.on('notify-hour', (e, n, goalHours) => {
  if (!Notification.isSupported()) return;
  const done = n >= goalHours;
  new Notification({
    silent: true, // 静音，避免和应用内的叮声重叠冲突
    title: done ? '🎉 溯迹 · 今日目标达成！' : '⏱ 溯迹 · 专注打卡',
    body: done
      ? `已专注满 ${n} 小时，目标完成，去领奖励吧 🎁`
      : `已完成第 ${n} 小时！继续保持 💪（目标 ${goalHours}h）`
  }).show();
});

// 开机自启
ipcMain.handle('get-autostart', () => app.getLoginItemSettings().openAtLogin);
ipcMain.on('set-autostart', (e, val) => {
  app.setLoginItemSettings({ openAtLogin: !!val });
});

// ---------- 计划（多天 + 连续打卡 + 奖励） ----------
ipcMain.handle('load-plan', () => planWithDerived(loadPlan()));

// 按奖励给一个趣味默认计划名（onboard 实时预览占位用）
ipcMain.handle('suggest-plan-name', (e, reward) => planNameFromReward(reward, todayStr()));

// 确认计划（来自 onboarding）：写 plan.json + 同步当天目标，通知悬浮窗并显示
// incoming: { goalHours, oneShot, durationDays, reward, rewardCustom, restart }
ipcMain.handle('confirm-plan', (e, incoming) => {
  incoming = incoming || {};
  const today = todayStr();
  // 计划天数夹紧 1–5（最多 5 天）
  const clampDays = (n) => Math.max(1, Math.min(5, Math.round(Number(n) || 1)));
  const prev = loadPlan();
  let plan;
  const givenName = (incoming.name && incoming.name.trim()) ? incoming.name.trim() : '';        // 用户手填的名字
  const autoName = (incoming.nameAuto && incoming.nameAuto.trim()) ? incoming.nameAuto.trim() : ''; // onboard 预览过的趣味名（保证预览=最终）
  if (incoming.restart || !prev) {
    plan = {
      goalHours: incoming.goalHours || 12,
      oneShot: !!incoming.oneShot,
      durationDays: incoming.oneShot ? 1 : clampDays(incoming.durationDays),
      reward: incoming.reward || '',
      rewardCustom: !!incoming.rewardCustom,
      name: givenName || autoName || planNameFromReward(incoming.reward, today),
      nameCustom: !!givenName,
      startDate: today,
      completedDates: [],
      lastConfirmedDate: today
    };
  } else {
    // 继续进行中的多天计划：保留 startDate / completedDates / 计划名，只更新目标/奖励/确认日
    plan = Object.assign({}, prev, {
      goalHours: incoming.goalHours || prev.goalHours || 12,
      oneShot: incoming.oneShot != null ? !!incoming.oneShot : !!prev.oneShot,
      durationDays: incoming.oneShot ? 1 : clampDays(incoming.durationDays || prev.durationDays),
      reward: incoming.reward != null ? incoming.reward : (prev.reward || ''),
      rewardCustom: !!incoming.rewardCustom,
      // 计划名：用户这次手填了就用新的；否则沿用旧名（进行中不随奖励乱改名）
      name: givenName || prev.name || autoName || planNameFromReward(incoming.reward || prev.reward, prev.startDate || today),
      nameCustom: givenName ? true : !!prev.nameCustom,
      lastConfirmedDate: today
    });
    if (!plan.startDate) plan.startDate = today;
    if (!plan.completedDates) plan.completedDates = [];
  }
  savePlan(plan);
  // 同步把目标写进当天数据（沿用 set-goal 的语义）
  const d = loadDay(today);
  d.goalHours = plan.goalHours;
  saveDay(d);
  const derived = planWithDerived(plan);
  if (timerWin && !timerWin.isDestroyed()) {
    timerWin.webContents.send('goal-updated', plan.goalHours);
    timerWin.webContents.send('plan-updated', derived);
    timerWin.show();
    timerWin.focus();
    timerWin.webContents.send('start-focus'); // 主动设完目标 → 直接开始计数
  }
  if (onboardWin && !onboardWin.isDestroyed()) onboardWin.close();
  return derived;
});

// 今日达标：把今天记入 completedDates（去重）。返回派生进度 + 是否首次达标 / 是否刚完成整个计划
ipcMain.handle('mark-day-complete', () => {
  const today = todayStr();
  const plan = loadPlan();
  if (!plan) return null;
  if (!plan.completedDates) plan.completedDates = [];
  let firstTime = false;
  if (!plan.completedDates.includes(today)) {
    plan.completedDates.push(today);
    firstTime = true;
    savePlan(plan);
  }
  const derived = planWithDerived(plan);
  return Object.assign({}, derived, { firstTime, justFinishedPlan: firstTime && derived.planDone });
});

// 漏天补救：计划延后一天（多给一次机会，把缺的那天补到末尾）。记今天已提示，避免重复弹。
ipcMain.handle('postpone-plan', () => {
  const plan = loadPlan();
  if (!plan) return null;
  plan.durationDays = Math.min(60, (plan.durationDays || 1) + 1); // 补救可超原 5 天上限
  plan.lastPromptDate = todayStr();
  savePlan(plan);
  const derived = planWithDerived(plan);
  if (timerWin && !timerWin.isDestroyed()) timerWin.webContents.send('plan-updated', derived);
  return derived;
});

// 漏天提示「就这样继续」：仅记今天已提示，不改计划。
ipcMain.handle('ack-shortfall', () => {
  const plan = loadPlan();
  if (!plan) return null;
  plan.lastPromptDate = todayStr();
  savePlan(plan);
  return planWithDerived(plan);
});

// ---------- 分神检测（系统空闲时间，无需全局键鼠钩子） ----------
ipcMain.handle('get-idle-time', () => {
  try { return powerMonitor.getSystemIdleTime(); } // 秒
  catch (e) { return 0; }
});
// 把悬浮窗拉到前台并闪烁，提醒"你分神了"
ipcMain.on('flash-attention', () => {
  if (!timerWin || timerWin.isDestroyed()) return;
  if (!timerWin.isVisible()) timerWin.show();
  try { timerWin.flashFrame(true); } catch (e) { /* 忽略 */ }
  try { timerWin.moveTop(); } catch (e) { /* 忽略 */ }
});

// 全屏看视频时的表现：mini（顶部迷你数字）/ hide（完全隐藏）
ipcMain.handle('get-fs-mode', () => ({ fullscreenMode: fullscreenMode() }));
ipcMain.handle('set-fs-mode', (e, v) => {
  v = v || {};
  const s = loadSettings();
  if (v.fullscreenMode === 'hide' || v.fullscreenMode === 'mini') s.fullscreenMode = v.fullscreenMode;
  saveSettings(s);
  // 若切到 hide 而当前正处于 mini 迷你态，先把迷你态收掉，避免残留窄条
  if (s.fullscreenMode === 'hide' && externalFull && timerWin && !timerWin.isDestroyed()) {
    timerWin.webContents.send('external-fullscreen-changed', { active: false, mode: 'mini' });
    timerWin.setMinimumSize(360, 240);
    if (prevMiniBounds) timerWin.setBounds(prevMiniBounds);
    timerWin.hide();
  }
  return true;
});

// 作息：熬夜党模式（存 settings.json）。改动后通知悬浮窗在暂停态下重载今天数据。
ipcMain.handle('get-day-settings', () => ({ nightOwl: loadSettings().nightOwl === true }));
ipcMain.handle('set-day-settings', (e, v) => {
  v = v || {};
  const s = loadSettings();
  if (v.nightOwl != null) s.nightOwl = !!v.nightOwl;
  saveSettings(s);
  if (timerWin && !timerWin.isDestroyed()) timerWin.webContents.send('day-settings-updated');
  return true;
});

// 分神提醒设置（存 settings.json，默认开启 / 5 分钟 / 再提醒）
ipcMain.handle('get-idle-settings', () => {
  const s = loadSettings();
  return {
    idleEnabled: s.idleEnabled !== false,
    idleMinutes: s.idleMinutes || 5,
    idleRemind: s.idleRemind !== false
  };
});
ipcMain.handle('set-idle-settings', (e, v) => {
  v = v || {};
  const s = loadSettings();
  if (v.idleEnabled != null) s.idleEnabled = !!v.idleEnabled;
  if (v.idleMinutes != null) s.idleMinutes = Math.max(1, Number(v.idleMinutes) || 5);
  if (v.idleRemind != null) s.idleRemind = !!v.idleRemind;
  saveSettings(s);
  if (timerWin && !timerWin.isDestroyed()) timerWin.webContents.send('idle-settings-updated');
  return true;
});
