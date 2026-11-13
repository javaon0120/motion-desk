---
name: "Motion Desk · 动效工作台"
description: "真实网页预览、时间轴和属性侧栏组成的基础动效编辑器"
colors:
  ink: "#202423"
  muted: "#646b67"
  line: "#e2e5e1"
  accent: "#315947"
  tint: "#edf3ed"
  workspace: "#f8f9f6"
  surface: "white"
  surface-subtle: "#fcfdfb"
  preview-stage: "#f0f2ed"
  preview-frame: "#fbfaf7"
  preview-content: "#f8f7f2"
  helper-text: "#626f5a"
  state-label: "#606c59"
  hover: "#e9ede7"
  accent-hover: "#254634"
  focus: "#6e926f"
  button-border: "#d4dad1"
  icon: "#687169"
  icon-active: "#e8eee5"
  element-active: "#e8eee4"
  element-active-text: "#244e36"
  segmented: "#e5e8e0"
  segmented-text: "#56624f"
  segmented-active-text: "#263e2d"
  field: "#f6f7f3"
  field-border: "#e8ebe4"
  field-text: "#333e31"
  play: "#304f3a"
  play-hover: "#223f2c"
  time-text: "#364a36"
  track-selected: "#f0f4eb"
  track-outline: "#243f2c"
  track-background: "color-mix(in srgb, var(--track-color), #142316 25%)"
  playhead: "#405a3b"
typography:
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "12px"
    fontWeight: 400
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "11px"
    fontWeight: 400
  section-title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "12px"
    fontWeight: 550
  brand:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "15px"
    fontWeight: 650
    letterSpacing: "-.45px"
  inspector-title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "15px"
    fontWeight: 600
  dialog-title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "18px"
    fontWeight: 600
    letterSpacing: "-.3px"
  time:
    fontFamily: "ui-monospace, SFMono-Regular, monospace"
    fontSize: "11px"
    fontWeight: 400
  source:
    fontFamily: "ui-monospace, SFMono-Regular, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.7
rounded:
  badge: "4px"
  field: "5px"
  control: "6px"
  segmented: "7px"
  preview: "8px"
  dialog: "14px"
spacing:
  inset-compact: "3px"
  gap-small: "6px"
  gap-control: "7px"
  gap-heading: "8px"
  gap-form: "9px"
  gap-field: "10px"
  inset-small: "12px"
  inset-button: "13px"
  inset-compact-panel: "16px"
  inset-property-block: "19px"
  inset-panel: "20px"
  inset-preview-toolbar: "22px"
  inset-preview: "26px"
  inset-preview-wide: "40px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "0 13px"
    height: "34px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 13px"
    height: "34px"
  button-icon:
    textColor: "{colors.icon}"
    rounded: "{rounded.control}"
    size: "30px"
  button-text:
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "0 8px"
  segmented-control:
    backgroundColor: "{colors.segmented}"
    textColor: "{colors.segmented-text}"
    rounded: "{rounded.segmented}"
    padding: "3px"
  number-field:
    backgroundColor: "{colors.field}"
    textColor: "{colors.field-text}"
    rounded: "{rounded.field}"
    padding: "0 9px"
    height: "33px"
  browser-frame:
    backgroundColor: "{colors.preview-frame}"
    rounded: "{rounded.preview}"
    width: "100%"
  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.dialog}"
    padding: "26px"
    width: "min(540px, calc(100vw - 30px))"
---

# 动效工作台设计

## Overview

**设计基准：「动效工作台」**

这是高频操作的编辑器。真实页面占最大空间；时间轴、参数和选中对象保持对应。默认展示最终画面，只有主动播放才运行动画。

编辑器采用浅灰工作台与白色面板，避免与预览页面争夺注意力。深绿色用于操作与选中反馈，紧凑控件和细分隔线组织信息，不增加装饰性视觉主题。

**主要特征：**

- 真实网页预览、时间轴与属性侧栏共同支撑参数调整。
- 浅色平面分区，预览和浮层使用柔和阴影。
- 辅助文字与底栏统一为 11px，并采用样式末尾的对比修正。

本文记录基础编辑器当前实现，以 `public/style.css` 的最终级联结果和 `public/index.html` 的结构为依据，延续 `PRODUCT.md` 的产品边界。页面任务属于 Operate（操作）模式；此处不把页面布局扩展为其他页面的设计要求。只记录已有值，不另造色阶、动画参数或功能。

## Colors

### 主色

`accent` 对应根变量 `--accent`，用于主要操作、品牌标记、曲线路径和输入光标；主按钮悬停使用 `accent-hover`。播放按钮使用独立的 `play` 与 `play-hover`。

### 中性色与状态色

`ink`、`muted`、`line` 分别对应 `--ink`、`--muted`、`--line`。`workspace` 是页面底色；`surface` 是白色主面板；`surface-subtle` 用于场景栏、元素栏及时间轴；`preview-stage`、`preview-frame` 和 `preview-content` 分别用于预览背景、浏览器容器及 iframe 底色。

辅助说明、底栏、标尺、单位、连接提示及总时长使用 `helper-text`；状态字段标签使用 `state-label`。应以这些末尾覆盖值为准，不沿用前面更浅的文字声明。

`tint` 对应已声明的 `--tint`，目前未被样式引用，不能将它写成实际选中色。当前图标选中底色是 `icon-active`，元素选中底色和文字是 `element-active` 与 `element-active-text`，时间轴选中行使用 `track-selected`。

轨道色来自场景提供的 `--track-color`，未在本样式表中定义固定色板。轨道条最终使用 `track-background` 混色加深，白色标签的时长部分不再降低透明度；选中时另加 `track-outline` 描边，不能仅靠轨道颜色辨认选中对象。

## Typography

系统字体栈优先采用平台界面字体，并包含苹方和微软雅黑回退；未加载外部字体。正文与普通输入使用 `body`，辅助文字使用 `label`，小节标题使用 `section-title`，属性对象名使用 `inspector-title`。

品牌名使用 `brand`，对话框标题使用 `dialog-title`。时间显示与源码位置分别使用 `time`、`source` 的等宽字体；数值输入及标尺使用 `font-variant-numeric: tabular-nums`，并非所有曲线输入都采用等宽字体。

末尾可读性修正规则将原先部分 8–10px 小字覆盖为 `label`，包括浏览器地址、曲线坐标、轨道标签、底栏与单位。窄屏也保留轨道标签、时间显示和场景类型的这一字号。宽度不超过 580px 时，品牌名为 13px，对话框标题为 16px。

未定义展示大字、全局固定行高或统一比例字阶；辅助段落按实际组件使用 1.7 或 1.8 行高。

## Layout

页面高度为 `100dvh`，最小高度为 580px；头部、场景栏和底栏围绕可伸缩工作区排列。默认头部最小高度 60px、场景栏最小高度 47px、底栏高度 32px。

默认工作区为 `176px minmax(0,1fr) 270px` 三列，行结构为 `minmax(230px,1fr) 252px`。元素在左，真实预览在中，属性侧栏跨两行在右，时间轴占底部前两列。侧栏内部和时间轨道区各自滚动。

| 生效条件 | 当前布局与尺寸 |
| --- | --- |
| 宽度至少 1500px | 左右栏为 190px / 290px，轨道标签 190px；预览左右留白与工具栏内边距为 40px。 |
| 宽度不超过 1050px | 左右栏为 142px / 242px，轨道标签 142px；属性区和预览水平内边距为 16px；隐藏时间轴提示与底栏快捷提示。 |
| 宽度不超过 800px | 隐藏独立元素栏，工作区为 `minmax(0,1fr) 232px`；第一行最小高度 220px，时间轴高 252px 并跨两列；属性栏只占第一行；轨道标签 126px，显示紧凑恢复按钮。 |
| 宽度不超过 580px | 改为单列，行结构为 `minmax(235px,1fr) 248px`；轨道标签 104px。属性面板默认隐藏，经切换按钮打开，绝对定位覆盖工作区右侧，宽度为 `min(300px,100%)`；末尾 `grid-area: auto` 清除继承的网格定位。 |

窄屏头部最小高度为 55px、场景栏为 43px；属性面板不再挤占预览宽度。时间轴仍用于选择元素。宽度不超过 580px 时，轨道条内隐藏名称，仅居中展示时长；时间尺隐藏偶数位置的刻度标签，避免文字相撞，左侧元素名称仍保留。隐藏的辅助文字不等于删除对应控制。

间距是多个实际用途的取值，不是统一 16px 网格：字段列间距使用 `gap-field`，按钮内部间距使用 `gap-control`，属性分区默认内边距为 `19px 20px`。预览默认舞台内边距为 `0 26px 4px`，工具栏左右为 22px。

浏览器预览容器最大宽度为 1280px，手机预览模式最大宽度为 375px；后者是预览画框尺寸，不是编辑器媒体查询断点。对话框最大高度为 `calc(100dvh - 50px)`。

## Elevation & Depth

主要面板通过底色和细边线分区，不给每块内容增加卡片阴影。实际阴影用于预览容器、分段控件选中项、对话框、提示浮层和窄屏属性面板；轨道条有轻微内描边。阴影完整值记录在 sidecar 的 `extensions.shadows`。

键盘焦点使用 `focus` 色的 2px 外轮廓，默认偏移 3px，数值输入偏移 6px。原生对话框有半透明遮罩。窄屏属性面板的层级为 5，提示浮层为 20。

## Shapes

控件以轻圆角为主：按钮采用 `control`，数值字段和下拉框采用 `field`，徽标、轨道条及分段内部按钮采用 `badge`，分段底座采用 `segmented`，预览和提示浮层采用 `preview`，对话框采用 `dialog`。

面板保持直边，以 1px 分隔线对齐。轨道标签不使用圆角；播放指针为细线与小帽形标记，状态点和控制点保留圆形。预览容器通过裁切约束页面内容。

## Components

### 操作按钮

主按钮使用 `button-primary`，字重 550；次按钮使用 `button-secondary` 并增加 `button-border` 的 1px 边线。普通按钮悬停采用 `hover`，主按钮和播放按钮使用各自深色悬停态。

图标按钮默认为 30px 方形，图标为 16px；播放按钮为 29px 方形，内部图标为 14px。文本按钮最小高度 32px。禁用按钮透明度为 0.36，取消指针光标，禁用状态不触发悬停背景。

### 分段切换

修改版／原版使用浅灰绿色底座，内部按钮高 25px、水平内边距 12px。选中按钮使用白色背景、`segmented-active-text` 和轻阴影；未选中文字使用最终的 `segmented-text`。起始／结束的紧凑版本底座内边距 2px，按钮高 23px、水平内边距 8px，字号同样为 11px。

### 属性字段与曲线

时间字段为两列，标签与单位保持可见。数值容器使用 `number-field`，输入本体透明；状态字段宽度为 117px、高度 30px。贝塞尔参数为四列，间距 7px，输入文字居中。

曲线以 SVG 网格、路径、控制杆与两个控制点呈现，既有拖动入口也有数值输入。位移、缩放、不透明度和时间是当前界面已有字段，不据此承诺任意动画库的自动提取或其他未实现编辑能力。

### 真实预览与时间轴

真实网页由 iframe 承载，浏览器外框顶部为 31px 地址栏；桌面／手机预览与修改版／原版切换保留独立入口。连接提示和预览警告有独立位置。

时间轴工具栏最小高度为 48px，标尺行高 29px，普通轨道行高 36px，轨道条高 23px。选中轨道条增加 2px 描边、偏移 2px。空格播放或暂停；撤销支持键盘；时间轴拖动支持吸附。

编辑器样式没有定义装饰性过渡时长或缓动 token。`prefers-reduced-motion: reduce` 只将滚动行为设为 `auto`，不能据此声称已关闭预览动效；被编辑动画的时长与曲线属于场景参数。

### 连接与交接对话框

对话框沿用白底和较大圆角，包含可见标签、说明和底部操作；输入焦点采用公共焦点样式。连接提示说明网页需要接入预览脚本。发送失败保留已保存的交接版本；宿主桥接不可用时使用复制交接内容的路径，不把按钮文案当作发送成功的证据。

sidecar 中的组件片段用于展示现有视觉状态，不包含运行时预览桥接、播放或保存逻辑。

## Do's and Don'ts

### 保持

- 保持真实预览、时间轴与属性的对应关系，默认静止展示，主动播放后才运行动画。
- 保持辅助文字和底栏的最终 11px 字号与对比修正。
- 保留键盘可见焦点、数值单位及轨道选中描边。
- 窄屏通过时间轴选择对象，通过切换按钮打开属性面板。

### 避免

- 不将已声明但未使用的 tint 记作当前选中背景。
- 不用前面的浅色、小字号声明覆盖样式末尾的可读性修正。
- 不将预览画框宽度当作编辑器断点，不恢复窄屏属性面板的网格占位。
- 不增加未经实现验证的视觉风格、动画 token 或产品能力。
