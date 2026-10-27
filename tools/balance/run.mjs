// The balance check: run many towns headless for years, side by side on every core, and fail when
// the town's numbers drift out of the bounds below. Run it after any change to the sim:
//   npm run balance                 16 towns, 25 years
//   npm run balance -- 8 50         8 towns, 50 years
//   npm run balance -- 16 25 101    starting from seed 101
import { rolldown } from 'rolldown';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = join(here, '../../node_modules/.cache/balance/town.mjs');

// Bounds, per town, scaled to the years run where they count up over time. A town outside any
// of these fails the check.
const PER_25 = (years) => years / 25;
const BOUNDS = [
  ['ประชากรตอนจบ', (r) => r.pop, 85, 160],
  ['ความหิว (คน×เดือน)', (r) => r.hunger, 0, (y) => 400 * PER_25(y)],
  ['ท้องพระคลัง', (r) => r.treasury, 0, 25000],
  ['คนรวยที่สุด', (r) => r.richest, 0, 8000],
  ['ภัยพิบัติ', (r) => r.events.disaster, 0, (y) => 18 * PER_25(y)],
  ['ทิ้งเมืองเพราะหิว', (r) => r.events.starvedOut, 0, (y) => 25 * PER_25(y)],
];
// And over all the towns together: things that should happen somewhere, but not everywhere.
const SPEED_MS = 4000; // one town, five years, on a quiet core: the offline catch-up must stay quick
const ACROSS = [
  ['เปลี่ยนการปกครองรวม', (rs) => rs.reduce((s, r) => s + r.events.regime, 0), (y) => (y >= 10 ? 1 : 0), Infinity],
  ['ยุคสมัยเฉลี่ย', (rs) => rs.reduce((s, r) => s + r.age, 0) / rs.length, (y) => (y >= 25 ? 0.8 : 0), (y) => (y <= 25 ? 2.2 : 3)],
  ['ถึงยุคอุตสาหกรรมก่อนปีที่ 30', (rs) => rs.filter((r) => (r.ageYears[3] ?? Infinity) < 30).length, 0, 0],
];

async function build() {
  mkdirSync(dirname(bundle), { recursive: true });
  const b = await rolldown({ input: join(here, 'town.ts'), platform: 'node', logLevel: 'silent' });
  await b.write({ file: bundle, format: 'esm' });
}

if (isMainThread) {
  const [towns = 16, years = 25, from = 1] = process.argv.slice(2).map(Number);
  await build();
  // Speed first, alone, so the workers don't slow each other's clocks.
  const { runTown } = await import(pathToFileURL(bundle).href);
  const speed = runTown(from, 5).ms;
  const seeds = Array.from({ length: towns }, (_, i) => from + i);
  const lanes = Math.max(1, Math.min(seeds.length, availableParallelism() - 1));
  const queue = [...seeds];
  const reports = [];
  console.log(`กำลังจำลอง ${towns} เมือง × ${years} ปี บน ${lanes} thread…`);
  await Promise.all(
    Array.from({ length: lanes }, async () => {
      while (queue.length) {
        const seed = queue.shift();
        reports.push(await new Promise((resolve, reject) => {
          const w = new Worker(fileURLToPath(import.meta.url), { workerData: { seed, years } });
          w.once('message', resolve);
          w.once('error', reject);
        }));
        process.stdout.write('.');
      }
    }),
  );
  console.log('\n');
  reports.sort((a, b) => a.seed - b.seed);
  const bound = (v, y) => (typeof v === 'function' ? v(y) : v);
  const fails = [];
  for (const r of reports) {
    const ages = r.ageYears.map((y, i) => `${i}@${y}`).join(' ');
    console.log(`seed ${String(r.seed).padStart(3)} | คน ${r.pop} | หิว ${r.hunger} | คลัง ${r.treasury} | รวยสุด ${r.richest} | ยุค ${ages} | วิทยาการ ${r.techs} | ${r.regime} | ผู้นำ ${r.leaders} | ภัย ${r.events.disaster} | ${Math.round(r.ms / 1000)}s`);
    for (const [name, get, lo, hi] of BOUNDS) {
      const v = get(r);
      if (v < bound(lo, years) || v > bound(hi, years)) fails.push(`seed ${r.seed}: ${name} = ${Math.round(v)} (ควรอยู่ใน ${Math.round(bound(lo, years))}–${Math.round(bound(hi, years))})`);
    }
  }
  const sum = (k) => reports.reduce((s, r) => s + r.events[k], 0);
  console.log(`\nรวมทุกเมือง: ${Object.keys(reports[0].events).map((k) => `${k} ${sum(k)}`).join(' · ')}`);
  const avg = (f) => Math.round(reports.reduce((t, r) => t + f(r), 0) / reports.length);
  console.log(`หิวรวม ${reports.reduce((t, r) => t + r.hunger, 0)} · คลังเฉลี่ย ${avg((r) => r.treasury)} · ศรัทธาเฉลี่ย ${avg((r) => r.faith)} · ความรู้เฉลี่ย ${avg((r) => r.knowledge)}`);
  for (const [name, get, lo, hi] of ACROSS) {
    const v = get(reports);
    console.log(`${name}: ${Math.round(v * 100) / 100}`);
    if (v < bound(lo, years) || v > bound(hi, years)) fails.push(`${name} = ${Math.round(v * 100) / 100} (ควรอยู่ใน ${bound(lo, years)}–${bound(hi, years)})`);
  }
  console.log(`เวลาจำลอง 5 ปี (เมืองเดียว): ${speed} ms`);
  if (speed > SPEED_MS) fails.push(`จำลอง 5 ปีใช้ ${speed} ms (ควรไม่เกิน ${SPEED_MS})`);
  if (fails.length) {
    console.log(`\nไม่ผ่าน ${fails.length} ข้อ:\n  ${fails.join('\n  ')}`);
    process.exit(1);
  }
  console.log('\nผ่านทุกเกณฑ์');
} else {
  const { runTown } = await import(pathToFileURL(bundle).href);
  parentPort.postMessage(runTown(workerData.seed, workerData.years));
}
