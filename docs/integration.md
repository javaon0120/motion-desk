# 将真实项目接入 Motion Desk

本文从已能运行的网页和基础动画开始。AI 负责读取原始实现并注册场景，Motion Desk 负责预览和精调，确认后再由 AI 修改源码。

先在克隆目录执行 `npm ci` 和 `npm run setup`，选择 Codex 或 Claude Code。安装完成后，在目标项目的 Agent 会话中提出动效调整需求，下方接入步骤由 Agent 完成。日常使用不需要先手动启动 Motion Desk；MCP 会按需启动或复用本地工作台。

## 1. 启动项目并标记元素

正常启动目标项目的开发服务，例如 `http://localhost:3000`。页面需要允许被本机工作台通过 iframe 加载。

给目标元素添加稳定标识：

```html
<h1 data-motion-id="hero-title">让好设计，自然发生。</h1>
```

React 中同样使用 `data-motion-id`，并在目标 DOM 挂载后加载桥接模块。已有 `transform` 参与布局时，用独立包装元素承载待编辑动效，避免覆盖布局变换。

## 2. 注册属性轨道并打开工作台

复制 [examples/scene.json](../examples/scene.json)，修改其中的 `previewUrl`、`elementId`、`source` 和实际动画参数。`source` 应指向真实源码文件及元素位置，便于交接后找到实现。

每个属性一条轨道：`id` 唯一，同一元素共用 `elementId`，使用不同 `property`。示例把标题透明度、Y 位置和缩放的开始时间错开。

在支持本插件的 AI 宿主中调用：

```text
工具：open_workbench
workspace：目标项目绝对路径
scene：场景 JSON 对象
```

也可以在 Motion Desk 仓库目录通过终端打开示例场景：

```sh
node --input-type=module <<'JS'
import { readFileSync } from 'node:fs';
import { callTool } from './server/tools.mjs';

const result = await callTool('open_workbench', {
  workspace: '/绝对路径/你的项目',
  scene: JSON.parse(readFileSync('./examples/scene.json', 'utf8'))
});
console.log(JSON.stringify(result, null, 2));
JS
```

工作台会返回 `url`、`sessionId` 和 `openInCodex`。Codex 宿主提供侧面板工具时使用 `openInCodex`；Claude Code 等宿主在浏览器中打开 `url`。记录返回 URL 的来源部分，即协议、主机和端口，例如 `http://127.0.0.1:4318`；后台模式的端口通常不同，应以实际返回值为准。

## 3. 加载网页桥接模块

在目标项目开发页面中加载：

```html
<script type="module">
  // 替换为上一步返回的工作台来源，不带会话和凭据参数。
  const editorOrigin = 'http://127.0.0.1:4318';
  await import(`${editorOrigin}/bridge.js`);
</script>
```

在框架项目中，通过开发环境判断和挂载生命周期执行同样的动态导入。加载完成后刷新工作台，使 iframe 重新载入目标页面。通过返回的 `url` 进入工作台，或由宿主使用 `openInCodex` 在对话右侧打开。

桥接模块暂停已注册元素的原动画，接管其 `transform` 和 `opacity`，响应工作台的播放、拖动和选中。预览只修改浏览器里的临时状态，不会改写项目源码。

只设置 `window.__MOTION_SCENE__` 不会替换已打开的工作台场景，注册场景时应显式传入 `open_workbench.scene`。源码热更新替换目标 DOM 后，重新加载预览完成绑定。

## 4. 调整与确认

先检查网页与工作台已联动，再调整独立属性的时间、关键帧、起止值和曲线。

点击 **交给 AI** 查看差异，填写可选备注，然后点击 **复制给 AI**。将剪贴板中的交接内容粘贴回 Agent 对话。

AI 应读取交接内容给出的 `sessionId` 和 `version`：

```text
工具：get_handoff
sessionId：交接中的会话 ID
version：交接中的确定版本号
```

随后核对 `scene`、`changes` 和 `source`，修改真实项目代码，再用项目实际预览验证。`get_session` 返回的是仍可能变化的草稿，不能代替已确认的版本。

## 场景字段

| 字段 | 含义 |
| --- | --- |
| `id`、`name` | 场景标识和名称 |
| `previewUrl` | 项目页面的完整 HTTP/HTTPS 地址；内置演示也支持 `/demo/` |
| `tracks[].id` | 唯一轨道标识 |
| `tracks[].elementId` | 对应 DOM 的 `data-motion-id` |
| `tracks[].property` | `x`、`y`、`scale` 或 `opacity` |
| `tracks[].delay` | 开始时间，0–10000ms，整数 |
| `tracks[].duration` | 时长，10–10000ms，整数 |
| `tracks[].easing` | 贝塞尔四个控制值；X 为 0–1，Y 为 -1–2 |
| `tracks[].from`、`to` | 完整状态对象，包含 `x`、`y`、`scale` 和 `opacity` |
| `tracks[].keyframes` | 可选的 `{ offset, value }` 数组，2–30 个节点；offset 在 0–1 内且严格递增 |
| `tracks[].enabled` | `false` 表示停用轨道 |
| `tracks[].source` | 真实源码文件、元素定位及补充位置说明 |

存在关键帧时，实际采样使用关键帧数值；起止值应与首尾关键帧保持一致。透明度使用 0–1、缩放使用 0.01–5；编辑面板会把两者显示为百分比。

同一元素不要重复注册相同属性，也不要混合整元素轨道与属性轨道。旧版没有 `property` 的整元素轨道仍可读取，但各属性共用时序；新的精调场景优先使用独立属性轨道。

## 页面坐标与位移换算

示例 JSON 注册的是原始动效中的位移值，没有 `positioning` 字段。网页连接后，工作台测量无动效的布局原点，自动把 X/Y 起止状态及对应关键帧换算成页面坐标；这个过程也会换算原版，避免产生无意义的差异。

换算后场景含有：

```json
{
  "positioning": {
    "space": "document",
    "anchor": "top-left",
    "origins": {
      "hero-title": { "x": 100, "y": 260 }
    },
    "viewport": { "width": 1440, "height": 900 }
  }
}
```

以上数字仅解释结构，实际值由预览测量。原始位移 `y: 20 → 0` 在布局原点 Y=260 时，会显示并保存为 `y: 280 → 260`。

带 `positioning` 的场景中，`from/to.x/y` 和位置轨道的关键帧都是元素左上角相对于网页左上角的绝对坐标。滚动不会改变该定义；预览尺寸改变时，已经设置的页面坐标保持不变。

AI 落地时应根据目标布局和参考视口换算 `translate`，同时考虑缩放的边缘补偿，保留与动效无关的布局及业务逻辑。具体坐标实现见 [public/scene.js](../public/scene.js) 和 [public/bridge.js](../public/bridge.js)。

## 常见问题

| 现象 | 检查方式 |
| --- | --- |
| 网页无法显示 | 检查开发服务器地址，以及 CSP `frame-ancestors` / `X-Frame-Options` 是否允许嵌入 |
| 显示“网页尚未连接” | 检查实际工作台来源、桥接模块请求和开发环境加载逻辑，再重新加载预览 |
| 提示找不到元素 | 检查 `elementId` 与 `data-motion-id` 一致，确认 DOM 已挂载 |
| 参数面板置灰 | 展开元素并选中属性子轨道；选中父级不启用参数编辑器 |
| 原动画与预览互相影响 | 检查框架是否持续写入相同的 transform/opacity，使用独立动效包装层 |
| 保存冲突 | 保留当前窗口，让 AI 协助处理，避免丢失尚未保存的修改 |
| 无法访问剪贴板 | 复制弹窗中已选中的交接文本，粘贴回 Agent 对话 |
| 端口 4318 已占用 | 使用 `npm run open` 获取动态端口，或用 `MOTION_DESK_PORT` 指定前台端口 |
