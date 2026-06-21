const MAX_HOURS = 14;

// 提示音（Web Audio，无需音频文件）——用于"超过上限"的提醒
let audioCtx = null;
function playWarnDing() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = [330, 262]; // 下行两音，表示"不行/收回"
    notes.forEach((freq, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      const t = audioCtx.currentTime + i * 0.13;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t); o.stop(t + 0.5);
    });
  } catch (e) { /* 忽略音频错误 */ }
}

// 超上限提醒：震动窗口内容 + 提示音 + 文字提示（即使系统静音，震动也能看到）
function warnOverLimit() {
  const warn = document.getElementById('goal-warn');
  warn.classList.remove('hidden');
  document.body.classList.remove('shake');
  void document.body.offsetWidth; // 强制重排，确保连续触发也能重新播放
  document.body.classList.add('shake');
  setTimeout(() => document.body.classList.remove('shake'), 460);
  playWarnDing();
}

function prettyHotkey(acc) {
  return acc.replace('CommandOrControl', 'Ctrl').replace('Control', 'Ctrl').replace('Super', 'Win');
}

async function saveGoal(h) {
  await window.api.setGoal(h);
  window.close(); // 保存后关闭设置窗
}

// 自定义输入保存：>14 给提示+震动+音并修正，不关闭；否则保存关闭
function saveCustom() {
  const inp = document.getElementById('goal-input');
  let raw = Number(inp.value);
  if (!raw || raw < 1) return;
  if (raw > MAX_HOURS) {
    inp.value = MAX_HOURS;
    warnOverLimit();
    return;
  }
  document.getElementById('goal-warn').classList.add('hidden');
  saveGoal(raw);
}

// ---------- 快捷键录制 ----------
let recordingHotkey = false;
function hotkeyMainKey(e) {
  const k = e.key;
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(k)) return null;
  if (/^[a-zA-Z]$/.test(k)) return k.toUpperCase();
  if (/^[0-9]$/.test(k)) return k;
  if (/^F([1-9]|1[0-2])$/.test(k)) return k;
  const map = { ' ': 'Space', 'ArrowUp': 'Up', 'ArrowDown': 'Down', 'ArrowLeft': 'Left', 'ArrowRight': 'Right' };
  return map[k] || null;
}
async function refreshHotkeyDisplay() {
  const hk = await window.api.getHotkey();
  document.getElementById('hotkey-display').textContent = hk ? prettyHotkey(hk) : '未设置';
}
function setupHotkeyEdit() {
  const btn = document.getElementById('hotkey-edit');
  const disp = document.getElementById('hotkey-display');
  btn.addEventListener('click', () => {
    recordingHotkey = !recordingHotkey;
    btn.textContent = recordingHotkey ? '取消' : '修改';
    if (recordingHotkey) disp.textContent = '请按下组合键…';
    else refreshHotkeyDisplay();
  });
  window.addEventListener('keydown', async (e) => {
    if (!recordingHotkey) return;
    e.preventDefault();
    if (e.key === 'Escape') { recordingHotkey = false; btn.textContent = '修改'; refreshHotkeyDisplay(); return; }
    const main = hotkeyMainKey(e);
    if (!main) return;
    const mods = [];
    if (e.ctrlKey) mods.push('Control');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    if (e.metaKey) mods.push('Super');
    if (mods.length === 0) { disp.textContent = '需配合 Ctrl / Alt / Shift'; return; }
    const res = await window.api.setHotkey([...mods, main].join('+'));
    recordingHotkey = false;
    btn.textContent = '修改';
    disp.textContent = (res && res.ok) ? prettyHotkey(res.hotkey) : '该组合不可用，请换一个';
  }, true);
}

async function init() {
  const today = await window.api.todayStr();
  const data = await window.api.loadDay(today);
  document.getElementById('goal-input').value = data.goalHours;
  document.getElementById('autostart').checked = await window.api.getAutostart();
  await refreshHotkeyDisplay();

  document.querySelectorAll('.presets button').forEach(b => {
    b.addEventListener('click', () => saveGoal(Number(b.dataset.h)));
  });
  document.getElementById('goal-save').addEventListener('click', saveCustom);
  document.getElementById('goal-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveCustom(); });
  document.getElementById('autostart').addEventListener('change', (e) => window.api.setAutostart(e.target.checked));
  setupHotkeyEdit();

  // 分神提醒设置
  try {
    const idle = await window.api.getIdleSettings();
    document.getElementById('idle-enabled').checked = idle.idleEnabled;
    document.getElementById('idle-minutes').value = idle.idleMinutes;
  } catch (e) { /* 忽略 */ }
  document.getElementById('idle-enabled').addEventListener('change', (e) =>
    window.api.setIdleSettings({ idleEnabled: e.target.checked }));
  document.getElementById('idle-minutes').addEventListener('change', (e) => {
    let v = Math.max(1, Math.min(60, Number(e.target.value) || 5));
    e.target.value = v;
    window.api.setIdleSettings({ idleMinutes: v });
  });

  // 清除今日记录（二次确认；旧记录归档不丢，复盘可查）
  const clearBtn = document.getElementById('clear-today');
  let clearArmed = false;
  let clearTimer = null;
  clearBtn.addEventListener('click', async () => {
    if (!clearArmed) {
      clearArmed = true;
      clearBtn.classList.add('armed');
      clearBtn.textContent = '确认清除？';
      clearTimer = setTimeout(() => {
        clearArmed = false;
        clearBtn.classList.remove('armed');
        clearBtn.textContent = '清除记录';
      }, 3500);
      return;
    }
    clearTimeout(clearTimer);
    await window.api.clearToday();
    window.close();
  });
}

init();
