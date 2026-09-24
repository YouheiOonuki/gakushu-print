// 共有リンク（#s=）と設定の正規化のテスト: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calc.js');
const K = require('../constants.js').kanjiByGrade.value;

test('encodeShare → decodeShare: 種類・設定・種・入れた問題が戻り、同じ問題ができる', () => {
  for (const type of C.TYPES) {
    const s = C.normalizeState({
      type, seed: 3141592653,
      common: { name: 'はなこ', answers: 'a', credit: false, showDate: false },
      arith: { op: 'sub', level: 'teen', carry: 'with', style: 'tate', count: 16, pages: 3, custom: '15-9\n12-5', customMode: 'mix' },
      kuku: { dans: [3, 7], order: 'random', custom: '6×7' },
      clock: { level: 'five', mode: 'draw', custom: '7:30' },
      kana: { script: 'kata', source: 'words', words: 'ジュース ケーキ' },
      kanji: { grade: 3, source: 'custom', custom: '花空森' },
      maze: { level: 'hard', pages: 2 },
    });
    const code = C.encodeShare(s, true);
    assert.match(code, /^[A-Za-z0-9_-]+$/, 'URL にそのまま入る文字だけ');
    const back = C.decodeShare('#s=' + code);
    assert.equal(back.type, type);
    assert.equal(back.seed, s.seed);
    assert.deepEqual(back[type], s[type]);
    assert.deepEqual(back.common, s.common);
    assert.deepEqual(C.buildWorkbook(back, K).pages, C.buildWorkbook(s, K).pages, type + ': 同じ問題');
  }
});

test('encodeShare: 名前は既定では入れない', () => {
  const s = C.normalizeState({ type: 'kana', common: { name: 'たろう' } });
  assert.equal(C.decodeShare('#s=' + C.encodeShare(s)).common.name, '');
  assert.equal(C.decodeShare('#s=' + C.encodeShare(s, true)).common.name, 'たろう');
  assert.ok(!Buffer.from(C.encodeShare(s), 'base64url').toString('utf8').includes('たろう'));
});

test('encodeShare: いま選んでいる種類の設定だけを入れる（ほかの種類の入力はリンクに出ない）', () => {
  const s = C.normalizeState({ type: 'maze', kana: { source: 'words', words: 'ひみつのことば' } });
  const json = Buffer.from(C.encodeShare(s), 'base64url').toString('utf8');
  assert.ok(!json.includes('ひみつ'));
});

test('decodeShare: 壊れたリンク・ちがう形は null', () => {
  for (const h of ['', '#', '#s=', '#s=%%%', '#s=abc', '#x=' + C.encodeShare(C.normalizeState({})),
    '#s=' + Buffer.from(JSON.stringify({ v: 2, t: 'arith' })).toString('base64url'),
    '#s=' + Buffer.from(JSON.stringify({ v: 1, t: 'nope' })).toString('base64url'),
    '#s=' + Buffer.from('not json').toString('base64url')]) {
    assert.equal(C.decodeShare(h), null, h);
  }
});

test('decodeShare: 中身はそのまま信じない（範囲外は直す）', () => {
  const evil = { v: 1, t: 'arith', s: -1, c: { name: '<script>'.repeat(10), answers: 'zzz' }, o: { count: 7, pages: 99, level: 'd9', custom: 'x'.repeat(5000) } };
  const s = C.decodeShare('#s=' + Buffer.from(JSON.stringify(evil)).toString('base64url'));
  assert.equal(s.seed, 0);
  assert.equal(s.common.name.length, 20);
  assert.equal(s.common.answers, 'qa');
  assert.equal(s.arith.count, 20);
  assert.equal(s.arith.pages, 10);
  assert.equal(s.arith.level, 'd1');
  assert.equal(s.arith.custom.length, 2000);
});

test('共有リンクの長さ: ふつうの設定は短い（入れた問題が多いと長くなる）', () => {
  const s = C.normalizeState({ type: 'arith', seed: 4294967295 });
  assert.ok(C.encodeShare(s).length < 400, String(C.encodeShare(s).length));
  const long = C.normalizeState({ type: 'kanji', kanji: { source: 'custom', grade: 6, custom: (K[5] + K[6]).repeat(3) } });   // はりつけた長い文（1,000 字まで保存）
  assert.ok(('https://yorozu-craft.com/gakushu-print/#s=' + C.encodeShare(long)).length > C.SHARE_MAX, 'この長さは画面でファイルを勧める');
});

test('normalizeState: 既定値と、九九の段・かなの行の重なり・範囲外を直す', () => {
  const d = C.normalizeState(undefined);
  assert.equal(d.type, 'arith');
  assert.equal(d.common.credit, true, 'クレジットは既定で入れる（D38）');
  assert.equal(d.common.answers, 'qa');
  const s = C.normalizeState({ kuku: { dans: [3, 3, 0, 10, '5', 2.5] }, kana: { rows: ['ka', 'ka', 'zz'] }, kanji: { grade: 9, start: -3 }, hyaku: { size: 7 }, clock: { count: 5 } });
  assert.deepEqual(s.kuku.dans, [3, 5]);
  assert.deepEqual(s.kana.rows, ['ka']);
  assert.equal(s.kanji.grade, 6);
  assert.equal(s.kanji.start, 1);
  assert.equal(s.hyaku.size, 10);
  assert.equal(s.clock.count, 6);
  // 筆算の問題数は筆算の選択肢から
  assert.equal(C.normalizeState({ arith: { style: 'tate', count: 30 } }).arith.count, 16);
  assert.equal(C.normalizeState({ arith: { style: 'tate', count: 12 } }).arith.count, 12);
});
