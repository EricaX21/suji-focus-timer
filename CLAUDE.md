# 溯迹 · 专注计时悬浮窗 — 项目须知

给新会话的快速上手说明。先读这页，再按需查阅下方文件。

## 这是什么
Windows 桌面 **Electron** 应用：置顶、可拖动的悬浮窗专注计时器。用户自驱式计时（只在真正专注时点开始），量化每日有效产出（目标默认 12h），整点给奖励。产品名 **溯迹**。

## ⚠️ 最重要的两件事
1. **改源码 ≠ 立即生效**。用户日常运行的是打包好的 `dist\溯迹-win32-x64\溯迹.exe`（旧的 `StudyTimer-win32-x64\StudyTimer.exe` 已废弃，桌面/开机快捷方式都已指向新名）。改 `main.js`/`preload.js`/`src/*` 后，必须**重新打包**才会在她运行的程序里生效。
2. **不要擅自打包**。用户会把多次 UI 改动**攒到一起再统一打包**。除非她明确要求，否则只改源码 + 给预览，**不要执行打包**。

## 当前状态（截至 2026-06-21）
- **v15 已写完源码、⚠️待打包**（2026-06-21）。本批首次走 **git 分阶段提交**（仓库已初始化，首存档 `17ee21f`；A→D 共 7 个提交，可随时回退）。要点：
  - **A1** 暂停旗子遮挡：加大中央数字与浓缩条间距（`#center-slot`/`#hour-wrap` 边距）。
  - **A2 今日总结独立成窗**：新增**第五个窗** `src/summary.html`+`summary.js`+`createSummaryWindow`（main.js）。悬浮窗算好 payload 经 `open-summary` IPC 交主进程开窗；`close-summary` 区分退出收工(关即退)/计划庆祝(仅关)。悬浮窗内 `#ceremony` 浮层及 CSS 已退役。修了"总结被困小窗、退不出"的 bug。
  - **B1 熬夜党模式**：`todayStr()` 加 `dayResetHour` 偏移（默认 0；开启=6，凌晨 6 点前算前一天）。settings.json `nightOwl` + `get/set-day-settings` IPC + 设置窗开关。
  - **B4 分神自动暂停+时间回拨**：`checkIdle` 检测到空闲即 `autoPauseForIdle`（按 `idleSec` 回拨被误计的专注、休息从空闲真正起点算、暂不写 `pauses`），弹窗事后裁决「刚才在专注」(`idleWasFocus`：整段加回专注续算)/「刚才分神」(`idleWasDistraction`：不计入、保持暂停)。修了分神时间被错算进专注的 bug。
  - **B2 漏天温柔降级**：`planWithDerived` 算 `quality`=Σmin(当天实际,目标)/(目标×已过天数)（每天封顶），新增 `hasShortfall`/`promptedToday`。**去掉 `broken` 硬失败**：多天计划继续接续，仅整个周期走完仍未完成才回设定窗。启动温柔提示（昨天没达标→完成度 X%→[计划延后一天 `postpone-plan`/durationDays+1][就这样继续 `ack-shortfall`]），每天只弹一次(`lastPromptDate`)。完成度展示进总结/onboard/设置/复盘。
  - **B3 计划趣味命名**：`planNameFromReward` 按奖励关键词取名（咖啡→咖啡续命计划/牛马快乐水…），无匹配用日期兜底；`plan.name`/`nameCustom`；onboard 选填改名 + 占位实时预览(`suggest-plan-name`)；设置「当前计划」+ 复盘头部展示名 + 完成度。
  - **C 全屏看视频**：主进程每 3s `checkExternalFullscreen`（前台窗口铺满整屏判定，`getDisplayMatching`）→ mini(缩成顶部小药丸 + `body.mini` 只留数字) / hide(隐藏)，退出全屏自动还原；settings.json `fullscreenMode` + `get/set-fs-mode` + 设置窗单选。与自身全屏(`isFull`)互斥。
  - **D 界面打磨**：新增 `DESIGN.md`（**UI 设计规范，改界面前必读**）；复盘/设置/onboard 加自定义滚动条 + 统一焦点态（去"网页感"）；清死样式（`#goal-modal`、`#plan-banner.broken`）。
  - **工程**：新增 `STUDYTIMER_DATA_DIR` 环境变量隔离测试数据（`appRoot()`），开发自测时不碰正式版数据。隔离运行：`$env:STUDYTIMER_DATA_DIR='E:\study-timer\.devdata'; npm start`。
- **v14 已打包上线**（2026-06-18 打包，输出仍为 `dist\溯迹-win32-x64\溯迹.exe`）。本批只动状态眼睛图标：用户用 AI 重画了睁眼，原睁/闭眼用了不同 viewBox（24×16 / 16×12）+ 眼睛纵向位置不同，塞进固定 26×18 盒子后**下弧线错位**，切换不像眨眼。修复：睁/闭眼**共用 `viewBox 0 0 120 90` 且共用同一条下弧线** `M15,39 c30,20,60,20,90,0`（不动支点），切换时只有上眼睑+虹膜起落 → 真·眨眼开合感。闭眼=那条下弧线 + 3 根朝下睫毛；睁眼=同一下弧线 + 上眼睑 + 虹膜环+实心瞳孔 + 3 根朝上睫毛；统一 `stroke-width=7`。常量在 [src/timer.js:42](src/timer.js:42) 的 `EYE_OPEN`/`EYE_CLOSED`；设计参考文件 `src/icons/eye-open.svg`+`eye-closed.svg` 已同步。
- **v13 已打包上线**（2026-06-17 打包，输出仍为 `dist\溯迹-win32-x64\溯迹.exe`）。本批是一次大升级：从"单日计时器"变成"有目标仪式 / 多天承诺 / 奖励牵引 / 能感知真实专注"的自驱工具。要点：
  - **开机目标/计划/奖励设定窗**（新窗 `src/onboard.html`+`onboard.js`）：设目标小时 + 计划维持天数（仅此一次 / 最多 5 天，超 5 提示"奖励要更勤不要更大"）+ 奖励（预设 chips + 手动填，**奖励文案不进悬浮窗按钮**）。跨天计划存 `%APPDATA%\study-timer\plan.json`（`startDate`/`completedDates`/连续打卡），达标即写盘。
  - **启动流程**：进行中的长期目标**第二天不弹窗**、自动接续"第 N 天"（`applyPlanToToday`）；无目标/首次/计划完成/断签失败 → 自动弹设定窗。悬浮窗启动一律**暂停态**；大按钮**三态等高**（`min-height`）：有目标「点我开始专注」+ 计划进度副行 / 无目标「开始设定目标」/ 失败「目标已失败，请重新设立目标」（后两者点击重开设定窗）。**设定窗确认即自动开始计数**（`start-focus`）。无目标态点 ✕ 直接退出。
  - **细粒度任务识别**：`categories.detail()` 识别具体软件/网站（PS/PR/AI/AE/SU/Enscape/Lumion/Blender/CAD/Figma、B站/小红书/知乎/YouTube/抖音…），存 `data.appsByCat`（按大类分组）+ 扁平 `data.apps`；悬浮窗"当前任务"显示具体名。
  - **分神检测**：`powerMonitor.getSystemIdleTime()`（零依赖、看视频自动豁免），默认 5 分钟无键鼠 → 提示音 + 悬浮窗闪烁 + 弹窗（我在专注 / 帮我暂停 / 之后是否再提醒）。阈值/开关在设置页。
  - **连续 2 小时休息提醒**：单段连续每满 2h 弹随机一条（喝水/活动/远眺/听歌/热饮…），可"去休息(自动暂停)"。
  - **智能退出 ✕**：做完目标→[查看今日总结][直接退出]；没做完→[继续专注][放弃并退出(二次确认)]；无目标→直接退出。仪式总结卡复用（`ceremonyThenQuit` 区分"计划完成庆祝(只关)"和"退出总结(关即退)"）。整点/达标仍撒花+叮+系统通知，计划完成有大庆祝。
  - **复盘页重构**（`src/stats.html`/`stats.js`）：4 看板**吸顶常驻** + 左侧标签栏点击平滑滚动定位（`IntersectionObserver` 高亮）+ 今日时间线改**每小时产出折线图**（自绘 SVG）+ **内容分类可展开**看各应用深浅细分条（读 `appsByCat`）。
  - **设置页**：加「分神提醒」区、「清除记录」挪到目标保存按钮旁、文案压成一行、窗口缩到无滚轮。
  - **bug 修复**：暂停时"计数大字"与"休息数字"重叠（`pause()` 里 `showRest()` 与 `setTimeVisibility()` 调用顺序对调）。
- **v6～v12 已打包上线**（2026-06-15 打包，输出仍为 `dist\溯迹-win32-x64\溯迹.exe`）。本批要点：
  - **v12**：设置窗加「清除今日记录」（旧记录归档进 `data.archives`、复盘"今日早先的记录"可查、悬浮窗从 0 重计）；未开始时中央显示 `00:00:00` 引导。
  - 暂停只由按钮触发（点中央数字不再误触）；里程碑旗子改**自绘实心三角旗**且不溢出浓缩条。
  - 徽章**锁 14 上限**：超目标自动点亮且**鎏金星光**区分；满 14h 进入**劝退态**（按钮变劝退卡、眼睛闭、数字继续走但不计入有效专注，封顶 14h）。窗口宽 384、`minWidth 360`（保证 14 徽章单行）。
  - **去掉卡片边框+投影**；窗口**可拉伸**（min 360×240 / max 720×600 且 ≤工作区70%）+ 字号 `clamp(40px,17vmin,120px)` 自适应；新增**全屏极简巨字**（徽章顶 / 圆…现为低调图标按钮居中 / 浓缩条贴底，`vmin` 基准带鱼屏自适应）。
  - **设置改为独立窗口** `src/settings.html`+`settings.js`（目标/开机自启/快捷键），打开设置即暂停；目标 >14 给震动+提示音+文案并修正；**快捷键可录制自定义**（存 `%APPDATA%\study-timer\settings.json`）。
  - 统计页去英文菜单栏、标题"溯迹"统一橙、任务栏图标对齐 logo；整张卡片空白区可拖动。
  - ⚠️ 数字飞行/休息滑入滑出等动效**已按用户要求去掉**（瞬时切换）。
- **v1～v5 已打包上线**（2026-06-14 打包，输出名"溯迹"）：悬浮窗/暂停继续/目标设置/徽章墙/整点奖励/复盘页 + 快捷键 `Ctrl+Alt+S` + 内容自动分类 + 南瓜暖秋配色 + 暂停暖灰 + 当前小时浓缩时间轴 + 布局自适应。
- **v4（已上线）**：引入 **Lucide 图标库**（纯 HTML/JS UMD 方式，包 `lucide`）。工具栏/大按钮/旗子/复盘页统计卡都换成 lucide 图标，颜色走 `currentColor`+CSS。`square`/`rotate-ccw`/`minus`/`pin` 已可用但未加按钮。
- **v5（已上线）**：自绘**眼睛状态图标**——睁眼=品牌放射眼（杏仁眶+虹膜环+瞳孔+上方光芒，呼应 `icon.svg` 但不雷同）/ 闭眼=轮廓线+下睫毛，常量在 `src/timer.js` 的 `EYE_OPEN`/`EYE_CLOSED`；窗口改为 **384px 宽**（按"最多 14 徽章单行"定宽，目标上限锁 14h）；暂停按钮文案 "暂停一下，就一下！"。
- 详细改动历史见 `PENDING.md`（现已全部生效）。

## 该查阅哪些文件
- `PRD.md` — 完整产品文档（背景/功能/数据模型/架构/状态总览/里程碑）。想了解全貌看这个。
- `PENDING.md` — 已写完但**待打包生效**的改动清单 + 重新打包命令。动 exe 前必看。
- `src/categories.js` — 内容分类规则（看视频/客户沟通/其他工作），扩规则改这里。
- `DESIGN.md` — **UI 设计规范**（颜色/字号/间距/圆角令牌 + 滚动条/控件/焦点/弹窗规范 + 去网页感 do/don't）。**改任何界面前先看这页**。
- `src/timer.js` — 渲染层主逻辑（计时/奖励/浓缩条/分类采样/分神自动暂停与回拨/漏天温柔提示/迷你态）；眼睛 SVG 在顶部 `EYE_OPEN`/`EYE_CLOSED`（v14：共用 `viewBox 0 0 120 90` + 同一条下弧线，切换=眨眼；改造型时务必两态保持下弧线坐标逐字相同才对齐）。lucide 动态图标用 `lucide.createElement`。
- `main.js` — 主进程（**五窗**管理/快捷键含自定义/通知/前台窗口检测/数据读写 IPC + 全屏 setBounds + plan.json 读写与跨天接续 + 计划完成度/趣味命名 + powerMonitor 空闲检测 + 外部全屏检测 + `appRoot()` 数据目录可隔离）。
- `src/onboard.html`+`onboard.js` — **目标/计划/奖励设定窗**（目标小时 + 计划天数(≤5) + 奖励 chips/手动 + **计划选填起名**+预览 + 奖励预览）。
- `src/summary.html`+`summary.js` — **今日总结/收工仪式窗**（第五窗；payload 由悬浮窗经 `open-summary` 传入；退出收工关即退、计划庆祝仅关）。
- `src/settings.html`+`settings.js` — **独立设置窗**（当前计划 + 目标/开机自启/快捷键录制/分神提醒/清除记录/**熬夜党模式**/**全屏看视频时**）。
- `src/stats.html`+`stats.js` — **独立复盘窗**（吸顶看板 + 左侧标签栏 + 每小时折线图 + 内容分类可展开 + 归档记录；头部显示计划名+完成度）。

## 关键事实
- 数据存 `%APPDATA%\study-timer\data\YYYY-MM-DD.json`（与应用名解耦，改名不丢数据）。每日 JSON 含 `categories`（粗类毫秒）、`apps`（扁平任务毫秒）、`appsByCat`（按大类分组的任务毫秒，复盘可展开）、`archives[]`（被「清除今日记录」归档的早先记录，复盘可查、**不真删**）。
- **跨天计划** `%APPDATA%\study-timer\plan.json`：`goalHours`/`oneShot`/`durationDays`(≤5,延后补救可超)/`reward`/`name`/`nameCustom`/`startDate`/`completedDates`/`lastConfirmedDate`/`lastPromptDate`。派生量（`dayIndex`/`currentStreak`/`planDone`/`confirmedToday`/**`quality`(按小时占比完成度)**/`hasShortfall`/`promptedToday`）运行时由 `planWithDerived` 算、不存。⚠️ `broken` 硬失败已废弃（改温柔降级）。
- 应用设置 `%APPDATA%\study-timer\settings.json`：自定义快捷键 + 分神提醒（`idleEnabled`/`idleMinutes`/`idleRemind`）+ **`nightOwl`**(熬夜党模式) + **`fullscreenMode`**(`mini`/`hide`)。
- 数据根目录由 `appRoot()` 决定：默认 `%APPDATA%\study-timer`；设环境变量 **`STUDYTIMER_DATA_DIR`** 时改用它（开发自测隔离，不碰正式版数据）。
- 现有**五个 BrowserWindow**：悬浮窗（可拉伸 min360×240 / max720×600）、设置窗、复盘窗、目标设定窗(onboard)、**今日总结窗(summary)**；自身全屏由主进程 `setBounds` 撑满当前屏 + `body.fullscreen`；**外部全屏**(看视频)由 `body.mini` 缩成顶部药丸或隐藏。跨窗 IPC（主→悬浮窗）：`goal-updated`/`plan-updated`/`day-cleared`/`start-focus`/`day-settings-updated`/`external-fullscreen-changed`；（渲染→主）：`set-goal`/`confirm-plan`/`clear-today`/`mark-day-complete`/`load-plan`/`open-summary`/`close-summary`/`postpone-plan`/`ack-shortfall`/`suggest-plan-name`/`get/set-day-settings`/`get/set-fs-mode`。
- 前台窗口检测用 `get-windows`（ESM，主进程动态 import）；**外部全屏检测**也复用它（比对前台窗口 bounds 与 `getDisplayMatching` 整屏）。分神检测用 `powerMonitor.getSystemIdleTime()`（无需全局键鼠钩子，看视频时也能正确判空闲、由 video 桶豁免）。
- ⚠️ **前端库一律 vendoring 进 `src/`**，不要从 `node_modules` 引：electron-packager 会裁掉包的 `dist/` 子目录，导致打包后 404 卡死。lucide 已放 `src/lucide.min.js`；`timer.js` 有 `luCreate`/`luRender` 兜底。
- 开发运行：`cd E:\study-timer; npm start`。**自测建议隔离数据**避免和用户正跑的 exe 抢同一份：`$env:STUDYTIMER_DATA_DIR='E:\study-timer\.devdata'; npm start`。
- 打包命令在 `PENDING.md` 末尾。
- **项目已 `git init`**（2026-06-21，分支 `main`）。`.gitignore` 排除 `node_modules`/`dist`/`data`/`.devdata`/本地配置。改动按阶段提交、可回退；用户非开发者，git 操作（尤其联网 push）务必先解释再做、默认只本机操作。

## 待办（用户认可，未做）
- [ ] PRD 加**竞品对比**章节
- [ ] PRD 加**交互流程图**
- [ ] 把 `PENDING.md` 合并进 PRD/文档体系
- [ ] 浓缩条做成"可爱进度"（地面+小鹿 / 履带+货物 / 土地+萝卜）；全屏底部浓缩条已为"地面插旗"留好布局
- [ ] 每小时浓缩条历史回看（目前只当前小时）
- [x] ~~清理 `timer.css` 死样式（`#goal-modal` 等）~~ → v15 已清（含 `#plan-banner.broken`）
- [x] ~~替换专属眼睛图标（睁眼/闭眼）~~ → v5 已自绘上线
- [x] ~~清除今日记录 / 从头开始~~ → v12 已上线（归档保存、复盘可查）
- [x] ~~目标/多天计划/奖励、分神检测、休息提醒、智能退出仪式、复盘折线图/可展开分类~~ → v13 已上线
- [x] ~~今日总结独立成窗、漏天温柔降级+完成度、计划趣味命名、熬夜党模式、分神自动暂停+回拨、全屏看视频迷你/隐藏、UI 规范+去网页感~~ → **v15 已写完待打包**

## 协作约定
- 用户偏好：改完源码用预览（show_widget 或截图）展示效果，而非直接打包打断她。
- 全局已配置"小纸条"系统（见用户级 CLAUDE.md），与本项目无关。
