// Release builds crash when a Reanimated animation is given an ordinary JS
// easing function (it has to run on the UI thread). This checks that every
// `easing:` in the App uses Reanimated's own `Easing.*`. Run by the EAS Update
// workflow before publishing, and with `npm run check:animations`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src', import.meta.url));
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.tsx?$/.test(name)) files.push(path);
  }
};
walk(root);

const problems = [];
for (const file of files) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const m of line.matchAll(/\beasing:\s*([^,}]+)/g)) {
        if (!/^Easing\./.test(m[1].trim())) problems.push(`${relative(root, file)}:${i + 1}: easing must be Reanimated's Easing.*, got "${m[1].trim()}"`);
      }
    });
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`check-animations: ${files.length} files OK`);
