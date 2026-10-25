// Writes a copy of wrangler.jsonc with the R2 file bucket added.
//   node scripts/make-config.mjs <output-file> [bucket-name]
// The bucket is optional: without it the Worker runs fine and uploads are switched off.
// The output stays next to wrangler.jsonc, because `main` is relative to the config file.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'jsonc-parser';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const [out, bucket = 'agenthub-files'] = process.argv.slice(2);
if (!out) {
  console.error('usage: node scripts/make-config.mjs <output-file> [bucket-name]');
  process.exit(1);
}
const config = parse(readFileSync(join(dir, 'wrangler.jsonc'), 'utf8'));
config.r2_buckets = [{ binding: 'FILES', bucket_name: bucket }];
writeFileSync(join(dir, out), `${JSON.stringify(config, null, 2)}\n`);
console.log(`Wrote ${out} with R2 bucket "${bucket}"`);
