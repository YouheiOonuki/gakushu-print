// バックアップファイル（書き出し・読み込み）のテスト: node --test tests/*.test.js
// README「ツールを追加するとき」20（決定 D31）
const test = require('node:test');
const assert = require('node:assert/strict');
const { backupFileName, buildBackup, parseBackup, normalizeState, normalizePresets } = require('../calc.js');

const TOOL = 'gakushu-print';
const DATA = { settings: { type: 'kana', seed: 5, kana: { source: 'words', words: 'はなこ' } }, presets: [{ id: 'p1', name: 'はなこ', state: { type: 'kanji' } }] };
const REQUIRED = ['settings', 'presets'];

test('backupFileName: <ツール名>-backup-YYYYMMDD.json（端末の日付）', () => {
  assert.equal(backupFileName(TOOL, new Date(2026, 8, 24, 23, 59)), TOOL + '-backup-20260924.json');
  assert.equal(backupFileName(TOOL, new Date(2027, 0, 5)), TOOL + '-backup-20270105.json');
});

test('buildBackup: tool・version・exportedAt・data の形', () => {
  const b = buildBackup(TOOL, DATA, new Date('2026-09-24T01:02:03Z'));
  assert.deepEqual(Object.keys(b), ['tool', 'version', 'exportedAt', 'data']);
  assert.equal(b.tool, TOOL);
  assert.equal(b.version, 1);
  assert.equal(b.exportedAt, '2026-09-24T01:02:03.000Z');
  assert.deepEqual(b.data, DATA);
});

test('parseBackup: 書き出したファイルはそのまま読める', () => {
  const r = parseBackup(JSON.stringify(buildBackup(TOOL, DATA)), TOOL, REQUIRED);
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, DATA);
});

test('parseBackup: ほかのツールのファイルは断る', () => {
  const r = parseBackup(JSON.stringify(buildBackup('other-tool', DATA)), TOOL, REQUIRED);
  assert.equal(r.ok, false);
  assert.match(r.error, /ほかのツール（other-tool）/);
});

test('parseBackup: 壊れた JSON・JSON でないものは断る', () => {
  for (const text of ['{"tool": "' + TOOL, '', 'こんにちは', 'null', '[]', '123']) {
    const r = parseBackup(text, TOOL, REQUIRED);
    assert.equal(r.ok, false, text);
    assert.match(r.error, /読み取れませんでした/);
  }
});

test('parseBackup: 項目が欠けている・形が違うものは断る', () => {
  const ok = buildBackup(TOOL, DATA);
  const cases = [
    Object.assign({}, ok, { tool: undefined }),
    Object.assign({}, ok, { version: undefined }),
    Object.assign({}, ok, { version: '1' }),
    Object.assign({}, ok, { data: undefined }),
    Object.assign({}, ok, { data: [] }),
    Object.assign({}, ok, { data: 'x' }),
  ];
  REQUIRED.forEach((k) => {
    const data = Object.assign({}, DATA);
    delete data[k];
    cases.push(Object.assign({}, ok, { data }));
  });
  cases.forEach((c, i) => {
    const r = parseBackup(JSON.stringify(c), TOOL, REQUIRED);
    assert.equal(r.ok, false, 'case ' + i);
    assert.ok(typeof r.error === 'string' && r.error.length > 0);
  });
});

test('parseBackup: 新しい版の形式は、その旨を伝えて断る', () => {
  const r = parseBackup(JSON.stringify(Object.assign(buildBackup(TOOL, DATA), { version: 2 })), TOOL, REQUIRED);
  assert.equal(r.ok, false);
  assert.match(r.error, /新しい版/);
});

test('書き出し → 読み込み → 正規化で、設定とよく使う設定が元に戻る', () => {
  const state = normalizeState({ type: 'arith', seed: 99, common: { name: 'たろう' }, arith: { op: 'sub', level: 'teen', carry: 'with', custom: '15-9\n12-3' } });
  const presets = normalizePresets([{ id: 'a', name: 'たろう 計算', state: state }, { id: 'b', name: 'はなこ ひらがな', state: { type: 'kana', kana: { source: 'words', words: 'はなこ りんご' } } }]);
  const text = JSON.stringify(buildBackup(TOOL, { settings: state, presets }));
  const r = parseBackup(text, TOOL, REQUIRED);
  assert.equal(r.ok, true);
  assert.deepEqual(normalizeState(r.data.settings), state);
  assert.deepEqual(normalizePresets(r.data.presets), presets);
  assert.equal(presets[1].state.kana.words, 'はなこ りんご');
  assert.equal(presets[0].state.seed, undefined, 'よく使う設定は種を持たない');
});

test('読み込んだ中身はそのまま信じない（おかしな値は既定に戻す）', () => {
  const r = parseBackup(JSON.stringify(buildBackup(TOOL, { settings: { type: 'evil', seed: -5, arith: { count: 999, pages: 500, level: 'x' }, common: { name: 123 } }, presets: 'x' })), TOOL, REQUIRED);
  assert.equal(r.ok, true);
  const s = normalizeState(r.data.settings);
  assert.equal(s.type, 'arith');
  assert.equal(s.seed, 0);
  assert.equal(s.arith.count, 20);
  assert.equal(s.arith.pages, 10);
  assert.equal(s.arith.level, 'd1');
  assert.equal(s.common.name, '');
  assert.deepEqual(normalizePresets(r.data.presets), []);
  const many = normalizePresets(Array.from({ length: 50 }, (_, i) => ({ id: 'x', name: 'n' + i })));
  assert.equal(many.length, 30);
  assert.equal(new Set(many.map((p) => p.id)).size, 30, 'id は重ならない');
});
