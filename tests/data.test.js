// 学年別漢字配当表のデータのテスト: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const CONSTANTS = require('../constants.js');
const { kanjiGradeMap } = require('../calc.js');

const K = CONSTANTS.kanjiByGrade.value;

test('constants: すべての値に出典と確認日がある', () => {
  for (const [key, c] of Object.entries(CONSTANTS)) {
    assert.ok(c.source && c.url && c.checked, `${key} に source / url / checked が無い`);
    assert.match(c.checked, /^\d{4}-\d{2}-\d{2}$/, `${key} の checked は YYYY-MM-DD`);
  }
});

test('学年別漢字配当表: 学年ごとの字数（80・160・200・202・193・191）と合計 1,026 字', () => {
  const counts = { 1: 80, 2: 160, 3: 200, 4: 202, 5: 193, 6: 191 };
  let all = '';
  for (const g of Object.keys(counts)) {
    const chars = Array.from(K[g]);
    assert.equal(chars.length, counts[g], g + '年');
    assert.ok(chars.every((c) => /^[一-鿿]$/.test(c)), g + '年はすべて漢字 1 字');
    all += K[g];
  }
  assert.equal(Array.from(all).length, 1026);
  assert.equal(new Set(Array.from(all)).size, 1026, '学年をまたいでも重なりがない');
});

test('学年別漢字配当表: 2017 年改定で第 4 学年に入った都道府県名の 20 字', () => {
  const map = kanjiGradeMap(K);
  for (const c of '茨媛岡潟岐熊佐埼崎滋鹿縄井沖栃奈梨阪阜富') assert.equal(map[c], 4, c);
  // 城（宮城・茨城）も 4 年
  assert.equal(map['城'], 4);
  // 1 年の最初と最後（表の並び）
  assert.equal(Array.from(K[1])[0], '一');
  assert.equal(Array.from(K[1]).slice(-1)[0], '六');
});
