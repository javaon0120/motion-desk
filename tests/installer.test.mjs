import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createInstallPlan, installAgent } from '../scripts/installer.mjs';

function fixture(t, agent, options = {}) {
  const home = mkdtempSync(path.join(tmpdir(), 'motion-desk 安装-'));
  const plan = createInstallPlan(agent, { home, codexDirectory: path.join(home, '.codex'), claudeDirectory: null, codex: '/测试/Codex CLI', ...options });
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
