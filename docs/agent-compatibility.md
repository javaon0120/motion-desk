# Agent 兼容说明

安装向导提供 14 个目标。支持多选、按目标指定配置文件、备份与重装。下面记录当前适配的本机配置；远程开发、容器和云端会话需要在实际运行 Agent 的环境中安装。

## 支持列表

| 工具 / 命令名称 | MCP 配置位置或定位方式 | 使用指引 |
| --- | --- | --- |
| Codex / `codex` | 官方 CLI 写入 `~/.codex/config.toml` | `~/.agents/skills/motion-desk/` |
| Claude Code / `claude-code` | `~/.claude.json` | `~/.claude/skills/motion-desk/` |
| Cursor / `cursor` | `~/.cursor/mcp.json` | `~/.cursor/skills/motion-desk/` |
| Windsurf / `windsurf` | Windsurf 原版 `~/.codeium/windsurf/mcp_config.json` | MCP 内置流程指引 |
| GitHub Copilot / `copilot` | `~/.copilot/mcp-config.json`；CLI 与当前 VS Code Copilot 共用的原生配置 | MCP 内置流程指引 |
| Gemini CLI / `gemini-cli` | `~/.gemini/settings.json` | `~/.gemini/skills/motion-desk/` |
| OpenCode / `opencode` | `~/.config/opencode/opencode.json` 或已有的 `opencode.jsonc` | `~/.config/opencode/skills/motion-desk/` |
| Qwen Code / `qwen-code` | `~/.qwen/settings.json` | `~/.qwen/skills/motion-desk/` |
| Qoder / `qoder` | `~/.qoder/settings.json` | MCP 内置流程指引 |
| Cline / `cline` | 自动识别已存在的 IDE MCP 文件；未发现时使用 CLI 的 `~/.cline/data/settings/cline_mcp_settings.json` | `~/.cline/skills/motion-desk/` |
| Roo Code / `roo-code` | 自动识别已存在的 IDE MCP 文件；否则指定实际文件 | `~/.roo/skills/motion-desk/` |
| Kilo Code / `kilo-code` | `~/.config/kilo/kilo.json`，或已有的 `kilo.jsonc`、`config.json` | `~/.kilo/skills/motion-desk/` |
| Antigravity / `antigravity` | `~/.gemini/config/mcp_config.json`；存在旧版 `antigravity/mcp_config.json` 时优先识别 | 当前版本使用 `~/.gemini/config/skills/motion-desk/`；旧版使用 MCP 指引 |
| Trae / `trae` | 在应用中打开原始 MCP 配置，向导中输入或通过 `--config-file` 指定 | MCP 内置流程指引 |

MCP 内置流程指引会告知 Agent 配套 `SKILL.md` 的源码位置、网页接入步骤和参数交接方式。这些目标不额外写入未经确认的技能目录。当前按用户级配置安装；若手动指定了项目级文件，MCP 的作用范围以该文件为准。

Trae 需要用户提供实际配置文件，本版本未承诺自动定位其用户目录。Cline / Roo Code 的 IDE 自动识别覆盖常规 Code、Insiders、VSCodium、Cursor、Windsurf、Trae 和 Antigravity 的默认配置存储；自定义用户资料或数据目录请指定文件。检测到多个候选时会要求选择，避免更新错误的 IDE。

## 格式与版本

- 常规目标使用 `mcpServers.motion-desk`，通过独立的 `command`、`args`、`env` 启动本地 stdio 服务。
- GitHub Copilot 使用 `type: local`，并配置本服务器的工具列表。旧版 VS Code 的 `servers` 格式与原生 Copilot 配置不同，本目标使用当前原生格式。
- OpenCode V2 使用 `mcp.servers.motion-desk`，V1 使用 `mcp.motion-desk`。已有 V1 服务时自动沿用原格式；新文件默认 V2，也可以明确选择版本。版本与已有结构冲突时会停止，避免生成混合配置。
- Kilo Code 使用 `mcp.motion-desk`。它与 OpenCode 都使用命令数组及 `environment`；OpenCode V2 不写入 V1 的 `enabled` 字段。
- JSON 和 JSONC 都通过局部编辑合并，保留无关设置、其他服务与注释。配置无法解析或嵌套字段类型错误时会在写入前停止。
- `CODEX_HOME`、`CLAUDE_CONFIG_DIR`、`COPILOT_HOME`、`XDG_CONFIG_HOME` 和 `CLINE_MCP_SETTINGS_PATH` 按对应工具的用途用于定位配置。macOS、Linux 和 Windows 的常规 IDE 数据目录分别识别；非默认位置可用 `--config-file`。

Windsurf 已升级到 Devin Local 的用户，请指定它实际使用的 `~/.config/devin/mcp_config.json`，例如 `--agent windsurf --config-file 'windsurf=/绝对路径/.config/devin/mcp_config.json'`。原版 Windsurf 路径与 Devin Local 的原生配置位置不同。

## 安装后验证

重启目标工具或开启新会话，在 MCP 设置中确认 `motion-desk` 已连接；需要信任或启用时按宿主提示操作。然后提出：

> 用 Motion Desk 调整当前页面的动效。

安装测试会验证生成配置的命令能够从其他目录启动真实 MCP 服务、发现四个工具并取得流程指引。各宿主应用中的技能加载、工具权限与浏览器打开能力，仍需在对应版本中检查；配置测试通过不代表已在所有宿主 UI 中完成端到端验证。

## 官方资料

- [Cursor MCP](https://prod.cursor.com/help/customization/mcp) 与 [技能](https://prod.cursor.com/help/customization/skills)。
- [Windsurf MCP 文档入口](https://docs.windsurf.com/windsurf/cascade/mcp) 与 [Devin Local 配置](https://docs.devin.ai/desktop/devin-local/customizations)。
- [GitHub Copilot CLI MCP](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers) 与 [VS Code Copilot MCP 配置](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)。
- [Gemini CLI MCP](https://geminicli.com/docs/tools/mcp-server/) 与 [技能](https://geminicli.com/docs/cli/skills/)。
- [OpenCode 配置](https://opencode.ai/docs/config/)、[MCP](https://opencode.ai/docs/mcp-servers) 与 [技能](https://opencode.ai/docs/skills/)。
- [Qwen Code MCP](https://qwenlm.github.io/qwen-code-docs/en/users/features/mcp/) 与 [技能](https://qwenlm.github.io/qwen-code-docs/en/users/features/skills/)。
- [Qoder MCP](https://docs.qoder.com/cli/mcp-reference)。
- [Cline MCP](https://docs.cline.bot/mcp/mcp-overview) 与 [技能](https://docs.cline.bot/customization/skills)。
- [Roo Code MCP](https://docs.roocode.com/features/mcp/using-mcp-in-roo) 与 [技能](https://docs.roocode.com/features/skills)。
- [Kilo Code MCP](https://kilo.ai/docs/automate/mcp/using-in-cli) 与 [技能](https://kilo.ai/docs/customize/skills)。
- [Antigravity MCP](https://antigravity.google/docs/mcp) 与 [技能发现](https://antigravity.google/docs/customization-discovery)。
