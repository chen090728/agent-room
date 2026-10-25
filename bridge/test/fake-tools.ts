// Stand-ins for the `claude` and `codex` commands: they record how they were
// started and answer from stdin, so no real tool or login is needed.
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface FakeTools {
  dir: string;
  bins: { claude: string; codex: string };
  /** Arguments, working directory and stdin of every run, in order. */
  calls(tool: 'claude' | 'codex'): { args: string[]; cwd: string; stdin: string }[];
}

const SCRIPT = `#!/usr/bin/env node
const fs = require('fs');
const tool = process.argv[1].includes('codex') ? 'codex' : 'claude';
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log(tool + ' 9.9.9'); process.exit(0); }
let stdin = '';
process.stdin.on('data', (d) => (stdin += d));
process.stdin.on('end', () => {
  const log = process.env.FAKE_TOOL_LOG;
  fs.appendFileSync(log, JSON.stringify({ tool, args, cwd: process.cwd(), stdin }) + '\\n');
  if (stdin.includes('HANG')) return setTimeout(() => {}, 60000);
  if (stdin.includes('FAIL')) { console.error('boom: something went wrong'); process.exit(3); }
  const answer = tool + ' answers: ' + stdin.split('\\n').filter(Boolean).pop();
  if (tool === 'codex') {
    const i = args.indexOf('--output-last-message');
    fs.writeFileSync(args[i + 1], answer + '\\n');
    console.log('progress noise that is not the answer');
  } else {
    console.log(answer);
  }
});
`;

export function makeFakeTools(): FakeTools {
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-fake-tools-'));
  const log = join(dir, 'calls.jsonl');
  writeFileSync(log, '');
  process.env.FAKE_TOOL_LOG = log;
  const bin = (name: string) => {
    const path = join(dir, name);
    writeFileSync(path, SCRIPT);
    chmodSync(path, 0o755);
    return path;
  };
  const bins = { claude: bin('claude'), codex: bin('codex') };
  return {
    dir,
    bins,
    calls: (tool) =>
      readFileSync(log, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
        .filter((c) => c.tool === tool),
  };
}
