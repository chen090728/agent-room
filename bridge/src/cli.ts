import { resolve } from 'node:path';
import { BridgeClient } from './client.js';
import { defaultConfigPath, loadConfig, saveConfig } from './config.js';
import { pairWithServer } from './pair.js';
import { detectTools, TOOL_LABELS, type Tool } from './runner.js';

const HELP = `AgentHub bridge：让群聊里的"工作助手"使用这台电脑上已经登录的 Claude Code 或 Codex。

用法：
  agenthub-bridge pair <服务器地址> <配对码>   配对（配对码在 App 里创建工作助手后显示，10 分钟有效）
  agenthub-bridge run [选项]                   连接服务器并开始接任务
  agenthub-bridge status                       查看配对信息和本机可用的工具

run 的选项：
  --workdir <目录>      工具工作的目录（默认当前目录）
  --allow-write         允许工具修改这个目录里的文件（默认只读）
  --max-jobs <数量>     同时运行的任务数（默认 1）
  --timeout <分钟>      单个任务最长运行时间（默认 10）
  --claude-bin <命令>   Claude Code 的命令名（默认 claude）
  --codex-bin <命令>    Codex 的命令名（默认 codex）
通用选项：
  --config <文件>       配对信息保存位置（默认 ~/.agenthub-bridge/config.json）
  --name <名字>         pair 时给这台电脑起的名字

bridge 只会主动连接你配对过的服务器，不会监听任何端口，也不会读取 Claude.ai 或 ChatGPT 的登录信息。
`;

interface Args {
  positional: string[];
  flags: Map<string, string | true>;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) positional.push(a);
    else if (a === '--allow-write' || a === '--help') flags.set(a.slice(2), true);
    else {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${a} 后面需要一个值`);
      flags.set(a.slice(2), value);
    }
  }
  return { positional, flags };
}

const flag = (args: Args, name: string): string | undefined => {
  const v = args.flags.get(name);
  return typeof v === 'string' ? v : undefined;
};

function positiveNumber(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} 要是大于 0 的数字`);
  return n;
}

const log = (line: string) => console.log(`[${new Date().toLocaleTimeString()}] ${line}`);

async function main(argv: string[]) {
  const args = parseArgs(argv);
  const [command] = args.positional;
  if (!command || command === 'help' || args.flags.has('help')) return console.log(HELP);

  const configPath = flag(args, 'config') ?? defaultConfigPath();
  const bins: Record<Tool, string> = { claude: flag(args, 'claude-bin') ?? 'claude', codex: flag(args, 'codex-bin') ?? 'codex' };

  if (command === 'status') {
    const config = loadConfig(configPath);
    console.log(config ? `已配对：${config.server}（电脑 ID ${config.bridgeId.slice(0, 8)}…）` : '还没有配对。运行 agenthub-bridge pair <服务器地址> <配对码>');
    const tools = await detectTools(bins);
    console.log(tools.length ? `本机可用：${tools.map((t) => TOOL_LABELS[t]).join('、')}` : '本机没有找到 claude 或 codex 命令');
    return;
  }

  if (command === 'pair') {
    const [, server, code] = args.positional;
    if (!server || !code) throw new Error('用法：agenthub-bridge pair <服务器地址> <配对码>');
    const tools = await detectTools(bins);
    const result = await pairWithServer({ server, code, tools, name: flag(args, 'name'), existing: loadConfig(configPath) });
    saveConfig(configPath, result.config);
    console.log(`配对成功：这台电脑现在是工作助手「${result.memberName}」的后台。`);
    console.log(tools.length ? `本机可用：${tools.map((t) => TOOL_LABELS[t]).join('、')}` : '提醒：本机没有找到 claude 或 codex 命令，装好并登录后才能干活。');
    console.log('接下来运行 agenthub-bridge run 开始接任务。');
    return;
  }

  if (command === 'run') {
    const config = loadConfig(configPath);
    if (!config) throw new Error('还没有配对。先运行 agenthub-bridge pair <服务器地址> <配对码>');
    const tools = await detectTools(bins);
    if (!tools.length) throw new Error('本机没有找到 claude 或 codex 命令。先安装并登录其中一个，再运行 bridge');
    const workdir = resolve(flag(args, 'workdir') ?? process.cwd());
    const allowWrite = args.flags.has('allow-write');
    const client = new BridgeClient(config, {
      bins,
      workdir,
      allowWrite,
      tools,
      maxJobs: Math.floor(positiveNumber(flag(args, 'max-jobs'), 1, '--max-jobs')),
      timeoutMs: positiveNumber(flag(args, 'timeout'), 10, '--timeout') * 60_000,
      log,
    });
    log(`服务器：${config.server}`);
    log(`工作目录：${workdir}（${allowWrite ? '允许修改文件' : '只读'}）`);
    log(`可用工具：${tools.map((t) => TOOL_LABELS[t]).join('、')}`);
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => client.stop());
    const reason = await client.start();
    if (reason === 'unauthorized') process.exitCode = 1;
    return;
  }

  throw new Error(`不认识的命令：${command}\n\n${HELP}`);
}

main(process.argv.slice(2)).catch((err) => {
  console.error(`错误：${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
});
