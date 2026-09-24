// 「自分で入れる」の読み取りのテスト（入れたい問題・時刻・なぞる言葉・漢字）: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calc.js');
const K = require('../constants.js').kanjiByGrade.value;

const rule = (o) => C.arithRule(Object.assign({ op: 'add', level: 'd1' }, o));

test('parseArithLines: 半角・全角・番号・「=」つきを読む', () => {
  const r = C.parseArithLines('7+8\n７＋８＝\n(3) 4 + 5 =\n1) 2+2= 4\n\n  ', rule({ op: 'add', level: 'teen' }));
  assert.deepEqual(r.items, [{ a: 7, b: 8, op: '+' }, { a: 7, b: 8, op: '+' }, { a: 4, b: 5, op: '+' }, { a: 2, b: 2, op: '+' }]);
  assert.deepEqual(r.errors, []);
});

test('parseArithLines: ひき算の記号（－ − ー）とかけ算の記号（× x ＊ *）', () => {
  const s = C.parseArithLines('15-9\n15－9\n15−9\n15ー9', rule({ op: 'sub', level: 'teen' }));
  assert.equal(s.items.length, 4);
  assert.ok(s.items.every((p) => p.a === 15 && p.b === 9 && p.op === '-'));
  const k = C.parseArithLines('6×7\n6x7\n6X7\n6＊7\n6*7', C.kukuRule());
  assert.equal(k.items.length, 5);
  assert.ok(k.items.every((p) => p.a === 6 && p.b === 7 && p.op === '×'));
});

test('parseArithLines: 設定と合わない行は理由つきで外す', () => {
  const r = C.parseArithLines('7+8\n9-4\n3-5\n120+3\nりんご\n8÷2', rule({ op: 'add', level: 'd1' }));
  assert.deepEqual(r.items, [{ a: 7, b: 8, op: '+' }]);
  const reasons = r.errors.map((e) => e.line + ':' + e.reason);
  assert.equal(r.errors.length, 5);
  assert.match(reasons[0], /^2:.*「たし算」/);
  assert.match(reasons[1], /^3:.*「たし算」/);          // ひき算は入れられない（マイナスより先に種類で断る）
  assert.match(reasons[2], /^4:.*大きすぎ/);
  assert.match(reasons[3], /^5:.*読めません/);
  assert.match(reasons[4], /^6:.*わり算/);
});

test('parseArithLines: ひき算は答えがマイナスになるものを外す。たし算は順番を入れ替えて範囲を見る', () => {
  const s = C.parseArithLines('3-5\n15-9\n25-9', rule({ op: 'sub', level: 'teen' }));
  assert.deepEqual(s.items, [{ a: 15, b: 9, op: '-' }]);
  assert.match(s.errors[0].reason, /マイナス/);
  assert.match(s.errors[1].reason, /大きすぎ/);          // 10いくつ − 1けた の設定で 25
  const a = C.parseArithLines('3+15\n15+3\n15+13', rule({ op: 'add', level: 'teen' }));
  assert.equal(a.items.length, 2);
  assert.match(a.errors[0].reason, /大きすぎ/);
});

test('parseArithLines: まぜるの設定なら、たし算もひき算も入る', () => {
  const r = C.parseArithLines('7+8\n9-4', rule({ op: 'mix', level: 'd1' }));
  assert.equal(r.items.length, 2);
});

test('parseArithLines: 九九は 1〜9 どうしのかけ算だけ', () => {
  const r = C.parseArithLines('6×7\n10×2\n0×5\n6+7', C.kukuRule());
  assert.deepEqual(r.items, [{ a: 6, b: 7, op: '×' }]);
  assert.equal(r.errors.length, 3);
  assert.match(r.errors[0].reason, /九九の範囲/);
  assert.match(r.errors[2].reason, /九九/);
});

test('withCustom: まぜるは合計の数を保ち、入れた問題が必ず入る。「だけ」は入れた問題だけ', () => {
  const o = { op: 'add', level: 'd2d2', carry: 'any', count: 20, style: 'yoko', pages: 2 };
  const mine = [{ a: 7, b: 8, op: '+' }, { a: 9, b: 9, op: '+' }];
  const gen = (n) => C.genArith(o, 5, n);
  const mixed = C.withCustom(mine, 'mix', 20, 2, gen, 5);
  assert.equal(mixed.length, 40);
  mine.forEach((m) => assert.ok(mixed.some((p) => p.a === m.a && p.b === m.b)));
  assert.deepEqual(C.withCustom(mine, 'only', 20, 2, gen, 5), mine);
  assert.equal(C.withCustom([], 'only', 20, 2, gen, 5).length, 40, '入れた問題が無ければ作った問題');
  assert.deepEqual(C.withCustom(mine, 'mix', 20, 2, gen, 5), mixed, '同じ種なら同じ並び');
});

test('parseClockLines: いろいろな書き方の時刻を読み、むずかしさに合わないものを外す', () => {
  const r = C.parseClockLines('7:30\n7時30分\n8じはん\n19:05\n７：１５、9時', 'min');
  assert.deepEqual(r.items, [{ h: 7, m: 30 }, { h: 7, m: 30 }, { h: 8, m: 30 }, { h: 7, m: 5 }, { h: 7, m: 15 }, { h: 9, m: 0 }]);
  const h = C.parseClockLines('7:00\n7:30\nねる', 'hour');
  assert.deepEqual(h.items, [{ h: 7, m: 0 }]);
  assert.match(h.errors[0].reason, /何時/);
  assert.match(h.errors[1].reason, /読めません/);
  const f = C.parseClockLines('7:05\n7:07\n25:00\n0:10', 'five');
  assert.deepEqual(f.items, [{ h: 7, m: 5 }, { h: 12, m: 10 }]);
  assert.match(f.errors[0].reason, /5 分/);
  assert.match(f.errors[1].reason, /ありえない/);
});

test('parseKanaWords: ひらがなのプリントにはひらがなだけ（ー・小さい字は使える）', () => {
  const r = C.parseKanaWords('はなこ　りんご\nジュース ちょこれーと 花子 abc', 'hira');
  assert.deepEqual(r.words, ['はなこ', 'りんご', 'ちょこれーと']);   // 「ジュース」から残る「ー」だけの言葉は使わない
  assert.deepEqual(r.dropped, ['ジ', 'ュ', 'ス', '花', '子', 'a', 'b', 'c']);
  assert.match(r.hint, /カタカナ/);
});

test('parseKanaWords: カタカナのプリントにはカタカナだけ', () => {
  const r = C.parseKanaWords('ジュース、ケーキ・すし', 'kata');
  assert.deepEqual(r.words, ['ジュース', 'ケーキ']);
  assert.deepEqual(r.dropped, ['す', 'し']);
  assert.match(r.hint, /ひらがな/);
  assert.equal(C.parseKanaWords('ジュース', 'kata').hint, '');
});

test('toKata: ひらがなをカタカナに', () => {
  assert.equal(C.toKata('あいうえお ぁっゃ ー'), 'アイウエオ ァッャ ー');
});

test('parseKanjiInput: 選んだ学年までの字だけ。上の学年・配当表にない字は外して知らせる', () => {
  const map = C.kanjiGradeMap(K);
  const r = C.parseKanjiInput('花が空にさく。森と海と愛と猫。花', 1, map);
  assert.deepEqual(r.chars, ['花', '空', '森']);
  assert.deepEqual(r.higher, [{ c: '海', g: 2 }, { c: '愛', g: 4 }]);
  assert.deepEqual(r.outside, ['猫']);
  const r2 = C.parseKanjiInput('花海愛', 4, map);
  assert.deepEqual(r2.chars, ['花', '海', '愛']);
});
