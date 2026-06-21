const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadDay: (date) => ipcRenderer.invoke('load-day', date),
  saveDay: (data) => ipcRenderer.invoke('save-day', data),
  todayStr: () => ipcRenderer.invoke('today-str'),
  getHotkey: () => ipcRenderer.invoke('get-hotkey'),
  setHotkey: (accel) => ipcRenderer.invoke('set-hotkey', accel),
  getActiveWindow: () => ipcRenderer.invoke('active-window'),
  openStats: () => ipcRenderer.send('open-stats'),
  openSettings: () => ipcRenderer.send('open-settings'),
  setGoal: (h) => ipcRenderer.invoke('set-goal', h),
  onGoalUpdated: (cb) => ipcRenderer.on('goal-updated', (e, h) => cb(h)),
  clearToday: () => ipcRenderer.invoke('clear-today'),
  onDayCleared: (cb) => ipcRenderer.on('day-cleared', cb),
  quitApp: () => ipcRenderer.send('quit-app'),
  resizeWindow: (h) => ipcRenderer.send('resize-window', h),
  notifyHour: (n, goalHours) => ipcRenderer.send('notify-hour', n, goalHours),
  getAutostart: () => ipcRenderer.invoke('get-autostart'),
  setAutostart: (val) => ipcRenderer.send('set-autostart', val),
  // 全屏切换 + 状态回调
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  onFullscreenChanged: (cb) => ipcRenderer.on('fullscreen-changed', (e, isFull) => cb(isFull)),
  // 用户手动拉伸窗口的通知（之后不再自动按内容改高）
  onUserResized: (cb) => ipcRenderer.on('user-resized', cb),
  // 全局快捷键触发的暂停/继续
  onGlobalToggle: (cb) => ipcRenderer.on('toggle-from-global', cb),

  // ---------- 计划（多天 + 连续打卡 + 奖励） ----------
  loadPlan: () => ipcRenderer.invoke('load-plan'),
  confirmPlan: (p) => ipcRenderer.invoke('confirm-plan', p),
  onPlanUpdated: (cb) => ipcRenderer.on('plan-updated', (e, p) => cb(p)),
  markDayComplete: () => ipcRenderer.invoke('mark-day-complete'),
  openOnboard: () => ipcRenderer.send('open-onboard'),
  onStartFocus: (cb) => ipcRenderer.on('start-focus', cb),

  // ---------- 分神检测 ----------
  getIdleTime: () => ipcRenderer.invoke('get-idle-time'),
  flashAttention: () => ipcRenderer.send('flash-attention'),
  getIdleSettings: () => ipcRenderer.invoke('get-idle-settings'),
  setIdleSettings: (v) => ipcRenderer.invoke('set-idle-settings', v),
  onIdleSettingsUpdated: (cb) => ipcRenderer.on('idle-settings-updated', cb)
});
