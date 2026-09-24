// プリントの組み立て（ページ分け・答えのページ・クレジット）のテスト: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calc.js');
const S = require('../sheets.js');
const K = require('../constants.js').kanjiByGrade.value;

const build = (o) => { const s = C.normalizeState(o); const wb = C.buildWorkbook(s, K); return { s, wb, r: S.render(wb, s) }; };
const count = (html, re) => (html.match(re) || []).length;

test('paginate / paginateGroups: まとまりはページをまたがせない', () => {
  assert.deepEqual(C.paginate([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(C.paginate([], 3), []);
  const g = C.paginateGroups([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10]], 7);
  assert.deepEqual(g, [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10]]);
  // 1 ページより大きいまとまりだけは分ける
  assert.deepEqual(C.paginateGroups([[1, 2, 3, 4, 5]], 2), [[1, 2], [3, 4], [5]]);
});

test('traceRows: 1 字は「お手本・なぞる・空き」の 1 行、言葉は 3 行。列の数はそろう', () => {
  const one = C.traceRows('あ', 9, 3);
  assert.equal(one.length, 1);
  assert.deepEqual(one[0].map((c) => c.kind), ['dark', 'light', 'light', 'light', 'blank', 'blank', 'blank', 'blank', 'blank']);
  const w = C.traceRows('はなこ', 9, 3);
  assert.equal(w.length, 3);
  assert.ok(w.every((r) => r.length === 9));
  assert.deepEqual(w[0].slice(0, 3).map((c) => c.ch + c.kind), ['はdark', 'なdark', 'こdark']);
  assert.deepEqual(w[0].slice(4, 7).map((c) => c.kind), ['light', 'light', 'light']);
  assert.ok(w[1].slice(0, 3).every((c) => c.kind === 'light'));
  assert.ok(w[2].every((c) => c.kind === 'blank'));
  const long = C.traceRows('あいうえおかきくけこさし', 9, 3);    // 12 字 → 2 つに折り返して 6 行
  assert.equal(long.length, 6);
  assert.equal(long[3].filter((c) => c.ch).length, 3);
});

test('たし算: 問題数×枚数のページ、答えのページは同じ数', () => {
  const { r } = build({ type: 'arith', arith: { count: 20, pages: 3 } });
  assert.equal(r.questions, 3);
  assert.equal(r.answers, 3);
  assert.equal(count(r.html, /class="sheet /g), 6);
  assert.equal(count(r.html, /class="ans-fill"/g), 60, '答えのページに 60 問の答え');
});

test('答えのページ: 問題だけ／問題と答え／答えだけ', () => {
  assert.deepEqual(['q', 'qa', 'a'].map((answers) => { const { r } = build({ type: 'maze', common: { answers }, maze: { pages: 2 } }); return [r.questions, r.answers]; }), [[2, 0], [2, 2], [0, 2]]);
  // なぞり書き・漢字には答えがない（設定が「答えだけ」でも問題のページを出す）
  const k = build({ type: 'kana', common: { answers: 'a' } }).r;
  assert.equal(k.answers, 0);
  assert.ok(k.questions >= 1);
});

test('答えのページの答えは正しい（たし算・ひき算・九九・百ます）', () => {
  const { wb, s } = build({ type: 'arith', seed: 8, arith: { op: 'mix', level: 'd2d2', count: 30 } });
  const html = S.render(wb, Object.assign({}, s, { common: Object.assign({}, s.common, { answers: 'a' }) })).html;
  const ans = [...html.matchAll(/<span class="ans-fill">(\d+)<\/span>/g)].map((m) => Number(m[1]));
  assert.deepEqual(ans, wb.pages[0].items.map(C.answerOf));
  const h = build({ type: 'hyaku', common: { answers: 'a' }, hyaku: { op: 'mul' } });
  const cells = [...h.r.html.matchAll(/<span class="ans-fill">(\d+)<\/span>/g)].map((m) => Number(m[1]));
  assert.deepEqual(cells, h.wb.pages[0].grids[0].cells.flat());
});

test('クレジット: 既定で各ページに入り、外せる', () => {
  const on = build({ type: 'clock', clock: { pages: 2 } }).r;
  assert.equal(count(on.html, /yorozu-craft\.com\/gakushu-print\/print\/ で作成/g), 4);
  const off = build({ type: 'clock', common: { credit: false }, clock: { pages: 2 } }).r;
  assert.equal(count(off.html, /yorozu-craft\.com/g), 0);
});

test('名前: うすい字／こい字、欄を外す、HTML として安全', () => {
  assert.match(build({ type: 'maze', common: { name: 'はなこ' } }).r.html, /<span class="name-trace">はなこ<\/span>/);
  assert.match(build({ type: 'maze', common: { name: 'はなこ', nameTrace: false } }).r.html, /name-dark/);
  assert.doesNotMatch(build({ type: 'maze', common: { name: 'はなこ', showName: false } }).r.html, /なまえ/);
  const x = build({ type: 'maze', common: { name: '<b>x</b>' } }).r.html;
  assert.ok(!x.includes('<b>x</b>') && x.includes('&lt;b&gt;'));
});

test('なぞり書き: あ行〜わ行（46 字）は大きいますで 1 ページ 11 行 → 5 ページ', () => {
  const { r, wb } = build({ type: 'kana', kana: { rows: ['a', 'ka', 'sa', 'ta', 'na', 'ha', 'ma', 'ya', 'ra', 'wa'], size: 'L' } });
  assert.equal(wb.pages.reduce((n, p) => n + p.rows.length, 0), 46);
  assert.equal(r.total, 5);
  const kata = build({ type: 'kana', kana: { script: 'kata', rows: ['a'] } }).r.html;
  assert.ok(kata.includes('ア') && !kata.includes('>あ<'));
});

test('なぞる言葉: 入れた言葉がそのまま入り、言葉はページをまたがない', () => {
  const words = Array.from({ length: 5 }, (_, i) => 'はなこ'.repeat(1) + 'あいうえお'[i]).join(' ');
  const { wb } = build({ type: 'kana', kana: { source: 'words', words } });
  assert.equal(wb.pages.length, 2);      // 3 行 × 5 語 = 15 行、1 ページ 11 行 → 3 語 9 行＋2 語 6 行
  assert.equal(wb.pages[0].rows.length, 9);
  const empty = build({ type: 'kana', kana: { source: 'words', words: 'ABC' } });
  assert.equal(empty.wb.pages.length, 0);
  assert.ok(empty.wb.notes.length > 0);
});

test('漢字: 表の順は何番目から、ばらばらは種で変わる、えらんだ字はそのまま', () => {
  const o = build({ type: 'kanji', kanji: { grade: 1, source: 'order', start: 11, size: 'L', pages: 2 } }).wb;
  const chars = o.pages.flatMap((p) => p.rows.map((r) => r[0].ch));
  assert.deepEqual(chars, Array.from(K[1]).slice(10, 32));
  const last = build({ type: 'kanji', kanji: { grade: 1, source: 'order', start: 75, pages: 1 } }).wb;
  assert.equal(last.pages[0].rows.length, 6);   // 75〜80 番目
  assert.ok(last.notes.length);
  const r1 = build({ type: 'kanji', seed: 1, kanji: { source: 'random', grade: 2 } }).wb.pages[0].rows.map((r) => r[0].ch).join('');
  const r2 = build({ type: 'kanji', seed: 2, kanji: { source: 'random', grade: 2 } }).wb.pages[0].rows.map((r) => r[0].ch).join('');
  assert.notEqual(r1, r2);
  assert.ok(Array.from(r1).every((c) => K[2].includes(c)));
  const c = build({ type: 'kanji', kanji: { source: 'custom', grade: 1, custom: '森空海' } }).wb;
  assert.deepEqual(c.pages[0].rows.map((r) => r[0].ch), ['森', '空']);
});

test('入れたい問題「だけ」: ページ数は問題の数から決まる', () => {
  const custom = Array.from({ length: 25 }, (_, i) => (i % 9 + 1) + '+' + ((i * 7) % 9 + 1)).join('\n');
  const { r, wb } = build({ type: 'arith', arith: { count: 10, custom, customMode: 'only', pages: 5 } });
  assert.equal(wb.pages.length, 3);
  assert.equal(r.questions, 3);
  assert.equal(wb.pages[2].items.length, 5);
  assert.equal(wb.pages[2].startNo, 21);
});

test('九九（順番どおり）: 段の数で 1 ページに入る', () => {
  const { wb } = build({ type: 'kuku', kuku: { dans: [2, 3], order: 'seq', count: 20 } });
  assert.equal(wb.pages.length, 1);
  assert.equal(wb.pages[0].items.length, 18);
  const three = build({ type: 'kuku', kuku: { dans: [1, 2, 3, 4], order: 'seq', count: 20 } }).wb;
  assert.equal(three.pages.length, 2);
});

test('すべての種類で、同じ種なら同じ HTML（見本と印刷が一致する）', () => {
  for (const type of C.TYPES) {
    const a = build({ type, seed: 55 }).r.html, b = build({ type, seed: 55 }).r.html;
    assert.equal(a, b, type);
    assert.ok(a.startsWith('<section class="sheet'), type);
  }
});
