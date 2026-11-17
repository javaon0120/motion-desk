import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { existsSync, accessSync, constants, readFileSync, writeFileSync, mkdirSync, cpSync, renameSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { parse, modify, applyEdits } from 'jsonc-parser';
import { agents, resolveAgentTarget } from './agents.mjs';

export { agents } from './agents.mjs';

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function findCodex({ env = process.env, platform = process.platform, home = homedir() } = {}) {
  const candidates = (env.PATH || '').split(path.delimiter).filter(Boolean).flatMap((directory) => platform === 'win32'
    ? [path.join(directory, 'codex.exe'), path.join(directory, 'node_modules/@openai/codex/bin/codex.js')]
    : [path.join(directory, 'codex')]);
  if (platform === 'darwin') {
    for (const applications of ['/Applications', path.join(home, 'Applications')]) {
      for (const app of ['Codex.app', 'ChatGPT.app']) {
        candidates.push(path.join(applications, app, 'Contents/Resources/codex'));
        candidates.push(path.join(applications, app, 'Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex'));
      }
    }
  }
  return candidates.find((candidate) => {
    try { accessSync(candidate, candidate.endsWith('.js') ? constants.F_OK : constants.X_OK); return true; } catch { return false; }
  });
}

export function createInstallPlan(agent, {
  root = repositoryRoot, home = homedir(), node = process.execPath, env = process.env, platform = process.platform,
  codexDirectory = env.CODEX_HOME || path.join(home, '.codex'), codex = findCodex({ home, env, platform }),
  claudeDirectory = env.CLAUDE_CONFIG_DIR || null, configFile, openCodeVersion = 'auto'
} = {}) {
  if (!Object.hasOwn(agents, agent)) throw new Error(`未知 Agent：${agent}。使用 --list 查看可选目标。`);
  root = path.resolve(root);
  home = path.resolve(home);
  const target = resolveAgentTarget(agent, { home, env, platform, codexDirectory, claudeDirectory: claudeDirectory ? path.resolve(claudeDirectory) : null });
  if (agent === 'codex' && configFile && path.resolve(configFile) !== target.configFile) throw new Error('Codex 配置位置由官方 CLI 管理，请在运行向导前设置正确的 CODEX_HOME。');
  const dataDirectory = path.join(home, '.local', 'share', 'motion-desk');
  const plan = {
    agent, root, node: path.resolve(node), codex, format: target.format, configKey: target.configKey,
    configFile: configFile ? path.resolve(configFile) : target.configFile,
    skillDirectory: target.skillRoot ? path.join(target.skillRoot, 'motion-desk') : null,
    dataDirectory,
    server: { type: 'stdio', command: path.resolve(node), args: [path.join(root, 'server', 'mcp.mjs')], env: { MOTION_DESK_DATA_DIR: dataDirectory } }
  };
  if (['local', 'opencode'].includes(plan.format)) {
    plan.server = { type: 'local', command: [plan.node, path.join(root, 'server/mcp.mjs')], environment: { MOTION_DESK_DATA_DIR: dataDirectory }, enabled: true };
  } else if (plan.format === 'copilot') plan.server = { ...plan.server, type: 'local', tools: ['*'] };
  else if (agent !== 'claude-code') delete plan.server.type;
  if (plan.format === 'opencode') {
    if (!['auto', '1', '2'].includes(openCodeVersion)) throw new Error('--opencode-version 必须是 1 或 2。');
    const config = plan.configFile ? readConfig(plan) : {};
    const hasLegacy = isRecord(config.mcp) && Object.values(config.mcp).some((entry) => isRecord(entry) && ['local', 'remote'].includes(entry.type));
    if (hasLegacy && config.mcp.servers !== undefined) throw new Error('OpenCode 配置混用了 V1 与 V2 结构，请先按官方迁移说明处理。');
    if ((openCodeVersion === '2' && hasLegacy) || (openCodeVersion === '1' && config.mcp?.servers !== undefined)) throw new Error('OpenCode 指定版本与已有配置不一致。请先按官方迁移说明转换配置，或使用自动识别。');
    const legacy = openCodeVersion === '1' || (openCodeVersion === 'auto' && hasLegacy);
    if (legacy) plan.configKey = ['mcp'];
    if (openCodeVersion === '2') plan.configKey = ['mcp', 'servers'];
    if (plan.configKey.length === 2) delete plan.server.enabled;
  }
  if (agent === 'antigravity' && plan.configFile === path.join(home, '.gemini/antigravity/mcp_config.json')) plan.skillDirectory = null;
  return plan;
}

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function readConfig(plan) {
  const file = plan.configFile, name = agents[plan.agent];
  if (!existsSync(file)) return {};
  const errors = [];
  const config = parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''), errors, { allowTrailingComma: true, allowEmptyContent: true });
  if (errors.length) throw new Error(`${name} 配置无法解析，未修改：${file}`);
  if (config === undefined) return {};
  if (!isRecord(config)) throw new Error(`${name} 配置结构无效，未修改：${file}`);
  return config;
}

function configContent(plan) {
  const config = readConfig(plan);
  let current = config;
  for (const key of plan.configKey) {
    if (current[key] === undefined) break;
    if (!isRecord(current[key])) throw new Error(`${agents[plan.agent]} 的 ${plan.configKey.join('.')} 必须是对象，未修改：${plan.configFile}`);
    current = current[key];
  }
  let source = existsSync(plan.configFile) ? readFileSync(plan.configFile, 'utf8').replace(/^\uFEFF/, '') : '{}\n';
  if (parse(source, [], { allowEmptyContent: true }) === undefined) source += '\n{}\n';
  // 仅编辑本插件的节点，保留其他 MCP、设置、注释和原有缩进。
  const indent = source.match(/\n([\t ]+)"/)?.[1];
  return applyEdits(source, modify(source, [...plan.configKey, 'motion-desk'], plan.server, {
    formattingOptions: { insertSpaces: !indent?.includes('\t'), tabSize: indent?.length || 2, eol: source.includes('\r\n') ? '\r\n' : '\n' }
  }));
}

export function validateInstallPlan(plan) {
  for (const file of ['server/mcp.mjs', 'skills/motion-desk/SKILL.md', 'skills/motion-desk/scripts/motion-desk.mjs', 'node_modules/@modelcontextprotocol/sdk/package.json']) {
    if (!existsSync(path.join(plan.root, file))) throw new Error(`缺少 ${file}，请先在克隆目录运行 npm ci。`);
  }
  if (plan.agent === 'codex' && !plan.codex) throw new Error('未找到 Codex CLI。请先安装 Codex（npm install -g @openai/codex），然后重新运行 npm run setup。');
  if (!plan.configFile) throw new Error(`无法确定 ${agents[plan.agent]} 的配置文件。请在该工具的 MCP 设置中打开原始配置，使用 --config-file '${plan.agent}=/配置文件绝对路径' 指定。`);
  if (plan.agent !== 'codex') configContent(plan);
  // 重装只接管本安装器生成的技能，避免覆盖用户自行维护的同名技能。
  if (plan.skillDirectory && existsSync(plan.skillDirectory)) {
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
  const staging = plan.skillDirectory ? `${plan.skillDirectory}.install-${randomUUID()}` : null;
  const oldSkill = plan.skillDirectory ? `${plan.skillDirectory}.previous-${randomUUID()}` : null;
  let movedOldSkill = false, installedSkill = false, configTouched = false;
  try {
    if (staging) {
      mkdirSync(path.dirname(plan.skillDirectory), { recursive: true });
      cpSync(path.join(plan.root, 'skills', 'motion-desk'), staging, { recursive: true, errorOnExist: true });
      writeAtomic(path.join(staging, 'installation.json'), `${JSON.stringify({ installer: 'motion-desk', agent: plan.agent, root: plan.root, node: plan.node, dataDirectory: plan.dataDirectory }, null, 2)}\n`);
    }
    if (backup) writeFileSync(backup, originalConfig, { mode: 0o600 });
    configTouched = true;
    if (plan.agent === 'codex') {
      // 使用官方 CLI 修改 TOML，保留其他 MCP、注释和现有设置。
      const args = ['mcp', 'add', 'motion-desk', '--env', `MOTION_DESK_DATA_DIR=${plan.dataDirectory}`, '--', plan.server.command, ...plan.server.args];
      const npmLauncher = plan.codex.endsWith('.js');
      const result = run(npmLauncher ? plan.node : plan.codex, npmLauncher ? [plan.codex, ...args] : args, { encoding: 'utf8', timeout: 30000, windowsHide: true });
      if (result.error || result.status !== 0) throw new Error(`Codex MCP 注册失败：${result.error?.message || result.stderr?.trim() || `退出码 ${result.status}`}`);
    } else {
      writeAtomic(plan.configFile, configContent(plan));
    }
    if (staging) {
      if (existsSync(plan.skillDirectory)) { renameSync(plan.skillDirectory, oldSkill); movedOldSkill = true; }
      renameSync(staging, plan.skillDirectory);
      installedSkill = true;
    }
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
    if (staging) rmSync(staging, { recursive: true, force: true });
  }
  if (movedOldSkill) rmSync(oldSkill, { recursive: true, force: true });
  return { agent: plan.agent, configFile: plan.configFile, skillDirectory: plan.skillDirectory, backup };
}
