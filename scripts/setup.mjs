import { createInterface } from 'node:readline/promises';
import { agents, createInstallPlan, installAgent, validateInstallPlan } from './installer.mjs';

const usage = `Motion Desk 安装向导

用法：npm run setup
      npm run setup -- --agent codex
      npm run setup -- --agent claude-code
      npm run setup -- --agent all --dry-run

--agent     选择 Codex、Claude Code 或两者（all）
--dry-run   仅查看安装位置，不写入配置
--help      显示帮助

默认安装到当前用户，供所选 Agent 的所有本地项目使用。`;

function parseArguments(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--agent') {
      options.agent = args[++i];
      if (!['codex', 'claude-code', 'all'].includes(options.agent)) throw new Error('--agent 必须是 codex、claude-code 或 all。');
    } else throw new Error(`不支持的参数：${arg}。使用 --help 查看用法。`);
  }
  return options;
}

async function chooseAgent() {
  if (!process.stdin.isTTY) throw new Error('非交互环境请指定 --agent codex、--agent claude-code 或 --agent all。');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('\n将 Motion Desk 安装到哪个 Agent？\n\n  1. Codex\n  2. Claude Code\n  3. 两者都安装\n');
    while (true) {
      const choice = (await prompt.question('输入编号（1 / 2 / 3）：')).trim();
      if (['1', '2', '3'].includes(choice)) return { '1': 'codex', '2': 'claude-code', '3': 'all' }[choice];
      console.log('请输入 1、2 或 3；按 Ctrl+C 退出。');
    }
  } finally { prompt.close(); }
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) console.log(usage);
  else {
    if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('需要 Node.js 20 或更新版本。');
    const selected = options.agent || await chooseAgent();
    const plans = (selected === 'all' ? Object.keys(agents) : [selected]).map((agent) => createInstallPlan(agent));
    console.log('\n安装范围：当前用户的所有本地项目。\n');
    for (const plan of plans) {
      console.log(`${agents[plan.agent]}\n  MCP 配置：${plan.configFile}\n  使用技能：${plan.skillDirectory}\n  本地源码：${plan.root}\n`);
    }
    if (options.dryRun) console.log('仅预览，未写入任何文件。');
    else {
      // 同时安装时先检查所有目标，避免缺少依赖或同名技能导致只装了一半。
      plans.forEach(validateInstallPlan);
      for (const plan of plans) {
        const result = installAgent(plan);
        console.log(`✓ ${agents[plan.agent]}：MCP 和技能已安装。`);
        if (result.backup) console.log(`  原配置备份：${result.backup}`);
      }
      console.log('\n安装完成。重启所选 Agent 或开启新会话，然后在你的项目中说：\n\n  用 Motion Desk 调整当前页面的动效\n\n无需手动运行 npm start。工作台由 Agent 按需启动。\n请保留当前克隆目录；移动目录后重新运行 npm run setup。');
      if (plans.some((plan) => plan.agent === 'claude-code')) console.log('Claude Code 中可用 /mcp 查看工具连接，或用 /motion-desk 调用技能。');
    }
  }
} catch (error) {
  console.error(`\n安装未完成：${error.message}`);
  process.exitCode = 1;
}
