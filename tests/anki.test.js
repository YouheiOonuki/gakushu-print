// 暗記カード（anki/anki.js。yorozu-plans 企画書 54・ROADMAP K50・ACCEPTANCE 3 章）のテスト
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../anki/anki.js');

// ACCEPTANCE 3 章の試料: CSV 20 行
const CSV20 = Array.from({ length: 20 }, (_, i) => `word${i + 1},ことば${i + 1}`).join('\n');

test('CSV 20 行 → 20 枚。名刺 10 面は紙 2 枚（両面で 4 ページ）、A4 2 面は紙 10 枚', () => {
  const p = A.parseCards(CSV20);
  assert.equal(p.cards.length, 20);
  assert.deepEqual(p.notes, []);
  const m = A.layoutPages(20, A.normalize({ layout: 'meishi' }));
  assert.equal(m.length, 4);
  assert.deepEqual(m.map((x) => x.side), ['f', 'b', 'f', 'b']);
  assert.deepEqual(m.map((x) => x.slots.length), [10, 10, 10, 10]);
  const a = A.layoutPages(20, A.normalize({ layout: 'a4half' }));
  assert.equal(a.length, 20);
  assert.ok(a.every((x) => x.slots.length === 2));
  const r = A.render(A.parseCards(CSV20).cards, A.normalize({ layout: 'meishi' }), 'credit');
  assert.equal(r.sheets, 2);
  assert.equal(r.pages, 4);
  assert.equal((r.html.match(/class="ak-card"/g) || []).length, 40);
});

test('名刺は 91×55mm で A4 に収まり、カードどうしが重ならない', () => {
  const L = A.LAYOUTS.meishi;
  assert.equal(L.w, 91); assert.equal(L.h, 55);
  const [pg] = A.layoutPages(10, A.normalize({ layout: 'meishi', sides: 'front' }));
  for (const s of pg.slots) {
    assert.ok(s.x >= 0 && s.y >= 0 && s.x + s.w <= A.PAPER.w && s.y + s.h <= A.PAPER.h, JSON.stringify(s));
  }
  for (const a of pg.slots) for (const b of pg.slots) {
    if (a === b) continue;
    const overlap = a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;
    assert.ok(!overlap);
  }
  // 紙のまん中（左右・上下の余白が同じ）
  const xs = pg.slots.map((s) => s.x), ys = pg.slots.map((s) => s.y);
  assert.equal(Math.min(...xs), A.PAPER.w - (Math.max(...xs) + L.w));
  assert.equal(Math.min(...ys), A.PAPER.h - (Math.max(...ys) + L.h));
});

// 両面印刷: 紙を裏返したとき、どのカードも表の真うらに裏がある（長辺とじ・短辺とじ、端数のページも）
for (const layout of Object.keys(A.LAYOUTS)) {
  for (const binding of ['long', 'short']) {
    test(`両面で表と裏が重なる: ${layout}・${binding}`, () => {
      for (const n of [1, 3, 7, 10, 13, 20, 23]) {
        const pages = A.layoutPages(n, A.normalize({ layout, binding }));
        const seen = new Set();
        for (let k = 0; k < pages.length; k += 2) {
          const f = pages[k], b = pages[k + 1];
          assert.equal(f.side, 'f'); assert.equal(b.side, 'b'); assert.equal(f.sheet, b.sheet);
          for (const bs of b.slots) {
            const fs = f.slots.find((s) => s.i === bs.i);
            assert.ok(fs, 'card ' + bs.i);
            // 裏のカードの 4 つの角を裏返すと、表のカードの 4 つの角に重なる
            const corners = [[bs.x, bs.y], [bs.x + bs.w, bs.y], [bs.x, bs.y + bs.h], [bs.x + bs.w, bs.y + bs.h]].map(([x, y]) => A.flipPoint(x, y, binding));
            const xs = corners.map((c) => c.x), ys = corners.map((c) => c.y);
            assert.ok(Math.abs(Math.min(...xs) - fs.x) < 1e-9 && Math.abs(Math.max(...xs) - (fs.x + fs.w)) < 1e-9, `${layout} ${binding} n=${n} i=${bs.i} x`);
            assert.ok(Math.abs(Math.min(...ys) - fs.y) < 1e-9 && Math.abs(Math.max(...ys) - (fs.y + fs.h)) < 1e-9, `${layout} ${binding} n=${n} i=${bs.i} y`);
            seen.add(bs.i);
          }
        }
        assert.equal(seen.size, n);
      }
    });
  }
}

test('長辺とじの名刺: 1 段目の左のカードの裏は、裏のページの右', () => {
  const [f, b] = A.layoutPages(2, A.normalize({ layout: 'meishi', binding: 'long' }));
  assert.equal(f.slots[0].c, 0); assert.equal(b.slots[0].c, 1);
  assert.equal(f.slots[1].c, 1); assert.equal(b.slots[1].c, 0);
  const [, b2] = A.layoutPages(2, A.normalize({ layout: 'meishi', binding: 'short' }));
  assert.equal(b2.slots[0].r, 4); assert.equal(b2.slots[0].c, 0);
});

test('表だけ・裏だけ・赤シート用のページ', () => {
  assert.deepEqual(A.layoutPages(20, A.normalize({ sides: 'front' })).map((p) => p.side), ['f', 'f']);
  assert.deepEqual(A.layoutPages(20, A.normalize({ sides: 'back' })).map((p) => p.side), ['b', 'b']);
  // 赤シート用は片面だけ（sides の値によらない）
  assert.deepEqual(A.layoutPages(20, A.normalize({ red: true, sides: 'both' })).map((p) => p.side), ['r', 'r']);
});

test('赤シート用: 裏は #e60012、表は黒。1 面に表と裏の両方', () => {
  const cards = [{ f: 'apple', b: 'りんご' }];
  const r = A.render(cards, A.normalize({ red: true }), '');
  assert.equal(A.RED, '#e60012');
  assert.match(r.html, /class="ak-text ak-q"[^>]*>apple</);
  assert.match(r.html, /class="ak-text ak-a" style="[^"]*color:#e60012"[^>]*>りんご</);
  assert.ok(!/ak-side-b/.test(r.html));
});

test('読み取り: カンマ・タブ・引用符・改行・見出し・空行', () => {
  assert.deepEqual(A.parseCards('a,b\n\nc,d').cards.map((c) => [c.f, c.b]), [['a', 'b'], ['c', 'd']]);
  // タブ区切り（Excel から貼る）。カンマは字として残る
  assert.deepEqual(A.parseCards('1,000\t千\nx\ty').cards.map((c) => [c.f, c.b]), [['1,000', '千'], ['x', 'y']]);
  // 引用符の中のカンマ・改行・""
  const p = A.parseCards('"a, b","line1\nline2"\n"say ""hi""",c');
  assert.deepEqual(p.cards.map((c) => [c.f, c.b]), [['a, b', 'line1\nline2'], ['say "hi"', 'c']]);
  // 見出しの行は使わない
  const h = A.parseCards('表,裏\ncat,ねこ');
  assert.equal(h.cards.length, 1);
  assert.equal(h.notes.length, 1);
  assert.equal(A.parseCards('front,back\ncat,neko').cards.length, 1);
  // CRLF と BOM
  assert.deepEqual(A.parseCards('﻿a,b\r\nc,d\r\n').cards.map((c) => c.f), ['a', 'c']);
  // 3 列目・裏が空・長すぎる面
  const n = A.parseCards('a,b,c\nd\n' + 'x'.repeat(250) + ',y');
  assert.equal(n.cards.length, 3);
  assert.equal(n.cards[2].f.length, A.MAX_SIDE);
  assert.equal(n.notes.length, 3);
});

test('上限: カードは 500 枚まで', () => {
  const p = A.parseCards(Array.from({ length: 520 }, (_, i) => `q${i},a${i}`).join('\n'));
  assert.equal(p.cards.length, A.MAX_CARDS);
  assert.ok(p.notes.some((s) => s.includes('500')));
});

test('CSV の書き出し → 読み込みで同じカード', () => {
  const cards = [{ f: 'a, b', b: 'x"y' }, { f: '改行\nあり', b: 'ふつう' }, { f: 'apple', b: 'りんご' }];
  const back = A.parseCards(A.toCsv(cards)).cards.map((c) => ({ f: c.f, b: c.b }));
  assert.deepEqual(back, cards);
  // 1 枚ずつ足す行も、同じ区切りで読める
  const t = [A.lineOf('a,b', 'c', ','), A.lineOf('d"e', 'f', ',')].join('\n');
  assert.deepEqual(A.parseCards(t).cards.map((c) => [c.f, c.b]), [['a,b', 'c'], ['d"e', 'f']]);
  const tt = [A.lineOf('1,000', '千', '\t'), A.lineOf('x', 'y', '\t')].join('\n');
  assert.deepEqual(A.parseCards(tt).cards.map((c) => [c.f, c.b]), [['1,000', '千'], ['x', 'y']]);
});

test('字の大きさ: 短いほど大きく、名刺の面からはみ出さない', () => {
  const L = A.LAYOUTS.meishi, w = L.w - L.pad * 2, h = L.h - L.pad * 2;
  const s1 = A.fitSize('犬', w, h, L.maxPt, L.minPt);
  const s2 = A.fitSize('いぬ・イヌ・犬・dog', w, h, L.maxPt, L.minPt);
  const s3 = A.fitSize('あ'.repeat(120), w, h, L.maxPt, L.minPt);
  assert.ok(s1 >= s2 && s2 > s3, [s1, s2, s3].join(' '));
  for (const [t, pt] of [['犬', s1], ['あ'.repeat(120), s3]]) {
    const em = pt * 0.3528, per = Math.floor(w / em);
    const lines = Math.ceil(A.units(t) / per);
    assert.ok(lines * em * 1.3 <= h + 1e-9);
  }
  // 長い英単語は途中で切らない大きさに
  const long = A.fitSize('internationalization', w, h, L.maxPt, L.minPt);
  assert.ok(A.units('internationalization') <= Math.floor(w / (long * 0.3528)));
});

test('設定の正規化と HTML のエスケープ', () => {
  const d = A.normalize(null);
  assert.equal(d.layout, 'meishi'); assert.equal(d.sides, 'both'); assert.equal(d.red, false);
  const o = A.normalize({ layout: 'x', sides: 'y', binding: 'z', red: 1, title: 'あ'.repeat(99) });
  assert.equal(o.layout, 'meishi'); assert.equal(o.sides, 'both'); assert.equal(o.binding, 'long'); assert.equal(o.red, true); assert.equal(o.title.length, 40);
  const r = A.render([{ f: '<b>x</b>', b: 'a&b' }], A.normalize({}), '');
  assert.ok(r.html.includes('&lt;b&gt;x&lt;/b&gt;'));
  assert.ok(r.html.includes('a&amp;b'));
});

test('めくる順: 入れた順・ばらばら（全部が 1 回ずつ）', () => {
  assert.deepEqual(A.playOrder(5, 'seq'), [0, 1, 2, 3, 4]);
  let s = 1;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const o = A.playOrder(30, 'random', rnd);
  assert.deepEqual([...o].sort((a, b) => a - b), Array.from({ length: 30 }, (_, i) => i));
  assert.notDeepEqual(o, Array.from({ length: 30 }, (_, i) => i));
});
