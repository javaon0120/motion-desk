import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { existsSync, accessSync, constants, readFileSync, writeFileSync, mkdirSync, cpSync, renameSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const agents = { codex: 'Codex', 'claude-code': 'Claude Code' };

export function findCodex({ env = process.env, platform = process.platform, home = homedir() } = {}) {
  const candidates = (env.PATH || '').split(path.delimiter).filter(Boolean).map((directory) => path.join(directory, platform === 'win32' ? 'codex.exe' : 'codex'));
  if (platform === 'darwin') {
    for (const applications of ['/Applications', path.join(home, 'Applications')]) {
      for (const app of ['Codex.app', 'ChatGPT.app']) {
        candidates.push(path.join(applications, app, 'Contents/Resources/codex'));
        candidates.push(path.join(applications, app, 'Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex'));
      }
    }
  }
  return candidates.find((candidate) => {
    try { accessSync(candidate, constants.X_OK); return true; } catch { return false; }
  });
}

export function createInstallPlan(agent, {
  root = repositoryRoot, home = homedir(), node = process.execPath,
  codexDirectory = process.env.CODEX_HOME || path.join(home, '.codex'), codex = findCodex({ home }),
  claudeDirectory = process.env.CLAUDE_CONFIG_DIR || null
} = {}) {
  if (!Object.hasOwn(agents, agent)) throw new Error('请选择 codex 或 claude-code。');
  root = path.resolve(root);
  home = path.resolve(home);
  const claudeRoot = claudeDirectory ? path.resolve(claudeDirectory) : path.join(home, '.claude');
  const dataDirectory = path.join(home, '.local', 'share', 'motion-desk');
  return {
    agent, root, node: path.resolve(node), codex,
    configFile: agent === 'codex' ? path.resolve(codexDirectory, 'config.toml') : path.join(claudeDirectory ? claudeRoot : home, '.claude.json'),
    skillDirectory: path.join(agent === 'codex' ? path.join(home, '.agents') : claudeRoot, 'skills', 'motion-desk'),
    dataDirectory,
    server: { type: 'stdio', command: path.resolve(node), args: [path.join(root, 'server', 'mcp.mjs')], env: { MOTION_DESK_DATA_DIR: dataDirectory } }
  };
}

function readClaudeConfig(file) {
  if (!existsSync(file)) return {};
  let config;
  try { config = JSON.parse(readFileSync(file, 'utf8')); }
  catch { throw new Error(`Claude Code 配置无法解析，未修改：${file}`); }
  if (!config || Array.isArray(config) || typeof config !== 'object' || (config.mcpServers !== undefined && (!config.mcpServers || Array.isArray(config.mcpServers) || typeof config.mcpServers !== 'object'))) {
    throw new Error(`Claude Code 配置结构无效，未修改：${file}`);
  }
  return config;
}

export function validateInstallPlan(plan) {
  for (const file of ['server/mcp.mjs', 'skills/motion-desk/SKILL.md', 'skills/motion-desk/scripts/motion-desk.mjs', 'node_modules/@modelcontextprotocol/sdk/package.json']) {
    if (!existsSync(path.join(plan.root, file))) throw new Error(`缺少 ${file}，请先在克隆目录运行 npm ci。`);
  }
  if (plan.agent === 'codex' && !plan.codex) throw new Error('未找到 Codex CLI。请先安装 Codex（npm install -g @openai/codex），然后重新运行 npm run setup。');
  if (plan.agent === 'claude-code') readClaudeConfig(plan.configFile);
  // 重装只接管本安装器生成的技能，避免覆盖用户自行维护的同名技能。
  if (existsSync(plan.skillDirectory)) {
    const manifest = path.join(plan.skillDirectory, 'installation.json');
    let previous;
    try { previous = JSON.parse(readFileSync(manifest, 'utf8')); } catch {}
    if (previous?.installer !== 'motion-desk' || previous.agent !== plan.agent) throw new Error(`发现已有的同名技能，未覆盖：${plan.skillDirectory}。请先将它重命名或移走，再运行安装。`);
  }
}

function writeAtomic(file, content) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { writeFileSync(temporary, content, { mode: 0o600 }); renameSync(temporary, file); }
  finally { rmSync(temporary, { force: true }); }
}

export function installAgent(plan, { run = spawnSync } = {}) {
  validateInstallPlan(plan);
  const originalConfig = existsSync(plan.configFile) ? readFileSync(plan.configFile) : null;
  const backup = originalConfig ? `${plan.configFile}.motion-desk-${Date.now()}-${randomUUID().slice(0, 8)}.bak` : null;
  const staging = `${plan.skillDirectory}.install-${randomUUID()}`;
  const oldSkill = `${plan.skillDirectory}.previous-${randomUUID()}`;
  let movedOldSkill = false, installedSkill = false, configTouched = false;
  try {
    mkdirSync(path.dirname(plan.skillDirectory), { recursive: true });
    cpSync(path.join(plan.root, 'skills', 'motion-desk'), staging, { recursive: true, errorOnExist: true });
    writeAtomic(path.join(staging, 'installation.json'), `${JSON.stringify({ installer: 'motion-desk', agent: plan.agent, root: plan.root, node: plan.node, dataDirectory: plan.dataDirectory }, null, 2)}\n`);
    if (backup) writeFileSync(backup, originalConfig, { mode: 0o600 });
    configTouched = true;
    if (plan.agent === 'codex') {
      // 使用官方 CLI 修改 TOML，保留其他 MCP、注释和现有设置。
      const result = run(plan.codex, ['mcp', 'add', 'motion-desk', '--env', `MOTION_DESK_DATA_DIR=${plan.dataDirectory}`, '--', plan.server.command, ...plan.server.args], { encoding: 'utf8', timeout: 30000, windowsHide: true });
      if (result.error || result.status !== 0) throw new Error(`Codex MCP 注册失败：${result.error?.message || result.stderr?.trim() || `退出码 ${result.status}`}`);
    } else {
      const config = readClaudeConfig(plan.configFile);
      config.mcpServers = { ...config.mcpServers, 'motion-desk': plan.server };
      writeAtomic(plan.configFile, `${JSON.stringify(config, null, 2)}\n`);
    }
    if (existsSync(plan.skillDirectory)) { renameSync(plan.skillDirectory, oldSkill); movedOldSkill = true; }
    renameSync(staging, plan.skillDirectory);
    installedSkill = true;
  } catch (error) {
    const recoveryErrors = [];
    try {
      if (configTouched) {
        if (originalConfig) writeAtomic(plan.configFile, originalConfig);
        else rmSync(plan.configFile, { force: true });
      }
    } catch (recovery) { recoveryErrors.push(`配置恢复失败：${recovery.message}；备份：${backup || '原配置不存在'}`); }
    try {
      if (installedSkill) rmSync(plan.skillDirectory, { recursive: true, force: true });
      if (movedOldSkill) renameSync(oldSkill, plan.skillDirectory);
    } catch (recovery) { recoveryErrors.push(`技能恢复失败：${recovery.message}；旧技能：${oldSkill}`); }
    throw new Error([error.message, ...recoveryErrors].join('\n'));
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  if (movedOldSkill) rmSync(oldSkill, { recursive: true, force: true });
  return { agent: plan.agent, configFile: plan.configFile, skillDirectory: plan.skillDirectory, backup };
}
