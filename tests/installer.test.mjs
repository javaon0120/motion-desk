import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createInstallPlan, installAgent, agents, findCodex } from '../scripts/installer.mjs';
import { parseAgentSelection } from '../scripts/agents.mjs';
import { parseSetupArguments } from '../scripts/setup.mjs';
import { parse } from 'jsonc-parser';

function fixture(t, agent, options = {}) {
  const home = mkdtempSync(path.join(tmpdir(), 'motion-desk 安装-'));
  const plan = createInstallPlan(agent, { home, env: {}, codexDirectory: path.join(home, '.codex'), claudeDirectory: null, codex: '/测试/Codex CLI', ...options });
  t.after(() => {
    const runtime = path.join(plan.dataDirectory, 'runtime.json');
    if (existsSync(runtime)) {
      const { pid } = JSON.parse(readFileSync(runtime, 'utf8'));
      try { process.kill(pid, 'SIGTERM'); } catch {}
    }
    rmSync(home, { recursive: true, force: true });
  });
  return plan;
}

test('Claude Code 安装保留原配置、其他 MCP 与完整备份，重复安装不产生重复技能', (t) => {
  const plan = fixture(t, 'claude-code');
  const before = JSON.stringify({ theme: 'dark', projects: { '/用户项目': { trusted: true } }, mcpServers: { other: { type: 'stdio', command: 'other-server' } } });
  writeFileSync(plan.configFile, before);
  const result = installAgent(plan);
  const config = JSON.parse(readFileSync(plan.configFile, 'utf8'));
  assert.equal(config.theme, 'dark');
  assert.deepEqual(config.projects, JSON.parse(before).projects);
  assert.deepEqual(config.mcpServers.other, JSON.parse(before).mcpServers.other);
  assert.deepEqual(config.mcpServers['motion-desk'], plan.server);
  assert.equal(readFileSync(result.backup, 'utf8'), before);
  const manifest = JSON.parse(readFileSync(path.join(plan.skillDirectory, 'installation.json'), 'utf8'));
  assert.equal(manifest.root, plan.root);
  assert.equal(manifest.dataDirectory, plan.dataDirectory);
  assert.ok(existsSync(path.join(plan.skillDirectory, 'scripts/motion-desk.mjs')));
  installAgent(plan);
  assert.deepEqual(JSON.parse(readFileSync(plan.configFile, 'utf8')), config);
  assert.deepEqual(readdirSync(path.dirname(plan.skillDirectory)), ['motion-desk']);
});

test('Claude Code 自定义配置目录中的 MCP 和技能使用相同安装范围', (t) => {
  const base = fixture(t, 'claude-code');
  const home = path.dirname(base.configFile);
  const custom = path.join(home, '自定义 Claude 配置');
  const plan = createInstallPlan('claude-code', { home, claudeDirectory: custom });
  installAgent(plan);
  assert.ok(existsSync(path.join(custom, '.claude.json')));
  assert.ok(existsSync(path.join(custom, 'skills/motion-desk/SKILL.md')));
  assert.equal(existsSync(base.configFile), false);
  assert.equal(existsSync(base.skillDirectory), false);
});

test('损坏的 Claude Code 配置不会被覆盖，也不会留下半安装的技能', (t) => {
  const plan = fixture(t, 'claude-code');
  writeFileSync(plan.configFile, '{ 原有配置损坏');
  assert.throws(() => installAgent(plan), /无法解析/);
  assert.equal(readFileSync(plan.configFile, 'utf8'), '{ 原有配置损坏');
  assert.equal(existsSync(plan.skillDirectory), false);
});

test('用户自行维护的同名技能不会被安装器覆盖', (t) => {
  const plan = fixture(t, 'claude-code');
  mkdirSync(plan.skillDirectory, { recursive: true });
  writeFileSync(path.join(plan.skillDirectory, 'SKILL.md'), '用户原有技能');
  assert.throws(() => installAgent(plan), /同名技能/);
  assert.equal(readFileSync(path.join(plan.skillDirectory, 'SKILL.md'), 'utf8'), '用户原有技能');
  assert.equal(existsSync(plan.configFile), false);
});

test('Codex 注册按独立参数传递带空格路径，不通过 Shell 执行', (t) => {
  const plan = fixture(t, 'codex');
  let invocation;
  installAgent(plan, { run: (command, args, options) => {
    invocation = { command, args, options };
    mkdirSync(path.dirname(plan.configFile), { recursive: true });
    writeFileSync(plan.configFile, '[mcp_servers.motion-desk]\n');
    return { status: 0 };
  } });
  assert.equal(invocation.command, plan.codex);
  assert.deepEqual(invocation.args, ['mcp', 'add', 'motion-desk', '--env', `MOTION_DESK_DATA_DIR=${plan.dataDirectory}`, '--', process.execPath, path.join(plan.root, 'server/mcp.mjs')]);
  assert.notEqual(invocation.options.shell, true);
  assert.ok(existsSync(path.join(plan.skillDirectory, 'SKILL.md')));
});

test('Codex 注册失败后恢复原配置与上一次安装的技能', (t) => {
  const plan = fixture(t, 'codex');
  mkdirSync(path.dirname(plan.configFile), { recursive: true });
  const original = '# 用户注释\nmodel = "用户模型"\n';
  writeFileSync(plan.configFile, original);
  installAgent(plan, { run: () => ({ status: 0 }) });
  const skill = readFileSync(path.join(plan.skillDirectory, 'SKILL.md'), 'utf8');
  assert.throws(() => installAgent(plan, { run: () => {
    writeFileSync(plan.configFile, '注册时产生的部分配置');
    return { status: 1, stderr: '模拟注册失败' };
  } }), /模拟注册失败/);
  assert.equal(readFileSync(plan.configFile, 'utf8'), original);
  assert.equal(readFileSync(path.join(plan.skillDirectory, 'SKILL.md'), 'utf8'), skill);
  assert.deepEqual(readdirSync(path.dirname(plan.skillDirectory)), ['motion-desk']);
});

test('缺少 Codex CLI 时在写入任何配置之前停止', (t) => {
  const plan = fixture(t, 'codex', { codex: undefined });
  // 显式覆盖自动探测结果，以模拟尚未安装 Codex 的电脑。
  plan.codex = undefined;
  assert.throws(() => installAgent(plan), /未找到 Codex CLI/);
  assert.equal(existsSync(plan.configFile), false);
  assert.equal(existsSync(plan.skillDirectory), false);
});

test('安装后的 MCP 与技能脚本能从其他目录使用同一数据目录', async (t) => {
  const plan = fixture(t, 'claude-code');
  installAgent(plan);
  const installed = JSON.parse(readFileSync(plan.configFile, 'utf8')).mcpServers['motion-desk'];
  const client = new Client({ name: '安装验证', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: installed.command, args: installed.args, env: { ...process.env, ...installed.env }, cwd: tmpdir(), stderr: 'pipe' });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), ['get_handoff', 'get_session', 'list_sessions', 'open_workbench']);
    const opened = await client.callTool({ name: 'open_workbench', arguments: { workspace: tmpdir() } });
    assert.notEqual(opened.isError, true);
    const session = JSON.parse(opened.content[0].text);
    assert.equal(new URL(session.url).hostname, '127.0.0.1');
    const fallback = spawnSync(process.execPath, [path.join(plan.skillDirectory, 'scripts/motion-desk.mjs'), 'get_session', JSON.stringify({ sessionId: session.sessionId })], { cwd: tmpdir(), encoding: 'utf8', timeout: 10000 });
    assert.equal(fallback.status, 0, fallback.stderr);
    assert.equal(JSON.parse(fallback.stdout).id, session.sessionId);
  } finally { await client.close(); }
});

test('多选支持名称、编号、重复参数和去重，错误目标在安装前被拒绝', () => {
  assert.deepEqual(parseAgentSelection('1,3，6 cursor'), ['codex', 'cursor', 'gemini-cli']);
  assert.deepEqual(parseSetupArguments(['--agent', 'cursor,gemini-cli', '--agent', 'cursor']).selected, ['cursor', 'gemini-cli']);
  assert.deepEqual(parseAgentSelection('all'), Object.keys(agents));
  for (const invalid of ['', '0', '999', 'constructor', 'all,cursor', 'unknown']) assert.throws(() => parseAgentSelection(invalid));
  assert.throws(() => parseSetupArguments(['--agent']), /缺少参数/);
  assert.throws(() => parseSetupArguments(['--config-file', 'cursor=relative.json']), /绝对路径/);
});

const newHosts = [
  ['cursor', 'standard'], ['windsurf', 'standard'], ['copilot', 'copilot'],
  ['gemini-cli', 'standard'], ['opencode', 'opencode-v2'], ['qwen-code', 'standard'],
  ['qoder', 'standard'], ['cline', 'standard'], ['roo-code', 'standard'],
  ['kilo-code', 'local'], ['antigravity', 'standard'], ['trae', 'standard']
];

for (const [agent, schema] of newHosts) {
  test(`${agents[agent]}：配置合并、注释保留、重装以及真实 MCP 连接`, async (t) => {
    const plan = fixture(t, agent);
    if (!plan.configFile) plan.configFile = path.join(plan.dataDirectory, '指定的 MCP 配置.json');
    mkdirSync(path.dirname(plan.configFile), { recursive: true });
    const section = schema === 'opencode-v2' ? '"mcp": {"servers": {"other": {"type":"local","command":["other"]}}}'
      : schema === 'local' ? '"mcp": {"other": {"type":"local","command":["other"]}}'
        : '"mcpServers": {"other": {"command":"other"}}';
    const original = `{\n  // 用户原有注释\n  "theme": "dark",\n  ${section},\n}\n`;
    writeFileSync(plan.configFile, original);
    const result = installAgent(plan);
    const content = readFileSync(plan.configFile, 'utf8');
    assert.ok(content.includes('// 用户原有注释'));
    assert.equal(readFileSync(result.backup, 'utf8'), original);
    const errors = [], config = parse(content, errors, { allowTrailingComma: true });
    assert.deepEqual(errors, []);
    assert.equal(config.theme, 'dark');
    const servers = schema === 'opencode-v2' ? config.mcp.servers : schema === 'local' ? config.mcp : config.mcpServers;
    assert.equal(servers.other.command?.[0] === 'other' || servers.other.command === 'other', true);
    const installed = servers['motion-desk'];
    if (schema === 'local' || schema === 'opencode-v2') {
      assert.equal(installed.type, 'local');
      assert.deepEqual(installed.command, [process.execPath, path.join(plan.root, 'server/mcp.mjs')]);
      assert.equal(installed.environment.MOTION_DESK_DATA_DIR, plan.dataDirectory);
      if (schema === 'opencode-v2') assert.equal(installed.enabled, undefined);
    } else {
      assert.equal(installed.command, process.execPath);
      assert.deepEqual(installed.args, [path.join(plan.root, 'server/mcp.mjs')]);
      assert.equal(installed.env.MOTION_DESK_DATA_DIR, plan.dataDirectory);
      if (schema === 'copilot') { assert.equal(installed.type, 'local'); assert.deepEqual(installed.tools, ['*']); }
    }
    installAgent(plan);
    assert.equal(readFileSync(plan.configFile, 'utf8'), content);
    const command = Array.isArray(installed.command) ? installed.command[0] : installed.command;
    const args = Array.isArray(installed.command) ? installed.command.slice(1) : installed.args;
    const client = new Client({ name: '多宿主安装验证', version: '1.0.0' });
    const transport = new StdioClientTransport({ command, args, env: { ...process.env, ...(installed.environment || installed.env) }, cwd: tmpdir(), stderr: 'pipe' });
    try {
      await client.connect(transport);
      assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name).sort(), ['get_handoff', 'get_session', 'list_sessions', 'open_workbench']);
      assert.ok(client.getInstructions().includes('skills/motion-desk/SKILL.md'));
    } finally { await client.close(); }
  });
}

test('OpenCode 已有 V1 配置自动沿用原结构，也可以显式选择版本', (t) => {
  const base = fixture(t, 'opencode');
  mkdirSync(path.dirname(base.configFile), { recursive: true });
  writeFileSync(base.configFile, '{"mcp":{"existing":{"type":"local","command":["other"]}}}');
  const plan = createInstallPlan('opencode', { home: path.dirname(path.dirname(path.dirname(base.configFile))), env: {}, configFile: base.configFile });
  installAgent(plan);
  const config = parse(readFileSync(plan.configFile, 'utf8'));
  assert.ok(config.mcp['motion-desk']);
  assert.equal(config.mcp.servers, undefined);
  assert.throws(() => createInstallPlan('opencode', { env: {}, configFile: base.configFile, openCodeVersion: '2' }), /版本与已有配置不一致/);
  const explicit = createInstallPlan('opencode', { home: path.dirname(base.dataDirectory), env: {}, configFile: `${base.configFile}.new`, openCodeVersion: '2' });
  assert.deepEqual(explicit.configKey, ['mcp', 'servers']);
});

test('未知配置位置与无效嵌套结构在任何文件写入前被拒绝', (t) => {
  const trae = fixture(t, 'trae');
  assert.throws(() => installAgent(trae), /config-file/);
  const plan = fixture(t, 'cursor');
  mkdirSync(path.dirname(plan.configFile), { recursive: true });
  const original = '// 保留\n{"mcpServers": []}';
  writeFileSync(plan.configFile, original);
  assert.throws(() => installAgent(plan), /必须是对象/);
  assert.equal(readFileSync(plan.configFile, 'utf8'), original);
  assert.equal(existsSync(plan.skillDirectory), false);
  assert.deepEqual(readdirSync(path.dirname(plan.configFile)), ['mcp.json']);
});

test('Cline 区分已存在的 IDE 配置与 CLI；多配置时要求指定文件', (t) => {
  const base = fixture(t, 'cline');
  const home = path.dirname(path.dirname(path.dirname(path.dirname(base.configFile))));
  const editorFile = (editor) => path.join(home, '.config', editor, 'User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json');
  mkdirSync(path.dirname(editorFile('Code')), { recursive: true });
  writeFileSync(editorFile('Code'), '{}');
  assert.equal(createInstallPlan('cline', { home, env: {}, platform: 'linux' }).configFile, editorFile('Code'));
  mkdirSync(path.dirname(editorFile('Cursor')), { recursive: true });
  writeFileSync(editorFile('Cursor'), '{}');
  assert.equal(createInstallPlan('cline', { home, env: {}, platform: 'linux' }).configFile, null);
});

test('Windows npm 入口通过 Node 执行，避免拼接 cmd 命令', (t) => {
  const plan = fixture(t, 'codex');
  const bin = path.join(plan.dataDirectory, '带 空格的 npm');
  const launcher = path.join(bin, 'node_modules/@openai/codex/bin/codex.js');
  mkdirSync(path.dirname(launcher), { recursive: true });
  writeFileSync(launcher, '// 测试用入口');
  assert.equal(findCodex({ home: bin, platform: 'win32', env: { PATH: bin } }), launcher);
  plan.codex = launcher;
  installAgent(plan, { run: (command, args) => {
    assert.equal(command, process.execPath);
    assert.equal(args[0], launcher);
    assert.deepEqual(args.slice(1, 4), ['mcp', 'add', 'motion-desk']);
    return { status: 0 };
  } });
});
