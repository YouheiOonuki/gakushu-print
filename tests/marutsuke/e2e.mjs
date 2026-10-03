// 丸つけカメラの画面の確かめ（企画書 71・K86）。Chromium が要るので node --test では走らない
//
//   NODE_PATH=$(npm root -g) node tests/marutsuke/e2e.mjs [--shots <スクショのフォルダ>]
//
// 写真は accuracy.mjs（--sheets 1）で作ったものを使う。確かめること:
//  - カメラを拒否されても「写真を えらぶ」で丸つけできる／カメラの映像（偽のカメラ）から撮っても動く
//  - 印のない写真は「見つかりません」と言う（丸をつけない）
//  - ○/レ をタップで直すと点数が変わる
//  - 390px で横にはみ出さない・ダークモード・広告のスクリプトなし・外へのリンクなし・写真を送らない（外向きの要求なし）
//  - 学習プリントメーカーの印つきの紙が A4 で印刷でき（PDF のページ数）、印が出る
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const C = require(path.join(ROOT, 'calc.js'));
const args = process.argv.slice(2);
const SHOTS = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const IMG = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-e2e-'));
execFileSync(process.execPath, [path.join(HERE, 'accuracy.mjs'), '--sheets', '1', '--out', IMG], { stdio: 'ignore', env: process.env });

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

let pass = 0, fail = 0;
function check(name, ok, info) { if (ok) { pass++; console.log('ok   ' + name); } else { fail++; console.log('NG   ' + name + (info ? ' — ' + info : '')); } }

const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const block = /googlesyndication|doubleclick|cloudflareinsights|adtrafficquality/;

// 1. カメラを拒否 → 写真を えらぶ
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: [] });
  const outside = [];
  ctx.on('request', (r) => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:') && !block.test(u)) outside.push(u); });
  await ctx.route(block, (r) => r.abort());
  const p = await ctx.newPage();
  await p.addInitScript(() => {   // 拒否されたときと同じ動き
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
  });
  await p.goto(BASE + '/marutsuke/');
  const html = fs.readFileSync(path.join(ROOT, 'marutsuke/index.html'), 'utf8');
  check('広告のスクリプトを読まない（meta だけ）', !/adsbygoogle\.js/.test(html) && /google-adsense-account/.test(html));
  const hrefs = await p.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')));
  check('外へのリンクがない', hrefs.every((h) => !/^[a-z]+:/i.test(h) && !h.startsWith('//')), hrefs.join(' '));
  await p.click('#cam-start');
  await p.waitForFunction(() => document.getElementById('cam-msg').textContent.length > 0);
  check('カメラを拒否されたら「写真を えらぶ」を案内', /写真を えらぶ/.test(await p.textContent('#cam-msg')));
  await p.setInputFiles('#file', path.join(IMG, 'clean-0.jpg'));
  await p.waitForFunction(() => ['done', 'error'].includes(document.body.getAttribute('data-state')));
  check('拒否のあとも写真で丸つけできる', (await p.getAttribute('body', 'data-state')) === 'done');
  const score1 = await p.textContent('#r-score');
  const first = await p.getAttribute('#r-list li:first-child', 'data-correct');
  await p.click('#r-list li:first-child .mt-mark');
  const score2 = await p.textContent('#r-score');
  const n1 = Number(/せいかい (\d+)/.exec(score1)[1]), n2 = Number(/せいかい (\d+)/.exec(score2)[1]);
  check('○/レ をタップで直すと点数が 1 変わる', n2 === n1 + (first === '1' ? -1 : 1), `${score1} → ${score2}`);
  const sw = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('390px で横にはみ出さない', sw <= 0, String(sw));
  if (SHOTS) {
    await p.screenshot({ path: path.join(SHOTS, 'marutsuke-result-390.png'), fullPage: true });
  }
  // 印のない写真
  await p.click('#again');
  await p.setInputFiles('#file', path.join(ROOT, 'og-image.png'));
  await p.waitForFunction(() => document.body.getAttribute('data-state') === 'error');
  check('印のない写真は「見つかりません」と言い、丸をつけない', /見つかりませんでした/.test(await p.textContent('#err')) && await p.isHidden('#result'));
  check('写真を外に送らない（同じサーバー以外への要求なし。サイト共通の計測ビーコンはテストで止めている）', outside.length === 0, outside.join(' '));
  await ctx.close();
}

// 2. カメラの映像から撮る（偽のカメラ。紙は写らないので「見つかりません」になれば、撮る流れは動いている）
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
  await ctx.route(block, (r) => r.abort());
  const p = await ctx.newPage();
  await p.goto(BASE + '/marutsuke/');
  await p.click('#cam-start');
  await p.waitForFunction(() => document.getElementById('video').videoWidth > 0, null, { timeout: 15000 });
  check('カメラを許すと映像が出る', await p.isVisible('#cam-box'));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'marutsuke-camera-390.png') });
  await p.click('#shoot');
  await p.waitForFunction(() => ['done', 'error'].includes(document.body.getAttribute('data-state')));
  check('映像から撮ると読みに行き、カメラを止める', (await p.getAttribute('body', 'data-state')) === 'error' && await p.isHidden('#cam-box'));
  await ctx.close();
}

// 3. ダークモード・メニューの画面
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  await ctx.route(block, (r) => r.abort());
  const p = await ctx.newPage();
  await p.goto(BASE + '/marutsuke/');
  await p.setInputFiles('#file', path.join(IMG, 'rotate-0.jpg'));
  await p.waitForFunction(() => document.body.getAttribute('data-state') === 'done');
  const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check('ダークモードで暗い背景', /rgb\((\d+), (\d+), (\d+)\)/.test(bg) && Number(/\((\d+)/.exec(bg)[1]) < 80, bg);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'marutsuke-dark-390.png'), fullPage: true });
  await ctx.close();
}

// 4. 学習プリントメーカー: 印つきの紙を印刷
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(block, (r) => r.abort());
  const p = await ctx.newPage();
  const s = C.normalizeState({ type: 'arith', seed: 4242, common: { mark: true, answers: 'qa' }, arith: { op: 'mix', level: 'd2d2', count: 20, pages: 2 } });
  await p.goto(BASE + '/#s=' + C.encodeShare(s));
  await p.waitForSelector('.sheet-mark');
  check('見本に印つきの紙（問題 2 枚＋答え 2 枚、印は問題だけ）', (await p.$$('.sheet-mark')).length === 4 && (await p.$$('.sheet-mark .mk-svg')).length === 2);
  check('お知らせに「印が入っています」', /丸つけカメラ用の印が入っています/.test(await p.textContent('#pv-notes')));
  const pdf = await p.pdf({ preferCSSPageSize: true, printBackground: true });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  check('印刷すると A4 で 4 ページ', pages === 4 && /\/MediaBox \[0 0 59[45]\.\d+ 84[12]\./.test(pdf.toString('latin1')), String(pages));
  if (SHOTS) {
    fs.writeFileSync(path.join(SHOTS, 'marked-print.pdf'), pdf);
    await p.screenshot({ path: path.join(SHOTS, 'gakushu-print-marked-1280.png'), fullPage: false });
  }
  // 筆算にすると印は入らず、理由を出す
  const t = C.normalizeState(Object.assign({}, s, { arith: Object.assign({}, s.arith, { style: 'tate' }) }));
  await p.goto(BASE + '/#s=' + C.encodeShare(t));
  await p.waitForSelector('.sheet');
  check('筆算には印を入れず、理由を出す', (await p.$$('.sheet-mark')).length === 0 && /筆算には入りません/.test(await p.textContent('#pv-notes')));
  await ctx.close();
}

await browser.close();
server.close();
fs.rmSync(IMG, { recursive: true, force: true });
console.log(`\n${pass} 合格 / ${fail} 不合格`);
process.exit(fail ? 1 : 0);
