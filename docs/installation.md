# 安装指南

Motion Desk 安装到你选择的 Agent，供当前用户的所有本地项目使用。首次安装步骤见 [README](../README.md#安装)。

## 选择安装目标

在 Motion Desk 克隆目录运行：

```sh
npm run setup
```

根据提示选择 Codex、Claude Code 或两者。也可以直接指定目标：

```sh
npm run setup -- --agent codex
npm run setup -- --agent claude-code
npm run setup -- --agent all
```

仅查看安装位置：

```sh
npm run setup -- --agent all --dry-run
```

向导安装 MCP 工具和配套技能。MCP 负责启动工作台、读取场景与交接版本；技能指导 Agent 接入真实网页并将修改应用到源码。日常使用时，Agent 会按需启动工作台。

## 检查安装

安装后重启所选 Agent 或开启新会话。

| Agent | 检查方式 | 打开工作台 |
| --- | --- | --- |
| Codex | `codex mcp get motion-desk` | 宿主有侧面板能力时在对话右侧打开，否则使用浏览器 |
| Claude Code | `/mcp` 查看连接，`/motion-desk` 调用技能 | 在浏览器打开返回的本地链接 |

Codex 注册使用官方 CLI。向导会查找 PATH 中的 `codex`，并在 macOS 上检查桌面应用内的 CLI；找不到时，先执行 `npm install -g @openai/codex`，再运行安装向导。

Claude Code 安装会合并用户配置的 `mcpServers`，保留其他配置和 MCP。已有配置会保存备份，终端会显示备份位置。单个目标安装失败时，会尝试恢复该目标的原配置和原技能，并报告恢复结果。

## 更新与移动目录

安装会记录源码和 Node 的绝对路径。请保留克隆目录及其依赖；更新源码后运行：

```sh
git pull
npm ci
npm run setup
```

移动克隆目录或更换 Node 安装位置后，也需要重新执行 `npm ci` 和安装向导。重装会更新本安装器生成的技能；用户自行维护的同名技能会被保留，并提示先重命名或移走。

## 安装位置

| 内容 | 默认位置 |
| --- | --- |
| Codex MCP | `~/.codex/config.toml` 中的 `mcp_servers.motion-desk` |
| Codex 技能 | `~/.agents/skills/motion-desk/` |
| Claude Code MCP | `~/.claude.json` 中的 `mcpServers.motion-desk` |
| Claude Code 技能 | `~/.claude/skills/motion-desk/` |
| Agent 启动的工作台数据 | `~/.local/share/motion-desk/` |

设置了 `CODEX_HOME` 时，使用该目录下的 `config.toml`。设置了 `CLAUDE_CONFIG_DIR` 时，Claude Code 的 `.claude.json` 和 `skills/` 安装到该目录下。

安装后的技能目录包含 `installation.json`，记录源码根目录、Node 路径和工作台数据目录，供技能脚本定位运行入口。

配置方式参考 [Codex MCP](https://developers.openai.com/codex/mcp)、[Codex 技能](https://developers.openai.com/codex/skills)、[Claude Code MCP](https://code.claude.com/docs/en/mcp)、[Claude Code 技能](https://code.claude.com/docs/en/skills) 和 [Claude Code 配置目录](https://code.claude.com/docs/en/claude-directory) 的官方文档。

## 常见问题

| 问题 | 处理方式 |
| --- | --- |
| 提示缺少依赖 | 在克隆目录执行 `npm ci`，再运行 `npm run setup` |
| 提示未找到 Codex CLI | 安装 Codex CLI，或确认 `codex` 已加入 PATH |
| 提示同名技能已存在 | 查看提示路径；备份并重命名自行维护的技能后重试 |
| 安装后 Agent 没有发现工具 | 重启 Agent 或开启新会话，再用上面的检查方式确认 |
| 克隆目录移动后无法打开 | 在新目录执行 `npm ci` 和 `npm run setup` |
| 工作台无法直接把参数发回对话 | 将工作台复制的交接内容粘贴回 Agent |
