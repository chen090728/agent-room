// Creates server/.env from .env.example with freshly generated secrets.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(dir, '.env');
if (existsSync(target)) {
  console.error('.env already exists, leaving it untouched.');
  process.exit(1);
}
const token = randomBytes(24).toString('hex');
const secret = randomBytes(32).toString('hex');
const text = readFileSync(join(dir, '.env.example'), 'utf8')
  .replace(/^AGENTHUB_TOKEN=.*$/m, `AGENTHUB_TOKEN=${token}`)
  .replace(/^AGENTHUB_SECRET=.*$/m, `AGENTHUB_SECRET=${secret}`);
writeFileSync(target, text, { mode: 0o600 });
console.log('Created .env');
console.log(`Access token for the App: ${token}`);
