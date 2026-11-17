# 开发指南

Motion Desk 使用原生 HTML、CSS、JavaScript 和 Node.js HTTP 服务，无需构建前端。MCP 基于 `@modelcontextprotocol/sdk`，输入参数使用 Zod 校验。

## 本地开发

```sh
npm ci
npm start
```

打开 [本地工作台](http://127.0.0.1:4318)。后台启动或复用已有服务可执行 `npm run open`，实际地址以输出为准；后台服务使用空闲端口。

```sh
npm run check
npm test
```

测试覆盖安装与重装、配置保留与失败恢复、MCP 连接、曲线、坐标换算、多选、多轨道平移与缩放、保存冲突、固定版本交接和 HTTP 边界。

Codex 注册参数通过隔离测试验证，测试不会改写真实用户配置。生成的 MCP 配置和技能脚本通过真实 stdio 服务验证；这不代替各 Agent 宿主内的完整使用验证。拖动、选择、播放及预览联动还需结合浏览器检查。

## 目录结构

```text
public/          编辑器、预览桥接脚本、动效采样和内置演示网页
server/          本地 HTTP 服务、会话存储、CLI 和 MCP 工具
scripts/         Agent 安装向导与配置适配
skills/          AI 使用插件的配套技能
examples/        可复制的项目场景
tests/           Node.js 测试
docs/            使用、接入与开发说明
```

## MCP 工具

| 工具 | 用途 |
| --- | --- |
| `open_workbench` | 传入 `workspace` 和 `scene` 创建工作台；传入 `sessionId` 恢复已有会话 |
| `get_session` | 读取当前草稿、原版及修订号 |
| `list_sessions` | 列出本地会话 |
| `get_handoff` | 读取用户确认的固定交接版本 |

真实网页的接入步骤、桥接脚本和场景字段见 [项目接入指南](integration.md)，示例见 [examples/scene.json](../examples/scene.json)。

## 其他宿主与插件包

Codex 和 Claude Code 的日常安装使用 [安装向导](installation.md)。其他 MCP 客户端可以配置以下 stdio 服务，路径替换为本机克隆目录的绝对路径：

```json
{
  "mcpServers": {
    "motion-desk": {
      "command": "node",
      "args": ["/绝对路径/motion-desk/server/mcp.mjs"]
    }
  }
}
```

仓库也保留 [.codex-plugin/plugin.json](../.codex-plugin/plugin.json)、[.mcp.json](../.mcp.json) 和 [配套技能](../skills/motion-desk/SKILL.md)，供支持本地插件包的宿主加载。当前未发布到公共插件市场。

工作台返回浏览器 `url` 和 `openInCodex` 参数。有侧面板能力的宿主可使用后者；其他宿主打开浏览器链接。用户统一通过“复制给 AI”将交接内容复制到剪贴板，再粘贴回 Agent 对话。

## 本地数据

| 运行方式 | 默认数据目录 |
| --- | --- |
| 从源码直接启动 | 项目下的 `.motion-desk/` |
| 安装向导配置的 Agent | `~/.local/share/motion-desk/` |
| 安装在 `~/.codex/plugins/` 下的插件 | `~/.local/share/motion-desk/` |
| 自定义 | 环境变量 `MOTION_DESK_DATA_DIR` 指定的目录 |

`sessions/` 保存草稿与交接版本，`runtime.json` 保存本机服务地址和访问凭据。运行数据、依赖和本地输出已加入 Git 忽略。服务仅监听 `127.0.0.1`，API 会检查凭据与请求来源。
