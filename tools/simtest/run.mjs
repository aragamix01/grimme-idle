// Rule tests for the sim: small scenes set up by hand, ticked, and checked. Run after any change
// to the sim's rules:   npm run test:sim
import { rolldown } from 'rolldown';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = join(here, '../../node_modules/.cache/simtest/tests.mjs');
mkdirSync(dirname(bundle), { recursive: true });
const b = await rolldown({ input: join(here, 'tests.ts'), platform: 'node', logLevel: 'silent' });
await b.write({ file: bundle, format: 'esm' });
const { tests } = await import(pathToFileURL(bundle).href);
const only = process.argv[2];
let failed = 0;
for (const [name, run] of tests) {
  if (only && !name.includes(only)) continue;
  try {
    run();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}
console.log(failed ? `\nไม่ผ่าน ${failed} ข้อ` : '\nผ่านทุกข้อ');
process.exit(failed ? 1 : 0);
