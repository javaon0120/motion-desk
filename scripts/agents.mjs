import path from 'node:path';
import { existsSync } from 'node:fs';

export const agents = {
  codex: 'Codex', 'claude-code': 'Claude Code', cursor: 'Cursor', windsurf: 'Windsurf',
  copilot: 'GitHub Copilot（CLI / VS Code Copilot）', 'gemini-cli': 'Gemini CLI',
  opencode: 'OpenCode', 'qwen-code': 'Qwen Code', qoder: 'Qoder',
  cline: 'Cline', 'roo-code': 'Roo Code', 'kilo-code': 'Kilo Code',
  antigravity: 'Antigravity', trae: 'Trae'
};

export function parseAgentSelection(value) {
  const tokens = value.toLowerCase().trim().split(/[,，\s]+/).filter(Boolean);
  const ids = Object.keys(agents);
  if (!tokens.length) throw new Error('请至少选择一个 Agent。');
  if (tokens.some((token) => ['all', '*', '全部'].includes(token))) {
    if (tokens.length !== 1) throw new Error('all 不能与其他目标同时使用。');
    return ids;
  }
  return [...new Set(tokens.map((token) => {
    const id = /^\d+$/.test(token) ? ids[Number(token) - 1] : token;
    if (!Object.hasOwn(agents, id)) throw new Error(`未知 Agent：${token}。使用 --list 查看可选目标。`);
    return id;
  }))];
}

function chooseFile(directory, names) {
  const found = names.map((name) => path.join(directory, name)).filter(existsSync);
  // 多个配置文件同时存在时不猜测优先级，要求明确目标文件。
  return found.length > 1 ? null : found[0] || path.join(directory, names[0]);
}

function extensionConfigs(home, platform, env, extension, names) {
  const base = platform === 'darwin' ? path.join(home, 'Library/Application Support')
    : platform === 'win32' ? env.APPDATA || path.join(home, 'AppData/Roaming')
      : env.XDG_CONFIG_HOME || path.join(home, '.config');
  return ['Code', 'Code - Insiders', 'VSCodium', 'Cursor', 'Windsurf', 'Trae', 'Trae CN', 'Antigravity']
    .flatMap((editor) => names.map((name) => path.join(base, editor, 'User/globalStorage', extension, 'settings', name)))
    .filter(existsSync);
}

export function resolveAgentTarget(agent, { home, env, platform, codexDirectory, claudeDirectory }) {
  const configHome = env.XDG_CONFIG_HOME || path.join(home, '.config');
  const standard = { configKey: ['mcpServers'], format: 'stdio' };
  const targets = {
    codex: { configFile: path.resolve(codexDirectory, 'config.toml'), skillRoot: path.join(home, '.agents/skills'), format: 'codex' },
    'claude-code': { configFile: path.join(claudeDirectory || home, '.claude.json'), skillRoot: path.join(claudeDirectory || path.join(home, '.claude'), 'skills') },
    cursor: { configFile: path.join(home, '.cursor/mcp.json'), skillRoot: path.join(home, '.cursor/skills') },
    windsurf: { configFile: path.join(home, '.codeium/windsurf/mcp_config.json'), skillRoot: null },
    copilot: { configFile: path.join(env.COPILOT_HOME || path.join(home, '.copilot'), 'mcp-config.json'), skillRoot: null, format: 'copilot' },
    'gemini-cli': { configFile: path.join(home, '.gemini/settings.json'), skillRoot: path.join(home, '.gemini/skills') },
    opencode: { configFile: chooseFile(path.join(configHome, 'opencode'), ['opencode.json', 'opencode.jsonc']), skillRoot: path.join(configHome, 'opencode/skills'), configKey: ['mcp', 'servers'], format: 'opencode' },
    'qwen-code': { configFile: path.join(home, '.qwen/settings.json'), skillRoot: path.join(home, '.qwen/skills') },
    qoder: { configFile: path.join(home, '.qoder/settings.json'), skillRoot: null },
    'kilo-code': { configFile: chooseFile(path.join(configHome, 'kilo'), ['kilo.json', 'kilo.jsonc', 'config.json']), skillRoot: path.join(home, '.kilo/skills'), configKey: ['mcp'], format: 'local' },
    antigravity: { configFile: chooseFile(path.join(home, '.gemini'), ['config/mcp_config.json', 'antigravity/mcp_config.json']), skillRoot: path.join(home, '.gemini/config/skills') },
    trae: { configFile: null, skillRoot: null }
  };
  const clineFiles = extensionConfigs(home, platform, env, 'saoudrizwan.claude-dev', ['cline_mcp_settings.json']);
  targets.cline = {
    configFile: env.CLINE_MCP_SETTINGS_PATH || (clineFiles.length > 1 ? null : clineFiles[0]) || (clineFiles.length ? null : path.join(home, '.cline/data/settings/cline_mcp_settings.json')),
    skillRoot: path.join(home, '.cline/skills')
  };
  const rooFiles = extensionConfigs(home, platform, env, 'rooveterinaryinc.roo-cline', ['mcp_settings.json', 'roo_mcp_settings.json']);
  targets['roo-code'] = { configFile: rooFiles.length === 1 ? rooFiles[0] : null, skillRoot: path.join(home, '.roo/skills') };
  return { ...standard, ...targets[agent] };
}
