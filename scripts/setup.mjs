import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { agents, createInstallPlan, installAgent, validateInstallPlan } from './installer.mjs';
import { parseAgentSelection } from './agents.mjs';

const usage = `Motion Desk 安装向导

用法：npm run setup
      npm run setup -- --agent cursor,gemini-cli
      npm run setup -- --agent all --dry-run
      npm run setup -- --list

--agent             目标名称或编号，可用逗号分隔或重复指定；all 选择全部
--config-file       指定目标的实际 MCP 文件，格式：agent=/绝对路径/config.json
--opencode-version  OpenCode 配置版本 1 或 2；默认识别已有格式，新配置使用 V2
--dry-run           仅查看安装位置，不写入配置
--list              显示所有安装目标
--help              显示帮助

默认安装到当前用户。浏览器中的工作台由 Agent 按需启动。`;

export function parseSetupArguments(args) {
  const options = { selections: [], configFiles: {}, openCodeVersion: 'auto' };
  const valueAt = (index, flag) => {
    const value = args[index];
    if (!value || value.startsWith('--')) throw new Error(`${flag} 缺少参数。`);
    return value;
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--list') options.list = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--agent') options.selections.push(valueAt(++i, arg));
    else if (arg === '--opencode-version') {
      options.openCodeVersion = valueAt(++i, arg);
      if (!['1', '2'].includes(options.openCodeVersion)) throw new Error('--opencode-version 必须是 1 或 2。');
    } else if (arg === '--config-file') {
      const value = valueAt(++i, arg), separator = value.indexOf('=');
      const agent = value.slice(0, separator), file = value.slice(separator + 1).trim();
      if (separator < 1 || !Object.hasOwn(agents, agent) || !path.isAbsolute(file)) throw new Error('--config-file 格式为 agent=/配置文件绝对路径。');
      options.configFiles[agent] = file;
    } else throw new Error(`不支持的参数：${arg}。使用 --help 查看用法。`);
  }
  if (options.selections.length) options.selected = parseAgentSelection(options.selections.join(','));
  return options;
}

function printAgents() {
  Object.entries(agents).forEach(([id, name], index) => console.log(`  ${index + 1}. ${name}  [${id}]`));
}

async function chooseAgents() {
  if (!process.stdin.isTTY) throw new Error('非交互环境请用 --agent 指定目标；使用 --list 查看可选项。');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('\n将 Motion Desk 安装到哪些 Agent？\n');
    printAgents();
    console.log('\n可多选，例如 1,3,6；输入 all 选择全部。\n');
    while (true) {
      const choice = await prompt.question('输入名称或编号：');
      try { return parseAgentSelection(choice); }
      catch (error) { console.log(error.message); }
    }
  } finally { prompt.close(); }
}

export async function main(args = process.argv.slice(2)) {
  const options = parseSetupArguments(args);
  if (options.help) { console.log(usage); return; }
  if (options.list) { printAgents(); return; }
  if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('需要 Node.js 20 或更新版本。');
  const selected = options.selected || await chooseAgents();
  for (const id of Object.keys(options.configFiles)) if (!selected.includes(id)) throw new Error(`指定了未选中目标 ${id} 的配置文件。`);
  const makePlan = (agent) => createInstallPlan(agent, { configFile: options.configFiles[agent], openCodeVersion: options.openCodeVersion });
  let plans = selected.map(makePlan);
  const unresolved = plans.filter((plan) => !plan.configFile);
  if (unresolved.length && !options.dryRun && process.stdin.isTTY) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try {
      for (const plan of unresolved) {
        console.log(`\n${agents[plan.agent]}：请在该工具的 MCP 设置中打开“原始配置”，复制文件的绝对路径。`);
        while (true) {
          const file = (await prompt.question('配置文件路径：')).trim().replace(/^["']|["']$/g, '');
          if (path.isAbsolute(file)) { options.configFiles[plan.agent] = file; break; }
          console.log('请输入绝对路径；按 Ctrl+C 退出。');
        }
      }
    } finally { prompt.close(); }
    plans = selected.map(makePlan);
  }
  console.log('\n安装范围：当前用户的本地项目。\n');
  for (const plan of plans) {
    console.log(`${agents[plan.agent]}\n  MCP 配置：${plan.configFile || '需要指定实际配置文件（--config-file）'}\n  使用指引：${plan.skillDirectory || '由 MCP 服务提供，按需读取配套技能'}\n  本地源码：${plan.root}\n`);
  }
  if (options.dryRun) { console.log('仅预览，未写入任何文件。'); return; }
  plans.forEach(validateInstallPlan);
  for (const plan of plans) {
    const result = installAgent(plan);
    console.log(`✓ ${agents[plan.agent]}：${plan.skillDirectory ? 'MCP 和技能已安装' : 'MCP 已配置，包含使用指引'}。`);
    if (result.backup) console.log(`  原配置备份：${result.backup}`);
  }
  console.log('\n安装完成。重启所选 Agent 或开启新会话，然后在项目中说：\n\n  用 Motion Desk 调整当前页面的动效\n\n工作台由 Agent 按需启动。请保留克隆目录；移动后重新运行 npm run setup。\n在 Agent 的 MCP 设置中确认 motion-desk 已连接；宿主需要启用或信任时，按它的提示操作。');
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => { console.error(`\n安装未完成：${error.message}`); process.exitCode = 1; });
}
