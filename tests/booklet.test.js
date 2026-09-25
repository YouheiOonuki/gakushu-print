// おでかけ冊子（booklet/）のテスト: 中身の生成・ページの並び・面付けと折ったときの順・共有: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calc.js');
const B = require('../booklet/book.js');
const P = require('../booklet/pages.js');

const AGES = Object.keys(B.AGES), LAYOUTS = Object.keys(B.LAYOUTS), SCENES = Object.keys(B.SCENES);
const SEEDS = Array.from({ length: 12 }, (_, i) => i * 104729 + 17);

test('normalize: 既定値・範囲外・4〜6さいはすうじパズルなし', () => {
  const d = B.normalize(null);
  assert.equal(d.age, 'l'); assert.equal(d.layout, 'a5'); assert.equal(d.flip, 'short');
  assert.deepEqual(d.counts, B.DEFAULT_COUNTS.l);
  const s = B.normalize({ age: 'zz', layout: 'x', countsAuto: false, counts: { maze: 99, dots: -3, bingo: 'a' }, seed: -5, name: 'a'.repeat(50) });
  assert.equal(s.age, 'l'); assert.equal(s.layout, 'a5');
  assert.equal(s.counts.maze, B.MAX_PER_KIND); assert.equal(s.counts.dots, 0); assert.equal(s.counts.bingo, B.DEFAULT_COUNTS.l.bingo);
  assert.equal(s.seed, 0); assert.equal(s.name.length, 20);
  assert.equal(B.normalize({ age: 'y', countsAuto: false, counts: { sudoku: 3 } }).counts.sudoku, 0);
});

test('buildBook: どの設定でも 表紙が 1・うら表紙が最後、ページ数は A5 は 4 の倍数・ミニブックは 8・切ってとじるは偶数', () => {
  for (const age of AGES) for (const layout of LAYOUTS) for (const scene of SCENES) for (const seed of SEEDS.slice(0, 4)) {
    const b = B.buildBook({ age, layout, scene, seed });
    const n = b.pages.length;
    if (layout === 'a5') assert.equal(n % 4, 0);
    if (layout === 'mini') assert.equal(n, 8);
    if (layout === 'cut') assert.equal(n % 2, 0);
    assert.equal(b.pages[0].kind, 'cover');
    assert.equal(b.pages[n - 1].kind, 'back');
    b.pages.forEach((p, i) => assert.equal(p.no, i + 1));
    // 答えは中身より後ろ（うら表紙の前）。答えの指すページは実在し、その種類
    const firstAns = b.pages.findIndex((p) => p.kind === 'answers');
    assert.ok(firstAns > 0, `${age} ${layout}: 答えのページがある`);
    b.pages.slice(firstAns).forEach((p) => assert.ok(p.kind === 'answers' || p.kind === 'back'));
    b.pages.filter((p) => p.kind === 'answers').forEach((p) => p.items.forEach((it) => assert.equal(b.pages[it.page - 1], it.src)));
    if (age === 'y') assert.ok(!b.pages.some((p) => p.kind === 'sudoku'));
  }
});

test('buildBook: 答えを入れないと答えのページが無い（ミニブックは じゆうちょう に）', () => {
  for (const layout of LAYOUTS) {
    const b = B.buildBook({ layout, answers: false, seed: 5 });
    assert.ok(!b.pages.some((p) => p.kind === 'answers'));
    if (layout === 'mini') assert.equal(b.pages[6].kind, 'free');
  }
});

test('buildBook: ページが多すぎるときは 24 ページに収め、お知らせを出す', () => {
  const all = { maze: 4, dots: 4, bingo: 4, words: 4, sudoku: 4, duo: 4, draw: 4 };
  for (const layout of ['a5', 'cut']) {
    const b = B.buildBook({ age: 'u', layout, countsAuto: false, counts: all, seed: 1 });
    assert.ok(b.pages.length <= 24);
    assert.equal(b.notes.length, 1);
    assert.equal(B.bookLength(b.state.counts, true, layout), b.pages.length);
  }
  const zero = B.buildBook({ countsAuto: false, counts: { maze: 0, dots: 0, bingo: 0, words: 0, sudoku: 0, duo: 0, draw: 0 }, seed: 1 });
  assert.equal(zero.pages.length, 4);
  assert.equal(zero.notes.length, 1);
});

test('buildBook: 同じ種と設定なら同じ冊子、種がちがえばちがう冊子', () => {
  const a = JSON.stringify(B.buildBook({ age: 'u', seed: 42 }).pages);
  assert.equal(JSON.stringify(B.buildBook({ age: 'u', seed: 42 }).pages), a);
  assert.notEqual(JSON.stringify(B.buildBook({ age: 'u', seed: 43 }).pages), a);
});

// ---------------- 面付けと折ったときの順 ----------------
test('中とじ: 4〜24 ページで、短辺とじで印刷して重ねて折ると 1 から順に、どのページも正しい向きで読める', () => {
  for (let n = 4; n <= 24; n += 4) {
    const faces = B.imposeA5(n, 'short');
    assert.equal(faces.length, n / 2);
    const seen = faces.flatMap((f) => f.slots.map((x) => x.page)).sort((a, b) => a - b);
    assert.deepEqual(seen, Array.from({ length: n }, (_, i) => i + 1), 'どのページも 1 回ずつ');
    const r = B.readSaddle(B.physicalSheets(faces, 'short'));
    assert.deepEqual(r.order, Array.from({ length: n }, (_, i) => i + 1));
    assert.equal(r.upright, true);
    // 長辺とじで印刷してしまうと、裏がさかさまで順も狂う
    const wrong = B.readSaddle(B.physicalSheets(faces, 'long'));
    assert.equal(wrong.upright, false);
    // 「長辺とじしか選べない」にすると、長辺とじで正しくなる
    const longFaces = B.imposeA5(n, 'long');
    const r2 = B.readSaddle(B.physicalSheets(longFaces, 'long'));
    assert.deepEqual(r2.order, r.order);
    assert.equal(r2.upright, true);
  }
});

test('中とじ: 8 ページの並び（1 枚目 表 8|1・裏 2|7、2 枚目 表 6|3・裏 4|5）', () => {
  const f = B.imposeA5(8, 'short').map((x) => x.slots.map((s) => s.page));
  assert.deepEqual(f, [[8, 1], [2, 7], [6, 3], [4, 5]]);
});

test('ミニブック: 8 面の並び（下の段 6 7 8 1、上の段はさかさまに 5 4 3 2）を折ると 1〜8 の順で正しい向き', () => {
  const faces = B.imposeMini();
  assert.equal(faces.length, 1);
  assert.equal(faces[0].slots.length, 8);
  const r = B.readMini(B.miniPanels(faces));
  assert.deepEqual(r.order, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(r.upright, true);
  assert.ok(faces[0].slots.filter((s) => s.row === 0).every((s) => s.rot === 180));
  assert.ok(faces[0].slots.filter((s) => s.row === 1).every((s) => s.rot === 0));
});

test('切ってとじる: 1 枚に 2 ページずつ読む順', () => {
  assert.deepEqual(B.imposeCut(6).map((f) => f.slots.map((s) => s.page)), [[1, 2], [3, 4], [5, 6]]);
});

// ---------------- 中身 ----------------
test('迷路: どの年齢・ミニブックでも完全迷路（すべてつながり、道はひとつ）', () => {
  for (const age of AGES) for (const mini of [false, true]) for (const seed of SEEDS) {
    const m = B.genMaze(age, mini, seed, 0);
    const L = (mini ? B.LEVELS.mazeMini : B.LEVELS.maze)[age];
    assert.equal(m.cols, L.cols); assert.equal(m.rows, L.rows);
    const s = C.mazeStats(m);
    assert.equal(s.reachable, s.cells);
    assert.equal(s.passages, s.cells - 1);
    assert.ok(m.path.length > 0);
  }
});

test('てんつなぎ: 角の点を残して点を足す。番号どうし・番号とほかの点が重ならない', () => {
  const levels = [['a5', B.LEVELS.dots, 1], ['mini', B.LEVELS.dotsMini, 1.5]];
  for (const fig of B.FIGURES) for (const [lay, L, k] of levels) for (const age of AGES) {
    const n = Math.max(fig.pts.length, L[age]);
    const pts = B.resample(fig.pts, n);
    assert.equal(pts.length, n);
    fig.pts.forEach((p) => assert.ok(pts.some((q) => q[0] === p[0] && q[1] === p[1]), `${fig.key}: 角の点を残す`));
    // pages.js と同じ大きさ（A5 の枠 124.5mm に 108 の座標）で測る
    const sc = 124.5 / 108, fs = (n > 30 ? 2.7 : n > 18 ? 3.2 : 3.8) * k / sc;
    const labs = pts.map((p, i) => B.labelPos(pts, i, 4.2 * k / sc));
    const mm = lay === 'mini' ? 0.5 : 1;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const where = `${fig.key} ${lay} ${age} ${i + 1}/${j + 1}`;
      assert.ok(Math.hypot(labs[i][0] - labs[j][0], labs[i][1] - labs[j][1]) >= fs * 1.0, where + ' 番号どうし');
      assert.ok(Math.hypot(labs[i][0] - pts[j][0], labs[i][1] - pts[j][1]) >= fs * 0.9, where + ' 番号とほかの点');
      assert.ok(Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) * sc * mm >= 3.3, where + ' 点の間 3.3mm 以上');
    }
  }
});

test('てんつなぎ: 1 冊の中で同じ絵を重ねない（絵の数まで）', () => {
  const b = B.buildBook({ age: 'l', countsAuto: false, counts: { maze: 0, dots: 4, bingo: 0, words: 0, sudoku: 0, duo: 0, draw: 0 }, seed: 9 });
  const keys = b.pages.filter((p) => p.kind === 'dots').map((p) => p.dots.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('ビンゴ: 場面の言葉が 25 以上で重複なし、カードの言葉も重複なし、5×5 は真ん中がフリー', () => {
  for (const sc of SCENES) {
    assert.ok(B.BINGO_ITEMS[sc].length >= 25, sc);
    assert.equal(new Set(B.BINGO_ITEMS[sc]).size, B.BINGO_ITEMS[sc].length, sc);
  }
  for (const age of AGES) for (const sc of SCENES) for (const seed of SEEDS) {
    const b = B.genBingo(age, false, sc, seed, 0);
    assert.equal(b.cells.length, b.n * b.n);
    const t = b.cells.filter((c) => !c.free).map((c) => c.text);
    assert.equal(new Set(t).size, t.length);
    if (b.n === 5) assert.ok(b.cells[12].free);
  }
});

test('ことばさがし: 言葉はすべて入り、決めた向きに 1 か所だけ。ます目はすべてひらがな', () => {
  const V = { r: [1, 0], d: [0, 1], x: [1, 1] };
  for (const age of AGES) for (const mini of [false, true]) for (const sc of SCENES) for (const seed of SEEDS) {
    const w = B.genWords(age, mini, sc, seed, 0);
    const L = (mini ? B.LEVELS.wordsMini : B.LEVELS.words)[age];
    assert.equal(w.words.length, L.n);
    assert.equal(w.grid.length, L.size * L.size);
    w.grid.forEach((ch) => assert.match(ch, /^[ぁ-ゖ]$/));
    w.words.forEach((p) => {
      assert.ok(L.dirs.includes(p.dir));
      const chars = Array.from(p.word), v = V[p.dir];
      const x0 = p.cells[0] % w.size, y0 = Math.floor(p.cells[0] / w.size);
      chars.forEach((ch, k) => {
        assert.equal(p.cells[k], (y0 + v[1] * k) * w.size + x0 + v[0] * k);
        assert.equal(w.grid[p.cells[k]], ch);
      });
      assert.equal(B.countWord(w.grid, w.size, p.word, L.dirs), 1, `${p.word} は 1 か所だけ`);
    });
  }
  for (const sc of SCENES) B.WORDS[sc].forEach((wd) => assert.match(wd, /^[ぁ-ゖ]+$/));
});

test('すうじパズル: 答えはひとつだけ、答えはきまりを満たし、問題の数字は答えと同じ', () => {
  for (const age of ['l', 'u']) for (const mini of [false, true]) for (const seed of SEEDS) {
    const s = B.genSudoku(age, mini, seed, 0);
    const L = (mini ? B.LEVELS.sudokuMini : B.LEVELS.sudoku)[age];
    assert.equal(s.n, L.n);
    assert.equal(B.countSolutions(s.puzzle, s.n, 2), 1);
    s.solution.forEach((v, i) => {
      const g = s.solution.slice(); g[i] = 0;
      assert.ok(B.canPlace(g, s.n, i, v));
    });
    s.puzzle.forEach((v, i) => { if (v) assert.equal(v, s.solution[i]); });
    assert.ok(s.puzzle.filter((v) => v).length >= L.givens);
  }
});

// ---------------- 共有と絵 ----------------
test('共有リンク: 往復で同じ冊子。名前は既定で入れない', () => {
  const st = { age: 'u', layout: 'mini', scene: 'wait', seed: 123456789, name: 'はなこ', title: '<b>たび</b>', answers: false, flip: 'long', credit: false };
  const back = B.decodeShare('#s=' + B.encodeShare(st, false));
  assert.equal(back.name, '');
  assert.equal(back.title, '<b>たび</b>');
  assert.equal(JSON.stringify(B.buildBook(back).pages), JSON.stringify(B.buildBook(Object.assign({}, st, { name: '' })).pages));
  assert.equal(B.decodeShare('#s=' + B.encodeShare(st, true)).name, 'はなこ');
  const custom = { countsAuto: false, counts: { maze: 3, dots: 0, bingo: 2, words: 1, sudoku: 1, duo: 0, draw: 1 }, seed: 7 };
  assert.deepEqual(B.decodeShare('#s=' + B.encodeShare(custom)).counts, custom.counts);
  assert.equal(B.decodeShare('#s=!!'), null);
  assert.equal(B.decodeShare('#x=1'), null);
});

test('絵: すべてのページの SVG に NaN・undefined が無く、名前と題はエスケープされる', () => {
  for (const age of AGES) for (const layout of LAYOUTS) for (const scene of SCENES) {
    const b = B.buildBook({ age, layout, scene, seed: 99, name: '<x>&', title: '"題"<i>' });
    b.pages.forEach((p) => {
      const svg = P.pageSvg(b, p);
      assert.ok(!/NaN|undefined/.test(svg), `${age} ${layout} ${p.kind}`);
      assert.ok(!svg.includes('<x>') && !svg.includes('<i>'));
    });
    const html = P.sheetsHtml(b);
    const nums = [...html.matchAll(/data-page="(\d+)"/g)].map((m) => Number(m[1])).sort((a, b) => a - b);
    assert.deepEqual(nums, b.pages.map((p) => p.no), '紙の上にどのページも 1 回ずつ');
  }
});

test('絵: うら表紙のクレジットは外せる', () => {
  const on = B.buildBook({ seed: 1 }), off = B.buildBook({ seed: 1, credit: false });
  assert.ok(P.pageSvg(on, on.pages[on.pages.length - 1]).includes('yorozu-craft.com/gakushu-print/print/'));
  assert.ok(!P.pageSvg(off, off.pages[off.pages.length - 1]).includes('yorozu-craft.com'));
});
