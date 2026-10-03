// 丸つけカメラの正答率を測る（企画書 71・K86）。node --test では走らない（Chromium が要る・数分かかる）
//
//   NODE_PATH=$(npm root -g) node tests/marutsuke/accuracy.mjs [--sheets 4] [--out <写真を残すフォルダ>]
//
// 1. 学習プリントメーカー（index.html）で「丸つけカメラ用の印」を入れたプリントを開き、紙 1 枚を画像にする
// 2. synth.html で、答えのますに手書きの数字を書きこむ（MNIST のテスト用の字＝学習に使っていない 2,000 字、
//    と Klee One の手書き風の字）。子どもの答えは 7 割が正解・2 割強がまちがい・1 割弱が空欄
// 3. 回転・逆さ・ゆがみ・ぼかし・影・遠い・ぜんぶ をかけた JPEG にする（印刷→撮影の代わり）
// 4. 丸つけカメラ（marutsuke/）の「写真を えらぶ」に入れ（setInputFiles）、出た ○/レ を正解と比べる
// 出力: 条件ごとの 紙の検出率・○/レ の一致率・読んだ数の一致率・字の一致率・「？」の割合
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const C = require(path.join(ROOT, 'calc.js'));
const M = require(path.join(ROOT, 'mark.js'));

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const PER = Number(opt('sheets', 4));
const OUT = opt('out', null);
if (OUT) fs.mkdirSync(OUT, { recursive: true });

// --- 静的配信（このリポジトリ） ---
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const mn = zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'tests/marutsuke/mnist-t10k-8000-9999.bin.gz')));
const MN_B64 = mn.toString('base64');
const labels = mn.subarray(0, 2000);
const byDigit = Array.from({ length: 10 }, () => []);
labels.forEach((l, i) => byDigit[l].push(i));

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const SETTINGS = [
  { type: 'arith', arith: { op: 'add', level: 'd1', count: 20 } },
  { type: 'arith', arith: { op: 'sub', level: 'teen', count: 20 } },
  { type: 'arith', arith: { op: 'mix', level: 'd2d2', count: 30 } },
  { type: 'arith', arith: { op: 'add', level: 'd3d3', count: 20 } },
  { type: 'arith', arith: { op: 'sub', level: 'd3d2', count: 10 } },
  { type: 'kuku', kuku: { dans: [3, 4, 6, 7, 8, 9], order: 'random', count: 30 } },
  { type: 'arith', arith: { op: 'add', level: 'd2d1', count: 10, carry: 'with' } },
  { type: 'kuku', kuku: { dans: [2, 5], order: 'seq', count: 20 } },
];
// 撮り方の条件（out は写真の画素。12M 画素のスマホの写真は main.js が 2,400px に縮める）
const CONDS = {
  clean:       { out: [1800, 2400], fill: 0.86, rot: [-2, 2], persp: 0.004, blur: 0, shadow: 0, noise: 2, light: [0.95, 1.02] },
  rotate:      { out: [1800, 2400], fill: 0.75, rot: [-25, 25], persp: 0.01, blur: 0, shadow: 0, noise: 3, light: [0.9, 1.0] },
  upside:      { out: [1800, 2400], fill: 0.8, rot: [175, 185], persp: 0.01, blur: 0, shadow: 0, noise: 3, light: [0.9, 1.0] },
  landscape:   { out: [2400, 1800], fill: 0.95, rot: [86, 94], persp: 0.01, blur: 0, shadow: 0, noise: 3, light: [0.9, 1.0] },
  perspective: { out: [1800, 2400], fill: 0.8, rot: [-6, 6], persp: 0.06, blur: 0, shadow: 0, noise: 3, light: [0.9, 1.0] },
  blur:        { out: [1500, 2000], fill: 0.85, rot: [-4, 4], persp: 0.01, blur: [1.5, 2.5], shadow: 0, noise: 3, light: [0.9, 1.0] },
  shadow:      { out: [1800, 2400], fill: 0.85, rot: [-4, 4], persp: 0.01, blur: 0.6, shadow: [0.45, 0.6], noise: 4, light: [0.75, 0.95] },
  far:         { out: [1200, 1600], fill: 0.6, rot: [-5, 5], persp: 0.01, blur: 0.5, shadow: 0, noise: 3, light: [0.9, 1.0] },
  all:         { out: [1500, 2000], fill: 0.7, rot: [-15, 15], persp: 0.04, blur: [1.0, 1.6], shadow: [0.3, 0.45], noise: 5, light: [0.75, 0.95] },
};
const pick = (R, v) => Array.isArray(v) ? v[0] + R() * (v[1] - v[0]) : v;

/** 子どもの答え（正解 70%・まちがい 22%・空欄 8%） */
function childAnswer(R, ans, digits) {
  const u = R();
  if (u < 0.08) return null;
  if (u < 0.70 + 0.08) return ans;
  for (let k = 0; k < 20; k++) {
    let w;
    const v = R();
    if (v < 0.5) w = ans + (R() < 0.5 ? -1 : 1) * (1 + Math.floor(R() * (R() < 0.7 ? 2 : 10)));
    else if (v < 0.8) w = ans + (R() < 0.5 ? -10 : 10);                       // くり上がりの忘れなど
    else { const s = String(ans).split(''); const i = Math.floor(R() * s.length); s[i] = String((Number(s[i]) + 1 + Math.floor(R() * 8)) % 10); w = Number(s.join('')); }
    if (w >= 0 && w !== ans && String(w).length <= digits) return w;
  }
  return ans + 1 < 10 ** digits ? ans + 1 : ans - 1;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1300 }, deviceScaleFactor: 2.5 });
await ctx.route(/googlesyndication|doubleclick|cloudflareinsights|adtrafficquality/, r => r.abort());
const page = await ctx.newPage();
const synth = await (await browser.newContext()).newPage();
await synth.goto(BASE + '/tests/marutsuke/synth.html');
const cam = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await cam.route(/googlesyndication|doubleclick|cloudflareinsights|adtrafficquality/, r => r.abort());
await cam.goto(BASE + '/marutsuke/');

const stats = {};
const failures = [];
let sheetNo = 0;
const t0 = Date.now();
for (const [cname, cond] of Object.entries(CONDS)) {
  const st = stats[cname] = { sheets: 0, found: 0, problems: 0, verdictOk: 0, readOk: 0, digits: 0, digitOk: 0, unsure: 0, unsureWrong: 0, sureWrong: 0, fontDigits: 0, fontOk: 0, ms: 0 };
  for (let k = 0; k < PER; k++) {
    const seed = 1000 + sheetNo * 7919;
    const R = rng(seed);
    const setting = SETTINGS[sheetNo % SETTINGS.length];
    sheetNo++;
    const state = C.normalizeState(Object.assign({ seed: Math.floor(R() * 4294967295), common: { mark: true } }, JSON.parse(JSON.stringify(setting))));
    state[state.type].pages = 2;
    const nPages = C.buildWorkbook(state, {}, 'ja').pages.length;
    const pg = R() < 0.3 && nPages > 1 ? 1 : 0;
    // 紙の画像
    await page.goto(BASE + '/#s=' + C.encodeShare(state, false));
    await page.waitForSelector('.sheet-mark');
    const shot = await page.evaluate((i) => {
      const s = document.querySelectorAll('.sheet-mark')[i];
      const c = s.cloneNode(true);
      document.body.innerHTML = '';
      document.body.style.margin = '0';
      c.style.zoom = '1'; c.style.margin = '0'; c.style.boxShadow = 'none'; c.style.display = 'flex';
      document.body.appendChild(c);
      return true;
    }, pg);
    const png = await (await page.$('.sheet-mark')).screenshot({ type: 'png' });
    const pxPerMm = 2.5 * 96 / 25.4;
    // 答え
    const dec = { state, page: pg };
    const probs = M.problemsOf(dec);
    const digits = M.answerDigits(state);
    const lay = M.layout(state[state.type].count, digits, probs);
    const writes = [], truth = [];
    probs.forEach((p, i) => {
      const w = childAnswer(R, p.answer, digits);
      truth.push({ written: w, correct: w === p.answer });
      if (w === null) return;
      const s = String(w), cells = lay.items[i].cells;
      const left = R() < 0.1;   // 1 割は左につめて書く
      for (let j = 0; j < s.length; j++) {
        const cell = cells[left ? j : cells.length - s.length + j];
        const dg = Number(s[j]);
        const font = R() < 0.2;
        writes.push({ x: cell.x, y: cell.y, s: cell.s, digit: dg, kind: font ? 'font' : 'mnist', idx: byDigit[dg][Math.floor(R() * byDigit[dg].length)] });
      }
    });
    const c = {
      sheet: 'data:image/png;base64,' + png.toString('base64'), pxPerMm, mnist: MN_B64, writes, seed,
      out: cond.out, fill: cond.fill, rot: pick(R, cond.rot), persp: cond.persp, blur: pick(R, cond.blur), shadow: pick(R, cond.shadow), noise: cond.noise, light: pick(R, cond.light), jpeg: 0.82,
    };
    const url = await synth.evaluate((o) => window.compose(o), c);
    const jpg = Buffer.from(url.split(',')[1], 'base64');
    const file = path.join(OUT || fs.mkdtempSync('/tmp/mt-'), `${cname}-${k}.jpg`);
    fs.writeFileSync(file, jpg);
    // 丸つけカメラに入れる
    await cam.evaluate(() => { document.body.removeAttribute('data-state'); window.__marutsuke = null; });
    const ts = Date.now();
    await cam.setInputFiles('#file', file);
    await cam.waitForFunction(() => ['done', 'error'].includes(document.body.getAttribute('data-state')), null, { timeout: 60000 });
    st.ms += Date.now() - ts;
    st.sheets++;
    const res = await cam.evaluate(() => window.__marutsuke);
    if (!res) { failures.push(`${cname}-${k}: 紙を見つけられない`); continue; }
    if (res.seed !== state.seed || res.page !== pg) { failures.push(`${cname}-${k}: 符号の読みちがい`); continue; }
    st.found++;
    res.results.forEach((r, i) => {
      const t = truth[i];
      st.problems++;
      if (r.correct === t.correct) st.verdictOk++;
      else (r.unsure ? (st.unsureWrong++) : (st.sureWrong++));
      if (r.read === t.written) st.readOk++;
      if (r.unsure) st.unsure++;
    });
    // 字ごと（書いた桁数と読んだ桁数が同じときだけ数える）
    res.results.forEach((r, i) => {
      const t = truth[i];
      if (t.written === null) return;
      const a = String(t.written), b = r.read === null ? '' : String(r.read);
      st.digits += a.length;
      if (a.length === b.length) for (let j = 0; j < a.length; j++) if (a[j] === b[j]) st.digitOk++;
    });
  }
}
await browser.close();
server.close();

const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '-';
const rows = [['条件', '紙', '検出', '問題', '○/レ一致', '読み一致', '字の一致', '？の割合', 'まちがい（？なし）', '1枚の時間']];
const tot = { sheets: 0, found: 0, problems: 0, verdictOk: 0, readOk: 0, digits: 0, digitOk: 0, unsure: 0, sureWrong: 0, ms: 0 };
for (const [k, s] of Object.entries(stats)) {
  Object.keys(tot).forEach(x => tot[x] += s[x]);
  rows.push([k, s.sheets, pct(s.found, s.sheets), s.problems, pct(s.verdictOk, s.problems), pct(s.readOk, s.problems), pct(s.digitOk, s.digits), pct(s.unsure, s.problems), s.sureWrong, (s.ms / s.sheets / 1000).toFixed(1) + 's']);
}
rows.push(['合計', tot.sheets, pct(tot.found, tot.sheets), tot.problems, pct(tot.verdictOk, tot.problems), pct(tot.readOk, tot.problems), pct(tot.digitOk, tot.digits), pct(tot.unsure, tot.problems), tot.sureWrong, (tot.ms / tot.sheets / 1000).toFixed(1) + 's']);
console.log(rows.map(r => '| ' + r.join(' | ') + ' |').join('\n'));
if (failures.length) console.log('\n' + failures.join('\n'));
console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
