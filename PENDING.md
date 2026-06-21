# 改动历史

> ⚠️ **2026-06-21 v15 已写完源码、待打包**：本批从 git 分阶段提交（仓库已 init，A→D 共 7 个提交）。
> **改了 `main.js`/`preload.js` 与多个 `src/*` + 新增 `src/summary.html`/`summary.js`，必须重新打包才在用户日常 exe 里生效**（命令见最底部；建议加 `--ignore="^/\.devdata"` 排除测试数据）。详见下方「v15」段。
>
> ✅ **2026-06-17 已打包**：v13 大升级全部打包上线（输出仍为 `dist\溯迹-win32-x64\溯迹.exe`，快捷方式路径不变）。详见下方「v13」段。
>
> ✅ **2026-06-15 已再次打包**：v6～v12 全部打包上线（输出仍为 `dist\溯迹-win32-x64\溯迹.exe`，桌面/开机快捷方式路径不变）。
> 下方 v6～v12 各条均已生效。以后再改源码仍需重新打包（命令见最底部）。
>
> ✅ **2026-06-14 已重新打包**：输出名"溯迹"，新 exe 在 `dist\溯迹-win32-x64\溯迹.exe`，
> 桌面 + 开机启动快捷方式都已指向它（旧的 `dist\StudyTimer-win32-x64` 已废弃，可手动删）。
> 下方所有改动现已生效。以后再改源码仍需重新打包（命令见最底部）。

## v15：今日总结独立窗 + 跨天逻辑修正 + 全屏看视频 + UI 规范（2026-06-21 ⚠️待打包）
新增文件：`src/summary.html` + `src/summary.js` + `DESIGN.md`。改动：`main.js`、`preload.js`、`src/timer.js`/`timer.html`/`timer.css`、`src/settings.html`/`settings.js`、`src/onboard.html`/`onboard.js`、`src/stats.js`、`.gitignore`。
- **A1 暂停旗子遮挡**：`#center-slot`/`#hour-wrap` 边距加大，最小窗口下大数字不再压住旗子。
- **A2 今日总结独立成窗**：第五个 BrowserWindow `createSummaryWindow`；悬浮窗 `buildSummaryPayload` 算好数据经 `open-summary` 交主进程开窗，`close-summary` 区分退出收工(关即退)/计划庆祝(仅关)；撒花/叮声移入 summary。退役悬浮窗内 `#ceremony` 浮层 + CSS。**修了"总结被困小窗、退不出"**。
- **B1 熬夜党模式**：`todayStr()` 减 `dayResetHour`（默认 0；`nightOwl` 开=6）。`get/set-day-settings` IPC + 设置窗开关 + 切换后悬浮窗暂停态软重载。
- **B4 分神自动暂停 + 时间回拨**：`autoPauseForIdle`（按 `idleSec` 回拨被误计专注、休息从空闲起点、暂不写 `pauses`）+ `idleWasFocus`/`idleWasDistraction` 事后裁决。弹窗文案改"已自动暂停 / 刚才在专注·刚才分神"。
- **B2 漏天温柔降级**：`planWithDerived` 加 `quality`(Σmin(实际,目标)/(目标×已过天数))/`hasShortfall`/`promptedToday`；去掉 `broken` 硬失败、启动不再静默接续而是 `#shortfall-overlay` 温柔提示（`postpone-plan` 延后一天 / `ack-shortfall` 继续）；完成度展示进总结/onboard/设置/复盘。
- **B3 计划趣味命名**：`planNameFromReward` + `plan.name`/`nameCustom` + `suggest-plan-name` IPC；onboard 选填名+占位预览；设置「当前计划」+复盘头部展示。
- **C 全屏看视频**：主进程 `checkExternalFullscreen`(每3s) → `body.mini` 顶部药丸 / 隐藏；`fullscreenMode` 设置 + `get/set-fs-mode` IPC + 设置窗单选。
- **D UI 打磨**：`DESIGN.md` 设计规范；复盘/设置/onboard 自定义滚动条+焦点态；清死样式（`#goal-modal`/`#plan-banner.broken`）。
- **工程**：`appRoot()` 支持 `STUDYTIMER_DATA_DIR` 隔离测试数据；项目 `git init`。

## v13：目标/计划/奖励 + 分神 + 智能退出 + 复盘重构（2026-06-17 已打包）
新增文件：`src/onboard.html` + `src/onboard.js`。改动：`main.js`、`preload.js`、`src/timer.js`/`timer.html`/`timer.css`、`src/categories.js`、`src/settings.html`/`settings.js`、`src/stats.html`/`stats.js`。
1. **目标/计划/奖励设定窗（onboard）**：目标小时 + 计划天数（仅此一次 / **最多 5 天**，超 5 修正+提示）+ 奖励（预设 chips + 手动；**不进悬浮窗按钮**）+ 奖励预览。跨天存 `plan.json`（`startDate`/`completedDates`/`lastConfirmedDate`），`planWithDerived` 算 `dayIndex`/`currentStreak`/`planDone`/`broken`/`confirmedToday`。
2. **启动流程**：进行中长期目标第二天不弹窗、`applyPlanToToday` 自动接续；无目标/首次/完成/断签 → 弹设定窗。悬浮窗启动一律暂停态；大按钮三态等高（`min-height`）：有目标「点我开始专注」+计划进度副行 / 无目标「开始设定目标」/ 失败「目标已失败，请重新设立目标」。设定窗确认即 `start-focus` 自动开始；无目标态 ✕ 直接退出。
3. **细粒度识别**：`categories.detail()` → `{bucket,task}`（PS/PR/SU/Enscape…、B站/小红书/知乎/YouTube/抖音…）；`sampleCategory` 写 `data.apps`（扁平）+ `data.appsByCat`（按大类分组）。
4. **分神检测**：`powerMonitor.getSystemIdleTime()`（看视频豁免），默认 5min → 提示音 + `flashFrame` + 弹窗（我在专注 / 帮我暂停 / 之后是否再提醒）。设置页可调开关与分钟。
5. **连续 2h 休息提醒**：单段连续每满 2h 弹随机一条建议，可"去休息(自动暂停)"。
6. **智能退出 ✕**：做完→[查看总结][直接退出]；没做完→[继续][放弃并退出+二次确认]；无目标→直接退出。仪式总结卡复用 `ceremonyThenQuit` 区分庆祝(只关)/退出(关即退)；计划完成有大庆祝。
7. **复盘页重构**：4 看板吸顶 + 左侧标签栏滚动定位（IntersectionObserver）+ 时间线改**每小时产出折线图**(自绘 SVG) + 内容分类**可展开**看应用深浅条（读 `appsByCat`）。
8. **设置页**：加分神提醒区、清除记录挪到目标保存旁、文案压一行、窗口缩到无滚轮（480×430）。
9. **bug 修复**：暂停时计数大字与休息数字重叠 → `pause()` 里 `showRest()`/`setTimeVisibility()` 顺序对调。
- 新 IPC：`load-plan`/`confirm-plan`/`mark-day-complete`/`open-onboard`/`start-focus`/`get-idle-time`/`flash-attention`/`get-idle-settings`/`set-idle-settings`。
- 每日 JSON 新增 `apps`/`appsByCat`（`loadDay` 兼容补、`clear-today` 重置、归档带上）。

## 已完成代码改动（等打包）
1. **全局快捷键修复**：原 `Ctrl+Alt+Space` 与 Claude 桌面端唤出键冲突，已改为
   `Ctrl+Alt+S`，并加了自动避让（被占用就自动换 Ctrl+Shift+S / Ctrl+Alt+X 等），
   当前生效的快捷键会显示在悬浮窗底部提示里。
   - 改动文件：`main.js`（候选列表 + 注册逻辑）、`preload.js`、`src/timer.js`（显示提示）
2. **应用改名「溯迹」**：
   - 悬浮窗左上角显示「溯迹」（`src/timer.html` / `src/timer.css` 的 `#appname`）
   - 系统通知标题、复盘页标题都带「溯迹」（`main.js`、`src/stats.html`）
   - `package.json` 加了 `"productName": "溯迹"`
   - 数据目录已与应用名解耦（固定 `%APPDATA%\study-timer\data`），改名不丢数据
3. **桌面/开机快捷方式**：已即时改名为「溯迹」并用眼睛图标（这步已生效，无需打包）

## 下次打包时顺带要做
- [ ] 把眼睛图标（`app-icon-eye.ico` / `icon.ico`）烧进 exe 内部（`--icon`）
- [ ] 打包输出名也改成「溯迹」
- [ ] 你新的 UI 想法（待补充）

## v2 功能：按内容自动分类专注时间（已写完代码，等打包生效）
- 依赖 `get-windows` 已安装；检测在你电脑实测可读到前台窗口（进程路径 + 标题）
- 分类规则在 `src/categories.js`（看视频靠浏览器+标题关键词、客户沟通靠企业微信/微信/QQ 进程名），
  单元测试 10/10 通过；以后想加规则（如网盘看视频）改这个文件即可
- 改动文件：`main.js`(active-window IPC + loadDay 兼容 categories)、`preload.js`、
  `src/timer.html/css/js`(悬浮窗"当前：xx"实时标签 + 每5秒采样累计)、`src/stats.html/js`(分类占比条)
- 打包后效果：悬浮窗底部显示「当前：看视频/客户沟通/其他」；复盘页多一块三类时长+百分比条形图

## v3 功能：南瓜暖秋配色 + 暂停色 + 当前小时浓缩条（已写完代码，等打包生效）
- 整套换成南瓜暖秋色卡（CSS 变量管理）：BISTRE 底 / COCOA 主橙 / PERSIAN 次橙 / NAVAJO 奶白 / KHAKI 暖灰
- 暂停色去掉西瓜红：暂停态文字/大时间=KHAKI，运行时"暂停"按钮=PERSIAN
- 上方"点点进度条"重构为「当前小时浓缩时间轴」：进度填充 + 内容分段着色（看视频=橙/客户沟通=暖灰/其他=奶白）
  + 每次暂停插白旗 + 60 分钟终点红旗；下方徽章墙保留作宏观进度。仅当前小时、不存历史
- 数据模型加 `currentHour:{hourIdx,samples,pauseMarks}`（main.js loadDay 已加默认+兼容）
- 改动文件：`src/timer.css`(整套换色+浓缩条样式)、`src/timer.html`(#hour-wrap 结构)、
  `src/timer.js`(renderHour/buildHourGradient/makeFlag + currentHour 逻辑 + 撒花换色)、
  `src/categories.js`+`src/stats.js`(「其他」→「其他工作/学习」)、`src/stats.html`(复盘页同步换色)
- 文案微调：「其他」→「其他工作/学习」（计时由用户主动开启，三类全是有效产出）
- 布局精简（v3.1）：快捷键提示移进设置弹层（删掉主界面那行）；本次专注/当前内容/今日暂停
  合并成一行三信息；浓缩条移到暂停按钮正上方并贴合等长（底边平接按钮顶边，为以后履带/萝卜
  可爱进度条留结构）；改动：`src/timer.html`、`src/timer.css`、
  `src/timer.js`(openGoalModal 显示快捷键、去掉 #hint)、`main.js`(winHeight)
- 布局精简（v3.2）：「第X小时·MM/60分钟」标签移到按钮与徽章之间；大时间与旗子/浓缩条间留 10px 间距；
  窗口高度改为**按内容自适应**（卡片去掉固定高度+flex；`main.js` 加 resize-window IPC、
  `preload.js` 加 resizeWindow、`src/timer.js` 加 fitWindow 在 init/改目标后调用）
- 专注/休息双态 + 动效（v3.3）：
  · 专注时中央显示专注总时长；暂停时该时长缩小上移到左上角（状态文字后的 #mini-focus），
    中央原位换成「休息计时」从 0 起算；恢复时休息计时左滑消失、专注时长飞回中央放大。
  · 动效：#focus-time 用 CSS transform 过渡（随 card.running/paused 切换）；
    #rest-time 用 restIn（原地淡入）/restOut（左滑淡出）keyframes。
  · 状态点改为**眼睛图标**：睁眼=专注、闭眼=暂停（占位 SVG 在 `src/timer.js` 的
    EYE_OPEN/EYE_CLOSED 常量，用户后续替换专属 icon）。
  · 改动：`src/timer.html`(dragbar 加 #status-eye/#mini-focus、中央 #center-slot 含 #focus-time/#rest-time)、
    `src/timer.css`(眼睛/双态/动效样式)、`src/timer.js`(updateEye/showRest/hideRest/updateRest + start/pause/tick/init)。

## v4：引入 Lucide 图标库（已写完代码，等打包生效）
- 安装官方 **`lucide`**（纯 HTML/JS 版）。⚠️ **打包大坑（已修）**：electron-packager 会把
  `node_modules/lucide` 的整个 `dist/` 子目录裁掉，只留 LICENSE/package.json/README，导致打包后
  `lucide.min.js` 404 → `window.lucide` undefined → `init()` 抛错 → **整个悬浮窗卡死、图标全无**。
  **修法**：把 UMD 文件随源码放进 `src/lucide.min.js`（src 一定打包进去），两页用 `<script src="lucide.min.js">` 引入；
  并在 `timer.js` 加 `LU`/`luCreate`/`luRender` 兜底——图标库万一缺失也只是不显示，绝不卡死。
  → **以后任何前端库都别从 node_modules 引，一律 vendoring 进 `src/`。**
- 静态图标用 `<i data-lucide="名字">` + 启动时 `lucide.createIcons()` 渲染；
  动态图标（大按钮 play/pause、浓缩条旗子、复盘奖杯）用 `lucide.createElement(lucide.Xxx)`
- 颜色全部走 `stroke="currentColor"`、尺寸用 CSS 控制，跟随南瓜暖秋配色
- 替换映射：
  · 悬浮窗工具栏 📊→`bar-chart-3`、⚙️→`settings`、✕→`x`
  · 大按钮 ▶/⏸→`play`/`pause`（图标+文案，仅状态切换时重建）
  · 浓缩条里程碑旗子（原手绘 SVG）→`flag`（终点红旗 flag-end / 暂停旗 flag-pause，颜色 CSS 控制）
  · 目标弹层标题加 `target`、达成庆祝层 🎉🎁→`trophy`
  · 复盘页四卡标签：专注总时长`trending-up` / 目标完成度`target` / 最长连续专注`flame` / 分心暂停次数`pause`
  · 复盘页金牌 🏅→`trophy`（.medal）
- 已按你要求**只引库、不加新按钮**；`square`(结束本次)/`rotate-ccw`(重置)/`minus`(最小化)/`pin`(置顶)
  这 4 个图标在 lucide 里已可用，等你后续要加对应按钮时直接 `data-lucide` 即可
- 改动文件：`package.json`、`src/timer.html`、`src/timer.css`、`src/timer.js`、`src/stats.html`、`src/stats.js`
- ⚠️ 眼睛状态图标**未动**（仍是 timer.js 里的 EYE_OPEN/EYE_CLOSED 占位，按既定计划保留你后续替换专属 icon）

## v5：眼睛自绘 + 窗口变扁 + 文案（已写完代码，已打包上线）
- **眼睛状态图标自绘**（替换原占位）：
  · 睁眼=品牌放射眼——杏仁眶（miter 尖角）+ 虹膜外环 + 实心瞳孔 + 上方 5 道放射光芒（兼当上睫毛），
    呼应 `icon.svg` 的放射刻度但不做满圈 16 道刻度/月牙瞳孔，"神似不雷同"
  · 闭眼=单条向下闭合轮廓 + 3 根下睫毛
  · 颜色走 `currentColor`，由 `#card.running`→主橙 / `#card.paused`→暖灰 控制（CSS）
  · 尺寸：睁眼 26×17、闭眼 24×18（比初版放大，睫毛看得清）；常量在 `src/timer.js` 顶部 EYE_OPEN/EYE_CLOSED
- **窗口变扁长方形**：宽 340→**384**（按"最多 14 徽章单行"反推：14×19 + 13×5 ≈ 331 + 卡片内/外边距）；
  拖动栏 `white-space:nowrap` 一行排开；中央时间槽/浓缩条间距/徽章下边距收紧 → 整体更矮
- **目标上限锁 14 小时**：设置弹层 `goal-input` max=14、`applyGoal` 夹紧到 14（= 最多 14 徽章，与窗口宽度匹配）
- **暂停按钮文案**："分心了？点我暂停" → "**暂停一下，就一下！**"
- 改动文件：`main.js`(winWidth)、`src/timer.js`(EYE_OPEN/EYE_CLOSED、setToggleButton 文案、applyGoal 上限)、
  `src/timer.css`(#status-eye 尺寸+按状态着色、#dragbar nowrap、#mini-focus 位移、压高度)、`src/timer.html`(goal-input max)

## v6：打开程序不再立刻计休息（已写完代码，待打包生效）
- **问题**：以前一打开悬浮窗，中央就立刻出现「休息 00:00」并开始累计——可这时根本还没专注，
  记这段"休息"没有意义。
- **改法**：`src/timer.js` 的 `init()` 启动时不再调 `showRest()`，改为 `hideRest()`。
  休息计时只在「开始专注 → 再暂停」时（`pause()` 里的 `showRest()`）才出现并从 0 起算；
  恢复专注时 `start()` 里的 `hideRest()` 让它滑走。刚打开还没专注 → 中央留空，只显示「点我开始专注」。
- 改动文件：`src/timer.js`（init 末尾 showRest→hideRest）
- **开机自启动**：经查注册表 HKCU/HKLM Run、启动文件夹、任务计划程序均无 溯迹 自启动项，
  系统层面本就处于关闭状态，无需改动（设置弹层里的「开机自动启动」勾选框保持未勾选）。

## v7：交互/外观大改（已写完代码，待打包生效）
一批体验+外观升级，改动文件：`main.js`、`preload.js`、`src/timer.html`、`src/timer.css`、`src/timer.js`。
1. **暂停只由按钮触发**：删掉"点整张卡片切换"的监听（以前点中央跳动的数字会误触暂停）。
   现在切换专注/暂停只能靠：大按钮、Enter、全局快捷键。（`src/timer.js` bindEvents）
2. **方旗 → 实心三角旗**：里程碑旗子改自绘 SVG（细旗杆+实心三角旗面，暂停=奶白/终点=红），更醒目。
   约定：以后加图标先在 lucide 找，没有合适的或不满意才自绘（三角旗 lucide 没有故自绘）。
   （`src/timer.js` FLAG_SVG/makeFlag、`src/timer.css` .flag）
3. **旗子不溢出浓缩条**：去掉 `.flag` 的 `translateX(-50%)`，改"旗杆锚点+按容器宽夹紧 left%"，
   早暂停旗不戳左圆角、终点红旗不戳右边。（`src/timer.js` renderHour/makeFlag）
4. **徽章锁 14 + 超额自动点亮 + 鎏金区分**：徽章数 = `min(14, max(目标, 已完成小时))`，永不超 14/不换两行；
   超出目标但 ≤14 的"额外福利徽章"加 `.over` 鎏金+星光描边。（`src/timer.js` buildBadges/lightBadge、`src/timer.css` .badge.over）
5. **满 14h 劝退**：到 14h 进入 `overLimit`——有效专注封顶 14h（`commitElapsed` 不再累计/持久化），
   中央数字继续走但不计入（`displayTotalMs`），眼睛闭上，**暂停/专注按钮整块替换成劝退提示卡**
   （主"今天已经可以了"+副"今天已经做了很多了；再做下去，很难保证你真的在专注"），按钮失效。
   （`src/timer.js` checkMilestones/enterOverLimit/toggle/setToggleButton/liveTotalMs、`src/timer.css` #big-toggle.over-rest）
6. **去掉边框+投影**：`#card` 删掉橙色细边框与所有 box-shadow（含专注态外发光），卡片干净无边无晕。（`src/timer.css`）
7. **窗口可拉伸 + 自适应**：`main.js` 窗口 `resizable:true` + min(320×240)/max(720×600 且 ≤工作区70%)；
   `#card` 改 `height:100vh`+flex 列布局，中央字号 `clamp(38px,8vmin,82px)` 随窗口缩放；
   固定初始高 268 + flex 吸收余量（**停用了旧的 fitWindow**——它与 100vh 冲突会失真）；
   用户拖拽边缘（主进程 `will-resize`→`user-resized`）后不再自动改高。
8. **全屏极简巨字**：工具栏加全屏按钮（lucide `maximize`）→ IPC `toggle-fullscreen`，主进程 setBounds 撑满整屏；
   `body.fullscreen` 切到极简界面：不透明深底铺满 + 居中超大时间 `clamp(80px,22vmin,320px)`（vmin 基准，
   带鱼屏按高度缩放不溢出）+ 一行文案 + 角落退出按钮，隐藏其余元素。退出恢复原 bounds。
   （`main.js` toggleFullscreen/IPC、`preload.js`、`src/timer.html`、`src/timer.css` .fullscreen、`src/timer.js`）

> 已用开发版实跑截图验证：去边框、全屏按钮、三角旗（含不溢出）、徽章单行、暂停态中央留空、布局不破版均 OK。
> 专注态大字自适应 / 鎏金超额徽章 / 满14劝退卡 / 全屏巨字 等动态状态逻辑已写好（语法校验通过），建议打包后或开发版交互实测一遍。

## v8：数字过渡 FLIP + 全屏补全（已写完代码，待打包生效）
体验后追加，改动文件：`src/timer.js`、`src/timer.css`。
1. **数字过渡改用动态 FLIP**：去掉写死的 `#card.paused #focus-time { transform: translate(-104px,-62px) scale(.3) }`
   （拉大窗口后落点全错）。改由 JS 实时测量中央大字 `#focus-time` 与顶部小字 `#mini-focus` 的真实 rect，
   用 Web Animations API 在两处之间补间：暂停=大字飞到顶部缩小、专注=从顶部放大回中央，任何尺寸都精准衔接。
   新增 `animateTimeSwap(toMini)` + `setTimeVisibility()`；`start`/`pause`/`init`/`onFullscreenChanged` 调用；
   CSS 的 `#focus-time`/`#mini-focus` 改为初始 `opacity:0`、显隐交给 JS。
2. **全屏补回徽章/暂停键/浓缩条**（之前全屏把它们 display:none 了）：`body.fullscreen` 用 flex `order`+`margin:auto` 三段分布——
   徽章在**顶部一行**（随屏放大）、时间+文案+按钮**居中**、浓缩条**贴最底边**（旗子随屏放大，"地面插旗"感）。
   全屏暂停键改成**圆形图标按钮**（半透明底+奶白细描边+柔和橙发光、只留 ▶/⏸ 图标），点按仍 `toggle()`。
   隐藏项仅剩 `#dragbar`/`#hour-label`/`#liveinfo`。
- 已实跑截图验证默认态（顶部小字/中央空/三角旗/徽章）正常；FLIP 连贯动效与全屏三段布局建议交互/打包后实测。
- 已知小边缘：全屏 + 超14劝退同时出现时，圆形按钮里塞劝退两行字会挤（极罕见），暂未特殊处理。

## v9：体验后修正一批（已写完代码，待打包生效）
改动文件：`src/timer.js`、`src/timer.css`、`src/stats.html`、`main.js`。
1. **去掉数字飞行动效（撤销 v8 FLIP）+ 休息计时出现/消失动效**：`start`/`pause` 改用瞬时 `setTimeVisibility()`，
   删除 `animateTimeSwap`；`showRest`/`hideRest` 直接切 `#rest-time` opacity；CSS 删 `restIn/restOut` keyframes。
2. **旗子防密集**：`pause()` 插旗前判断——与上一面旗有效专注差 `<60s` 不插（`FLAG_MIN_GAP_MS`），
   且每小时 `≥12` 面不再插（`FLAG_MAX_PER_HOUR`）；新增模块变量 `lastFlagTotal`。只拦狂点，正常使用不受影响。
3. **中央数字字号更大**：`.bigtime` 由 `clamp(38px,8vmin,82px)` → `clamp(40px,17vmin,120px)`，拉到最大时明显更大。
4. **全屏暂停按钮去圆形边框**：`body.fullscreen #big-toggle` 改成低调无边框纯图标（透明底、暖灰、`opacity:.7`、hover 提亮），不抢视觉。
5. **状态文字稳定**：`#status-text` 加 `display:inline-block; min-width:3.4em`（「专注中/已暂停」本就同字号，加这个防切换位移）。
6. **统计页去英文菜单栏**：`main.js` 引入 `Menu`，`whenReady` 里 `Menu.setApplicationMenu(null)`。
7. **统计页标题"溯迹"统一橙**：`stats.html` 删 `h1::first-letter`，"溯迹"用 `<span class="brand">` 包裹上橙色。
8. **整个空白区可拖动**：`-webkit-app-region: drag` 提到 `#card`；`#big-toggle`/`#goal-modal` 加 `no-drag`（`.modal-box`/`#tools`/`.tool` 已有）。
9. **统计窗口任务栏图标对齐 logo**：`createStatsWindow`/`createTimerWindow` 的 `BrowserWindow` 加 `icon: <根>/icon.ico`。

## v10：间距/目标上限提示/快捷键可设置（已写完代码，待打包生效）
改动文件：`src/timer.css`、`src/timer.html`、`src/timer.js`、`main.js`、`preload.js`。
1. **最小尺寸数字不贴顶**：`#center-slot` 上边距 `2px → 10px`，让"数字↔顶部"间距接近"数字↔浓缩条"，重心居中。
2. **目标 >14 小时弹提示**：设置弹层加 `#goal-warn`；`goal-save` 时若输入 >14 → 值修正为 14 + 显示"目标最多 14 小时，已自动帮你调整～" + 不立即关闭（让用户确认再保存）。`openGoalModal` 重置隐藏。
3. **快捷键可自定义（录制式）**：设置弹层快捷键行加「修改」按钮，点后按下想要的组合键即捕获（Esc 取消、需含 Ctrl/Alt/Shift）。
   - `main.js`：新增 `settings.json` 持久化（`loadSettings`/`saveSettings`）；快捷键注册重构为 `setupHotkey`（用户自定义优先、否则候选列表）；新增 `set-hotkey` IPC（注册成功则持久化、失败恢复旧键并返回 `ok:false`）。
   - `preload.js`：`setHotkey`；`src/timer.js`：`setupHotkeyEdit`/`hotkeyMainKey`/`refreshHotkeyDisplay` 录制逻辑。
   - 自定义快捷键存于 `%APPDATA%\study-timer\settings.json`，与每日数据解耦。

## v11：设置独立成窗 + 徽章单行 + 间距/超额提示（已写完代码，待打包生效）
改动文件：`main.js`、`preload.js`、`src/timer.js`、`src/timer.html`、`src/timer.css`，**新增 `src/settings.html` + `src/settings.js`**。
1. **徽章最小尺寸也单行 14 个**：`main.js` 悬浮窗 `minWidth 320 → 360`；`#badges` 改 `flex-wrap: nowrap`、gap 5→4。
2. **数字上间距对称**：`#center-slot` 上边距 `10 → 11`（= 下边距 4 + 浓缩条上边距 7），数字在"顶部行↔浓缩条"之间对称居中；**只动上边距、未动下边距**。
3. **设置改为独立窗口**（不再是悬浮窗内的蒙版弹层）：
   - 新增 `src/settings.html` + `settings.js`（深色独立窗，含：今日目标时长 / 开机自启 / 快捷键修改）。
   - `main.js`：`createSettingsWindow`（380×470、不可缩放、带 icon）、`open-settings` IPC、`set-goal` IPC（写当天数据并 `goal-updated` 通知悬浮窗即时刷新徽章）。
   - `preload.js`：`openSettings`/`setGoal`/`onGoalUpdated`。
   - `src/timer.js`：设置按钮 → `if(running) pause()` 后 `openSettings()`（**打开设置即暂停**，符合"设置时也是休息"，且确保数据已保存供设置窗读取）；监听 `goal-updated` 即时更新；删除窗内 `goal-modal` 全部逻辑（`openGoalModal`/`applyGoal`/快捷键录制等搬入 settings.js）。
   - `src/timer.html`：删除 `#goal-modal` 弹层。
   - 顺带解决：①蒙版矩形盖住圆角（独立窗已无蒙版）②设置时背景计时还在跳（已暂停）③快捷键行/「修改」按钮换行（独立窗里 `hotkey-row` flex 一行排开）。
4. **超过 14 小时提示更明显**：设置窗自定义目标 >14 → 文字提示 + **窗口震动（shake 动画）+ 提示音（下行两音）**，即使系统静音也能靠震动察觉；并把输入修正为 14。
- 旧 `#goal-modal` 相关 CSS 仍留在 `timer.css`（无对应 DOM、无害），后续可清理。

## v12：清除今日记录（归档）+ 引导态 00:00:00（已打包生效）
改动文件：`main.js`、`preload.js`、`src/timer.js`、`src/settings.html`、`src/settings.js`、`src/stats.html`、`src/stats.js`。
1. **清除今日记录（不真删，归档）**：设置窗底部加「清除今日记录，从头开始」按钮（低调描边、二次确认）。
   - 点击 → `clear-today` IPC：当前记录 push 进 `data.archives`（含 sessions/pauses/total/categories/archivedAt），其余字段从零重置（`goalHours`/`archives` 保留），通知悬浮窗 `day-cleared` 重载从 0 计。
   - 数据模型加 `archives[]`（`loadDay` 兼容补 []）。打开设置已暂停 → 清除时数据是最新、安全。
   - **今日复盘**底部新增「今日早先的记录（已清除归档）」区，列出每段归档的时长 + 起止时间（`stats.html`/`stats.js` 的 `renderArchives`）。
2. **引导态显示 00:00:00**：`setTimeVisibility` 区分三态——专注=中央大字、休息(暂停后)=顶部小字+中央休息计时、**引导/未开始=中央显示总时长**（没记录时即 `00:00:00`，作视觉引导）。
   - `timer.js` 新增 `onDayCleared` 重载（重置 lastMilestone/goalDone/overLimit/lastFlagTotal + buildBadges/render + 恢复正常按钮）。

## 重新打包命令
```powershell
# 1) 关掉正在运行的程序
Get-Process StudyTimer,溯迹 -ErrorAction SilentlyContinue | Stop-Process -Force
# 2) 打包（在 E:\study-timer 下）
#    注意：PowerShell 里 --ignore 不能用带 | 的单个正则（| 会被当成管道），要拆成多个 --ignore
npx @electron/packager . 溯迹 --platform=win32 --arch=x64 --out=dist --overwrite --icon=icon.ico --ignore="^/dist" --ignore="^/data" --ignore="\.git"
# 3) 重新指向快捷方式 + 重启（参考之前的 PowerShell 脚本）
```
> 注意：打包会短暂关闭计时器，今日数据不会丢（存在 %APPDATA%\study-timer\data），
> 但重开后默认是暂停态，需要重新点一下「开始」。
