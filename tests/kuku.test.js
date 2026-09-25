// 九九ゲーム（問題・判定・記録・プリントへのリンク）のテスト: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../kuku/game.js');
const C = require('../calc.js');

test('設定の正規化: 段なしは 2 の段、逆はばらばら、順番どおりは全部', () => {
  assert.deepEqual(G.normalizeSettings({}), { dir: 'fwd', dans: [2], order: 'random', count: 10 });
  assert.deepEqual(G.normalizeSettings({ dir: 'rev', dans: [7, 3, 3, 12, 0], order: 'seq', count: 20 }), { dir: 'rev', dans: [3, 7], order: 'random', count: 20 });
  assert.deepEqual(G.normalizeSettings({ dans: [9], order: 'seq', count: 10 }), { dir: 'fwd', dans: [9], order: 'seq', count: 0 });
  assert.equal(G.totalOf(G.normalizeSettings({ dans: [1, 2, 3, 4, 5, 6, 7, 8, 9], count: 0 })), 81);
});

test('式→答え: 1 から順は段ごとに 1〜9、ばらばらは全部を一巡するまで重ならず、続けて同じ問題を出さない', () => {
  const seq = G.makeQuestions(G.normalizeSettings({ dans: [3, 6], order: 'seq' }), 1);
  assert.deepEqual(seq.map((q) => q.a + '×' + q.b), [1, 2, 3, 4, 5, 6, 7, 8, 9].map((b) => '3×' + b).concat([1, 2, 3, 4, 5, 6, 7, 8, 9].map((b) => '6×' + b)));
  for (let seed = 1; seed <= 50; seed++) {
    const all = G.makeQuestions(G.normalizeSettings({ dans: [1, 2, 3, 4, 5, 6, 7, 8, 9], count: 0 }), seed);
    assert.equal(all.length, 81);
    assert.equal(new Set(all.map((q) => q.a + '×' + q.b)).size, 81);
    const twenty = G.makeQuestions(G.normalizeSettings({ dans: [7], count: 20 }), seed);
    assert.equal(twenty.length, 20);
    for (let i = 1; i < 20; i++) assert.ok(!(twenty[i].a === twenty[i - 1].a && twenty[i].b === twenty[i - 1].b));
    assert.ok(twenty.every((q) => q.a === 7));
  }
});

test('答え→式（逆）: 選んだ段の答えから出し、1〜9 どうしのどの式でも正解', () => {
  assert.deepEqual(G.products([7]), [7, 14, 21, 28, 35, 42, 49, 56, 63]);
  assert.equal(G.products([1, 2, 3, 4, 5, 6, 7, 8, 9]).length, 36);   // 九九の答えは 36 種類
  assert.deepEqual(G.pairsOf(24), [[3, 8], [4, 6], [6, 4], [8, 3]]);
  assert.deepEqual(G.pairsOf(49), [[7, 7]]);
  const qs = G.makeQuestions(G.normalizeSettings({ dir: 'rev', dans: [7], count: 0 }), 5);
  assert.equal(qs.length, 9);
  assert.deepEqual(qs.map((q) => q.p).sort((a, b) => a - b), G.products([7]));
  assert.equal(G.judge({ p: 24 }, '38'), true);
  assert.equal(G.judge({ p: 24 }, '64'), true);
  assert.equal(G.judge({ p: 24 }, '46'), true);
  assert.equal(G.judge({ p: 24 }, '212'), false);
  assert.equal(G.judge({ p: 24 }, '55'), false);
  assert.equal(G.needDigits({ p: 24 }), 2);
});

test('判定: 答えの桁数で決まる。0 や先頭の 0 はまちがい', () => {
  assert.equal(G.judge({ a: 6, b: 7 }, '42'), true);
  assert.equal(G.judge({ a: 6, b: 7 }, '24'), false);
  assert.equal(G.judge({ a: 1, b: 1 }, '1'), true);
  assert.equal(G.needDigits({ a: 1, b: 9 }), 1);
  assert.equal(G.needDigits({ a: 2, b: 5 }), 2);
  for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) assert.equal(G.judge({ a, b }, String(a * b)), true);
});

test('記録: いちばん速い記録とにがて。壊れた記録は捨てる', () => {
  const s = G.normalizeSettings({ dans: [7], count: 10 });
  const r1 = G.addResult(G.normalizeRecords({}), s, 21000, ['7×8', '7×6', '7×8'], '2026-09-25');
  assert.equal(r1.isBest, true);
  assert.equal(r1.prevMs, null);
  assert.deepEqual(r1.rec.best['fwd|7|random|10'], { ms: 21000, date: '2026-09-25' });
  assert.deepEqual(G.weakList(r1.rec, 'fwd'), ['7×8', '7×6']);
  const r2 = G.addResult(r1.rec, s, 18000, [], '2026-09-26');
  assert.equal(r2.isBest, true);
  assert.equal(r2.prevMs, 21000);
  const r3 = G.addResult(r2.rec, s, 30000, ['=42'], '2026-09-27');
  assert.equal(r3.isBest, false);
  assert.deepEqual(G.weakList(r3.rec, 'rev'), ['=42']);
  const bad = G.normalizeRecords({ best: { 'fwd|7|random|10': { ms: 'x' }, 'zzz': { ms: 100 }, 'rev|123|random|20': { ms: 5000, date: '2026-09-25T10:00' } }, miss: { '7×8': 2, '0×1': 1, '=100': 1, 'a': 1 }, plays: -3 });
  assert.deepEqual(bad, { best: { 'rev|123|random|20': { ms: 5000, date: '2026-09-25' } }, miss: { '7×8': 2 }, plays: 0 });
});

test('まちがえた九九をプリントに: 学習プリントの九九（入れた問題）の共有リンク', () => {
  const h = G.printHash(['7×8', '6×7', '7×8', '=24'], 123);
  const st = C.decodeShare('#' + h);
  assert.equal(st.type, 'kuku');
  assert.equal(st.common.name, '');
  const lines = st.kuku.custom.split('\n');
  assert.deepEqual(lines, ['7×8', '6×7', '3×8', '4×6', '6×4', '8×3']);
  assert.deepEqual(st.kuku.dans, [3, 4, 6, 7, 8]);
  assert.equal(st.kuku.customMode, 'mix');
  // プリントの読み取りで全部使える
  const p = C.parseArithLines(st.kuku.custom, C.kukuRule());
  assert.equal(p.items.length, 6);
  assert.equal(p.errors.length, 0);
  assert.equal(G.printHash([], 1), '');
  assert.equal(G.secText(12345), '12.3');
});
