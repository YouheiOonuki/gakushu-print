// 問題づくりのテスト（乱数・たし算ひき算・九九・百ます・時計）: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calc.js');

const arith = (o) => Object.assign({ op: 'add', level: 'd1', carry: 'any', count: 20, style: 'yoko', pages: 1 }, o);
const SEEDS = [1, 2, 3, 42, 12345, 987654321, 4294967295];

test('makeRng: 同じ種からは同じ並び、ちがう種・用途からはちがう並び', () => {
  const a = C.makeRng(7, 1), b = C.makeRng(7, 1), c = C.makeRng(8, 1), d = C.makeRng(7, 2);
  const sa = Array.from({ length: 20 }, () => a.next());
  assert.deepEqual(sa, Array.from({ length: 20 }, () => b.next()));
  assert.notDeepEqual(sa, Array.from({ length: 20 }, () => c.next()));
  assert.notDeepEqual(sa, Array.from({ length: 20 }, () => d.next()));
  assert.ok(sa.every((x) => x >= 0 && x < 1));
  const r = C.makeRng(1);
  for (let i = 0; i < 1000; i++) { const v = r.int(3, 5); assert.ok(v >= 3 && v <= 5 && Number.isInteger(v)); }
});

test('makeRng.shuffle: 並べ替えるだけで、要素は変わらない', () => {
  const x = C.makeRng(5).shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(x.slice().sort(), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('seedLabel: 5 桁-5 桁', () => {
  assert.equal(C.seedLabel(12345), '00000-12345');
  assert.equal(C.seedLabel(4294967295), '42949-67295');
});

test('hasCarry / hasBorrow: 位ごとに見る', () => {
  assert.equal(C.hasCarry(3, 4), false);
  assert.equal(C.hasCarry(5, 5), true);       // 答えが 10 も「あり」
  assert.equal(C.hasCarry(23, 45), false);
  assert.equal(C.hasCarry(27, 45), true);
  assert.equal(C.hasCarry(150, 160), true);   // 十の位でくり上がり
  assert.equal(C.hasCarry(123, 456), false);
  assert.equal(C.hasBorrow(15, 3), false);
  assert.equal(C.hasBorrow(15, 8), true);
  assert.equal(C.hasBorrow(40, 20), false);
  assert.equal(C.hasBorrow(305, 72), true);   // 十の位で 0 < 7
  assert.equal(C.hasBorrow(10, 3), true);
});

test('genArith: 「なし」「あり」の条件を全問で守り、答えは 0 以上で桁の範囲に入る', () => {
  for (const op of ['add', 'sub', 'mix']) {
    for (const level of Object.keys(C.ARITH_LEVELS)) {
      for (const carry of ['none', 'with', 'any']) {
        if (!C.arithPossible(op, level, carry)) continue;
        const lv = C.ARITH_LEVELS[level];
        for (const seed of [1, 99, 2024]) {
          const list = C.genArith(arith({ op, level, carry, count: 30 }), seed, 60);
          assert.equal(list.length, 60);
          for (const p of list) {
            const tag = `${op}/${level}/${carry} ${p.a}${p.op}${p.b}`;
            assert.ok(p.a >= lv.a[0] && p.a <= lv.a[1] && p.b >= lv.b[0] && p.b <= lv.b[1], '範囲 ' + tag);
            if (op === 'add') assert.equal(p.op, '+', tag);
            if (op === 'sub') assert.equal(p.op, '-', tag);
            assert.ok(C.answerOf(p) >= 0, 'マイナスにならない ' + tag);
            const need = p.op === '+' ? C.hasCarry(p.a, p.b) : C.hasBorrow(p.a, p.b);
            if (carry === 'none') assert.equal(need, false, 'なし ' + tag);
            if (carry === 'with') assert.equal(need, true, 'あり ' + tag);
          }
        }
      }
    }
  }
});

test('genArith: 答えが正しい（answerOf）', () => {
  assert.equal(C.answerOf({ a: 7, b: 8, op: '+' }), 15);
  assert.equal(C.answerOf({ a: 15, b: 9, op: '-' }), 6);
  assert.equal(C.answerOf({ a: 6, b: 7, op: '×' }), 42);
});

test('genArith: 同じページに同じ問題を出さない（組み合わせが足りるとき）', () => {
  for (const seed of SEEDS) {
    // 1けた+1けたのくり上がりなし（1〜9 どうしで和が 9 以下）は 36 通り。30 問なら重ならない
    const list = C.genArith(arith({ level: 'd1', carry: 'none', count: 30 }), seed, 30);
    assert.equal(new Set(list.map((p) => p.a + p.op + p.b)).size, 30, 'seed ' + seed);
    // 2けた+2けたは十分多いので、10 枚 300 問でも重ならない
    const big = C.genArith(arith({ level: 'd2d2', count: 30 }), seed, 300);
    assert.equal(new Set(big.map((p) => p.a + p.op + p.b)).size, 300);
  }
});

test('genArith: 同じ種・同じ設定なら同じ問題、種がちがえばちがう問題', () => {
  const o = arith({ op: 'mix', level: 'd2d1', carry: 'with' });
  assert.deepEqual(C.genArith(o, 77, 20), C.genArith(o, 77, 20));
  assert.notDeepEqual(C.genArith(o, 77, 20), C.genArith(o, 78, 20));
});

test('genArith: まぜる（mix）は、たし算とひき算の両方が出る', () => {
  const list = C.genArith(arith({ op: 'mix', level: 'd2d2', count: 30 }), 3, 30);
  assert.ok(list.some((p) => p.op === '+') && list.some((p) => p.op === '-'));
});

test('arithPossible: 1けたどうしのひき算にくり下がりは無いので「あり」は選べない', () => {
  assert.equal(C.arithPossible('sub', 'd1', 'with'), false);
  assert.equal(C.arithPossible('mix', 'd1', 'with'), false);
  assert.equal(C.arithPossible('add', 'd1', 'with'), true);
  assert.equal(C.arithPossible('sub', 'teen', 'with'), true);
  // 正規化で「まぜる」に戻す
  assert.equal(C.normalizeState({ arith: { op: 'sub', level: 'd1', carry: 'with' } }).arith.carry, 'any');
});

test('genKuku: 順番・逆・ばらばら。ばらばらは全部を一巡するまで重ならず、同じ問題を続けない', () => {
  const seq = C.genKuku({ dans: [3], order: 'seq' }, 1, 0);
  assert.deepEqual(seq.map((p) => p.b), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.ok(seq.every((p) => p.a === 3 && p.op === '×'));
  assert.deepEqual(C.genKuku({ dans: [3], order: 'rev' }, 1, 0).map((p) => p.b), [9, 8, 7, 6, 5, 4, 3, 2, 1]);
  for (const seed of SEEDS) {
    const r = C.genKuku({ dans: [2, 7], order: 'random' }, seed, 30);
    assert.equal(r.length, 30);
    assert.equal(new Set(r.slice(0, 18).map((p) => p.a + 'x' + p.b)).size, 18, '一巡目は 18 通りすべて');
    assert.ok(r.every((p) => (p.a === 2 || p.a === 7) && p.b >= 1 && p.b <= 9));
    for (let i = 1; i < r.length; i++) assert.ok(!(r[i].a === r[i - 1].a && r[i].b === r[i - 1].b), '続けない');
  }
});

test('genHyaku: 上と左は 0〜9 を 1 回ずつ、答えは上と左から計算', () => {
  for (const op of ['add', 'sub', 'mul']) {
    const g = C.genHyaku({ op, size: 10 }, 5, 0);
    assert.equal(g.top.length, 10);
    assert.equal(g.left.length, 10);
    assert.deepEqual(g.left.slice().sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual(g.top.slice().sort((a, b) => a - b), op === 'sub' ? [10, 11, 12, 13, 14, 15, 16, 17, 18, 19] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    g.left.forEach((l, r) => g.top.forEach((t, c) => {
      assert.equal(g.cells[r][c], op === 'add' ? t + l : op === 'sub' ? t - l : t * l);
      assert.ok(g.cells[r][c] >= 0);
    }));
  }
  const small = C.genHyaku({ op: 'add', size: 5 }, 5, 0);
  assert.equal(small.cells.length, 5);
  assert.equal(new Set(small.top).size, 5);
  assert.ok(!small.top.includes(0));
  assert.notDeepEqual(C.genHyaku({ op: 'add', size: 10 }, 5, 0).top, C.genHyaku({ op: 'add', size: 10 }, 5, 1).top, 'ページごとにちがう並び');
});

test('genClock: むずかしさに合う時刻だけ。1〜12 時、0〜59 分', () => {
  for (const level of C.CLOCK_LEVELS) {
    for (const seed of SEEDS) {
      const ts = C.genClock({ level }, seed, 24);
      assert.equal(ts.length, 24);
      for (const t of ts) {
        assert.ok(t.h >= 1 && t.h <= 12 && t.m >= 0 && t.m <= 59);
        assert.ok(C.clockFits(level, t.m), level + ' ' + t.h + ':' + t.m);
      }
    }
  }
  // 何時だけ（12 通り）: 12 問なら全部ちがう
  const h = C.genClock({ level: 'hour' }, 9, 12);
  assert.equal(new Set(h.map((t) => t.h)).size, 12);
  // 5 分きざみ 12 問は重ならない
  const f = C.genClock({ level: 'five' }, 9, 12);
  assert.equal(new Set(f.map((t) => t.h + ':' + t.m)).size, 12);
});

test('clockText / funPun / handAngles: 子ども向けの読みと針の角度', () => {
  assert.equal(C.clockText({ h: 3, m: 0 }), '3じ');
  assert.equal(C.clockText({ h: 3, m: 30 }), '3じ30ぷん');
  assert.equal(C.clockText({ h: 7, m: 5 }), '7じ5ふん');
  const pun = [1, 3, 4, 6, 8, 10, 11, 20, 44, 58].map(C.funPun);
  assert.ok(pun.every((x) => x === 'ぷん'));
  assert.ok([2, 5, 7, 9, 12, 15, 27, 59].map(C.funPun).every((x) => x === 'ふん'));
  assert.deepEqual(C.handAngles({ h: 3, m: 0 }), { hour: 90, minute: 0 });
  assert.deepEqual(C.handAngles({ h: 12, m: 30 }), { hour: 15, minute: 180 });   // 短い針は 12 と 1 のまん中
  assert.deepEqual(C.handAngles({ h: 9, m: 45 }), { hour: 292.5, minute: 270 });
});
