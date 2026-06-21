# 溯迹 · UI 设计规范

> 给设计/改界面时照着用的"一套标准"。目标：让这个 Electron 小工具有**软件的优雅感**，而不是"网页感"。
> 改任何界面前先翻这页；新加的控件、弹窗、配色都应落在下面这套令牌里，保持一致。

## 0. 为什么会有"网页感"，怎么消除

"网页感"几乎都来自**浏览器的默认样式**，不是因为用了 HTML。逐条消除：

| 网页感来源 | 消除做法 |
|---|---|
| 灰色系统滚动条 | 一律用自定义 `::-webkit-scrollbar`（见 §5） |
| 点击控件出现蓝色外发光框 | 去掉默认 `outline`，换主题色描边/柔光（见 §6） |
| 输入框/下拉默认样式 | 统一 `background/border/radius/padding`，`accent-color` 上色 |
| 数字跳动时宽度变化 | 计时类数字用 `font-variant-numeric: tabular-nums` |
| 圆角/间距各处不一 | 全部取自下面的圆角阶梯与间距阶梯 |
| 纯色生硬背景 | 用品牌深色渐变 `linear-gradient(160deg, bistre, bistre2)` |

## 1. 设计令牌 · 颜色（南瓜暖秋）

定义在各页面 `:root`，新增颜色不要硬编码，尽量复用：

| 变量 | 值 | 用途 |
|---|---|---|
| `--bistre` | `#37241F` | 主背景深棕 |
| `--bistre2` | `#2a1b16` | 渐变更深一档 / 输入框底 |
| `--bistre-line` | `#4a342b` | 描边 / 空轨道 |
| `--cocoa` | `#DF6F21` | 主橙（强调、主按钮、链接式重点） |
| `--cocoa-soft` | `#f0a25a` | 主橙提亮（渐变上端、hover） |
| `--persian` | `#D38D4F` | 次橙（专注态按钮） |
| `--persian-deep` | `#b9743a` | 次橙压暗 |
| `--navajo` | `#FDDDAA` | 主文字（奶白） |
| `--khaki` | `#C2A489` | 次要文字 / 说明（暖灰） |
| 金 | `#f0c850` / `#d4af37` | 达成/高光（完成度 100%、金牌徽章） |
| 红 | `#cc3b2e` | 终点旗 / 危险确认 |

文字层级：**主文字 `--navajo`，次要/说明 `--khaki`，强调/数字 `--cocoa`，达成高光 金**。

## 2. 字体与字号

- 字体栈：`-apple-system, "Segoe UI", "Microsoft YaHei", sans-serif`
- 阶梯：标题 `18px/800` · 区块小标题 `13px/khaki` · 正文 `12–13px` · 说明 `12px/khaki/opacity.8` · 计时巨字 `clamp(40px,17vmin,120px)`
- 字重只用 **700/800**（强调）与 **400/500/600**（常规）；中文小字别低于 `11px`
- 计时/统计数字加 `font-variant-numeric: tabular-nums`，避免跳动变宽

## 3. 间距阶梯

- 区块之间：`16–20px`（`.section { margin-bottom }`）
- 控件内：`gap: 8px`、按钮 `padding: 9–12px`、输入 `padding: 7–9px 9–11px`
- 页面外边距：`20–22px`

## 4. 圆角阶梯

| 尺度 | 值 | 用在 |
|---|---|---|
| 小 | `6–7px` | 小按钮、徽标、输入 |
| 中 | `8–10px` | 普通按钮、chip、输入框 |
| 大 | `11–14px` | 卡片、弹窗、奖励预览 |
| 特大 | `16px` | 悬浮窗主卡 |

单边描边（`border-left` 等）不要配圆角。

## 5. 滚动条规范（统一套用）

会滚动的窗口（复盘/设置/设定目标/今日总结）都加这段，替换系统灰条：

```css
::-webkit-scrollbar { width: 9px; height: 9px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: rgba(223,111,33,.32);          /* cocoa 半透明 */
  border-radius: 6px;
  border: 2px solid transparent;             /* 让滑块更细、两侧留白 */
  background-clip: content-box;
}
::-webkit-scrollbar-thumb:hover { background: rgba(223,111,33,.55); background-clip: content-box; }
```

## 6. 控件规范

**焦点态（最关键的"去网页感"）**：所有可聚焦控件去掉默认蓝框，换主题描边：

```css
input:focus, button:focus, select:focus, textarea:focus { outline: none; }
input:focus-visible { border-color: var(--cocoa); box-shadow: 0 0 0 2px rgba(223,111,33,.25); }
button:focus-visible { box-shadow: 0 0 0 2px rgba(223,111,33,.45); }
```

- **输入/数字框**：`bg var(--bistre2)` · `border 1px var(--bistre-line)` · `radius 7–8px` · 文字 `var(--navajo)` · 占位 `var(--khaki) opacity .7`；数字框去掉上下箭头。
- **复选/单选**：`accent-color: var(--cocoa)`，尺寸 `14–16px`。
- **主按钮**：`linear-gradient(135deg, var(--cocoa-soft), var(--cocoa))` + `color: var(--bistre)` + `font-weight 700/800`；hover `filter: brightness(1.05)`，按下 `transform: scale(.98)`。
- **次按钮**：`background: rgba(253,221,170,.12)` + `color: var(--navajo)`；hover 提到 `.22`。
- **chip（标签选择）**：默认 `rgba(253,221,170,.1)`，选中 `var(--cocoa)` + `color: var(--bistre)`。
- **危险确认**（放弃/清除）：描边或文字用红 `#cc3b2e/#e8896f`，二次确认（armed）才变红。

## 7. 弹窗 / 对话框规范

- 遮罩：`position: fixed; inset:0; background: rgba(20,12,8,.72)`，flex 居中，`z-index ≥ 70`。
- 卡片：`linear-gradient(160deg, #43302a, var(--bistre))` + `border 1px rgba(223,111,33,.4)` + `radius 14px` + `box-shadow 0 10px 30px rgba(0,0,0,.5)`，`max-width ~300px`。
- 标题用 `--cocoa-soft`，正文 `--navajo`，说明 `--khaki`，`line-height 1.6`。
- 主操作放右/醒目（主按钮），次操作用次按钮；**正向选择做主按钮**（如"刚才在专注""计划延后一天"）。
- 内容可能超高的弹窗（如今日总结）：要么独立成窗（见悬浮窗已不再承载），要么 `overflow-y:auto` + 上面的滚动条，保证操作按钮永远够得到。

## 8. 悬浮窗专属

- 无边框透明、`alwaysOnTop('screen-saver')`、整卡可拖（按钮/弹层设 `-webkit-app-region: no-drag`）。
- 主卡 `radius 16px`、品牌渐变、无外边框无投影（反馈靠眼睛图标/状态文字/按钮配色）。
- 三种态（专注/暂停/超限）大按钮 `min-height` 等高；巨字 `clamp` 自适应。
- 形态：常规 / 全屏极简巨字（`body.fullscreen`）/ 外部全屏迷你药丸（`body.mini`）。

## 9. Do / Don't 速查

- ✅ 颜色/圆角/间距都取自本页令牌；数字用 tabular-nums；滚动条/焦点态统一。
- ✅ 正向操作做主按钮；说明文字压成一行、用 `--khaki`。
- ❌ 不要保留浏览器默认滚动条/蓝色焦点框/默认 select。
- ❌ 不要新硬编码十六进制色；不要单边描边配圆角；中文不低于 11px。
- ❌ 动效克制：本项目已去掉数字飞行/滑入滑出，新增动效需克制（呼吸/撒花/pop 这类点到为止）。
