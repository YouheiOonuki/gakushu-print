// ===========================
// おでかけ冊子 — 中身を作るロジックと面付け（画面から切り離した純粋関数）
// DOM や localStorage に触らない。tests/booklet.test.js から node --test で確かめる
// ブラウザでは window.Book、Node（テスト）では module.exports で使う
//
// 乱数・迷路・共有リンクの符号化・バックアップは ../calc.js（学習プリントメーカー）のものを使う。
// 同じ種（seed）と同じ設定からは、いつでも同じ冊子ができる。
// ===========================
(function (root) {
  'use strict';

  var C = root.Calc || (typeof require !== 'undefined' ? require('../calc.js') : null);

  // ---------------------------------------------------------------
  // 設定の選択肢
  // ---------------------------------------------------------------
  var AGES = {
    y: { label: '4〜6さい' },
    l: { label: '小学1〜2年' },
    u: { label: '小学3年〜' },
  };
  var AGE_KEYS = Object.keys(AGES);

  // 作り方（面付け）。a5 = A4 両面に A5 を 2 面ずつ、半分に折って中とじ。mini = A4 片面 1 枚に 8 面（切り込み 1 本で折る）。
  // cut = A4 片面に A5 を 2 面ずつ、半分に切って左をとじる（両面印刷ができないとき）
  var LAYOUTS = {
    a5: { label: 'A5 の冊子（両面印刷）', pageW: 148.5, pageH: 210 },
    mini: { label: 'ミニブック（A4 1 枚・片面）', pageW: 74.25, pageH: 105 },
    cut: { label: '切ってとじる（片面）', pageW: 148.5, pageH: 210 },
  };
  var LAYOUT_KEYS = Object.keys(LAYOUTS);

  var SCENES = {
    train: { label: 'でんしゃ・しんかんせん', title: 'でんしゃの おでかけブック' },
    car: { label: 'くるま・バス', title: 'ドライブの おでかけブック' },
    wait: { label: 'びょういん・まちじかん', title: 'まちじかんの あそびブック' },
  };
  var SCENE_KEYS = Object.keys(SCENES);

  // 中身のページの種類（表紙・答え・うら表紙は別）
  var KINDS = ['maze', 'dots', 'bingo', 'words', 'sudoku', 'duo', 'draw'];
  var KIND_NAMES = {
    maze: 'めいろ', dots: 'てんつなぎ', bingo: 'みつけたら ビンゴ', words: 'ことばさがし',
    sudoku: 'すうじパズル', duo: 'ふたりで あそぼう', draw: 'おえかき・にっき',
  };
  var MAX_PER_KIND = 4;
  var MAX_A5_PAGES = 24;   // A4 6 枚（折って重ねても中とじのホチキスが通る厚さ）
  var MAX_CUT_PAGES = 24;

  // 年齢ごとの既定のページ数（A5・切ってとじる）。すうじパズルは 4〜6さい には出さない
  var DEFAULT_COUNTS = {
    y: { maze: 2, dots: 2, bingo: 1, words: 1, sudoku: 0, duo: 1, draw: 1 },
    l: { maze: 2, dots: 2, bingo: 1, words: 1, sudoku: 1, duo: 1, draw: 1 },
    u: { maze: 2, dots: 1, bingo: 1, words: 1, sudoku: 2, duo: 1, draw: 1 },
  };

  // 年齢ごとのむずかしさ。mini はミニブック（A7。1 面が A5 の半分）の値
  var LEVELS = {
    maze:   { y: { cols: 6, rows: 8, newest: 1 }, l: { cols: 9, rows: 12, newest: 0.8 }, u: { cols: 13, rows: 17, newest: 0.6 } },
    mazeMini: { y: { cols: 5, rows: 6, newest: 1 }, l: { cols: 6, rows: 8, newest: 0.85 }, u: { cols: 8, rows: 10, newest: 0.7 } },
    dots:   { y: 12, l: 24, u: 40 },
    dotsMini: { y: 10, l: 16, u: 22 },
    bingo:  { y: 3, l: 4, u: 5 },
    bingoMini: { y: 3, l: 3, u: 3 },
    words:  { y: { size: 5, n: 3, dirs: 'r' }, l: { size: 7, n: 5, dirs: 'rd' }, u: { size: 9, n: 7, dirs: 'rdx' } },
    wordsMini: { y: { size: 4, n: 2, dirs: 'r' }, l: { size: 5, n: 3, dirs: 'rd' }, u: { size: 6, n: 4, dirs: 'rd' } },
    sudoku: { l: { n: 4, givens: 8 }, u: { n: 6, givens: 16 } },
    sudokuMini: { l: { n: 4, givens: 8 }, u: { n: 4, givens: 6 } },
  };

  // ---------------------------------------------------------------
  // 内容物（このツールで書いたもの。ほかのサイトから写していない）
  // ---------------------------------------------------------------
  // ビンゴ: 窓の外・まわりで「見つけたら ○」。見つかりやすさは場所で変わるので、遊びとして
  var BINGO_ITEMS = {
    train: ['トンネル', 'てっきょう', 'かわ', 'やま', 'たんぼ', 'はたけ', 'ふみきり', 'えき', 'しんごう', 'はし',
      'あかい くるま', 'しろい くるま', 'トラック', 'バス', 'ひこうき', 'とり', 'いぬ', 'ほかの でんしゃ', 'がっこう',
      'こうえん', 'たかい ビル', 'くも', 'じてんしゃ', 'かさ', 'いけ', 'もり', 'でんちゅう', 'かんばん', 'ぼうしの ひと', 'しゃしょうさん'],
    car: ['しんごう', 'ほどうきょう', 'トンネル', 'はし', 'バス', 'トラック', 'タクシー', 'パトカー', 'バイク', 'じてんしゃ',
      'あかい くるま', 'あおい くるま', 'しろい くるま', 'くろい くるま', 'きいろい くるま', 'とまれ の ひょうしき',
      'ガソリンスタンド', 'コンビニ', 'こうじちゅう', 'いぬの さんぽ', 'やま', 'かわ', 'でんしゃ', 'ふみきり', 'くも',
      'かんばん', 'がっこう', 'こうえん', 'ナンバーに 8', 'おなじ いろの くるま 2だい'],
    wait: ['とけい', 'まど', 'いす', 'ドア', 'えほん', 'テレビ', 'エレベーター', 'かいだん', 'うえきばち', 'ポスター',
      'めがねの ひと', 'あかい ふく', 'あおい ふく', 'カレンダー', 'でんわ', 'ティッシュ', 'しろい ふくの ひと',
      'ばんごうの がめん', 'じはんき', 'つくえ', 'でんき', 'かさ', 'かばん', 'ぼうし', 'ほん', 'くつ', 'ごみばこ',
      'せっけん', 'かがみ', 'ボールペン'],
  };

  // ことばさがし: ひらがなだけの言葉（小さい字もそのまま 1 ます）
  var WORDS = {
    train: ['でんしゃ', 'えき', 'きっぷ', 'せんろ', 'ふみきり', 'しんかんせん', 'てっきょう', 'うんてんし', 'しゃしょう',
      'まど', 'いす', 'えきべん', 'のりかえ', 'かいさつ', 'しんごう', 'たび', 'やま', 'うみ'],
    car: ['くるま', 'みち', 'はし', 'しんごう', 'うんてん', 'きゅうけい', 'どうろ', 'ちず', 'こうそく', 'やま', 'かわ',
      'みずうみ', 'くも', 'そら', 'たび', 'まど', 'おべんとう', 'ばす'],
    wait: ['とけい', 'ほん', 'いす', 'まど', 'ねこ', 'いぬ', 'うさぎ', 'きりん', 'ぞう', 'りんご', 'みかん', 'いちご',
      'さくら', 'ひまわり', 'くすり', 'おかあさん', 'おとうさん', 'えほん'],
  };
  var FILL_KANA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだでどばびぶべぼぱぴぷぺぽ';

  // てんつなぎの絵（0〜100 の枠。y は下向き）。1 本の閉じた線で、最後の点から 1 に戻る。deco は最初から描いておく部分
  // 形はこのツールで作った単純な図形（ほかの教材の絵は使っていない）
  function starPts() {
    var out = [];
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 19 : 46;
      out.push([50 + r * Math.cos(a), 54 + r * Math.sin(a)]);
    }
    return out;
  }
  var FIGURES = [
    { key: 'star', name: 'ほし', pts: starPts(), deco: [] },
    { key: 'heart', name: 'ハート', pts: [[50, 26], [62, 12], [76, 8], [90, 14], [96, 28], [92, 44], [80, 60], [66, 74], [50, 90], [34, 74], [20, 60], [8, 44], [4, 28], [10, 14], [24, 8], [38, 12]], deco: [] },
    { key: 'fish', name: 'さかな', pts: [[95, 50], [85, 35], [70, 27], [52, 25], [36, 32], [26, 42], [6, 22], [6, 78], [26, 58], [36, 68], [52, 75], [70, 73], [85, 65]],
      deco: [{ c: [80, 44, 3] }, { l: [[64, 30], [60, 50], [64, 70]] }] },
    { key: 'house', name: 'いえ', pts: [[15, 95], [15, 52], [5, 52], [50, 12], [66, 26], [66, 12], [78, 12], [78, 37], [95, 52], [85, 52], [85, 95], [60, 95], [60, 68], [42, 68], [42, 95]],
      deco: [{ r: [22, 58, 14, 12] }, { r: [66, 58, 13, 12] }] },
    { key: 'yacht', name: 'ヨット', pts: [[50, 6], [84, 56], [94, 64], [80, 86], [22, 86], [8, 64], [16, 56]],
      deco: [{ l: [[50, 6], [50, 64]] }, { l: [[8, 64], [94, 64]] }, { l: [[4, 96], [20, 92], [36, 96], [52, 92], [68, 96], [84, 92], [98, 96]] }] },
    { key: 'rocket', name: 'ロケット', pts: [[50, 4], [63, 20], [66, 40], [66, 66], [82, 82], [82, 95], [64, 86], [36, 86], [18, 95], [18, 82], [34, 66], [34, 40], [37, 20]],
      deco: [{ c: [50, 42, 7] }] },
    { key: 'tree', name: 'き', pts: [[50, 4], [66, 26], [58, 26], [76, 48], [66, 48], [88, 72], [56, 72], [56, 94], [44, 94], [44, 72], [12, 72], [34, 48], [24, 48], [42, 26], [34, 26]],
      deco: [] },
    { key: 'cat', name: 'ねこ', pts: [[20, 10], [36, 30], [64, 30], [80, 10], [84, 40], [88, 58], [80, 78], [64, 90], [50, 93], [36, 90], [20, 78], [12, 58], [16, 40]],
      deco: [{ c: [37, 55, 4] }, { c: [63, 55, 4] }, { l: [[46, 68], [50, 72], [54, 68]] }, { l: [[32, 68], [20, 66]] }, { l: [[32, 72], [20, 75]] }, { l: [[68, 68], [80, 66]] }, { l: [[68, 72], [80, 75]] }] },
    { key: 'butterfly', name: 'ちょうちょ', pts: [[50, 30], [60, 22], [80, 8], [94, 18], [92, 40], [72, 52], [88, 64], [86, 86], [68, 90], [54, 70], [50, 80], [46, 70], [32, 90], [14, 86], [12, 64], [28, 52], [8, 40], [6, 18], [20, 8], [40, 22]],
      deco: [{ l: [[48, 30], [42, 14]] }, { l: [[52, 30], [58, 14]] }] },
    { key: 'car', name: 'くるま', pts: [[6, 72], [6, 54], [20, 50], [32, 30], [68, 30], [80, 50], [94, 54], [94, 72], [82, 72], [78, 64], [64, 64], [60, 72], [40, 72], [36, 64], [22, 64], [18, 72]],
      deco: [{ c: [71, 73, 6.5] }, { c: [29, 73, 6.5] }, { l: [[50, 32], [50, 50]] }, { l: [[26, 50], [76, 50]] }] },
    { key: 'train', name: 'しんかんせん', pts: [[6, 72], [6, 40], [60, 40], [78, 44], [92, 56], [96, 68], [90, 72]],
      deco: [{ c: [72, 76, 4] }, { c: [58, 76, 4] }, { c: [34, 76, 4] }, { c: [20, 76, 4] }, { r: [12, 46, 8, 7] }, { r: [26, 46, 8, 7] }, { r: [40, 46, 8, 7] }, { r: [54, 46, 8, 7] }, { l: [[0, 80], [100, 80]] }] },
    { key: 'umbrella', name: 'かさ', pts: [[50, 10], [72, 16], [88, 30], [96, 50], [73, 44], [50, 50], [27, 44], [4, 50], [12, 30], [28, 16]],
      deco: [{ l: [[50, 50], [50, 86], [46, 92], [40, 90], [38, 84]] }] },
  ];

  // ---------------------------------------------------------------
  // 小さな道具
  // ---------------------------------------------------------------
  function intIn(v, lo, hi, def) {
    var n = Number(v);
    if (v === null || v === undefined || v === '' || !isFinite(n)) return def;
    n = Math.round(n);
    return Math.min(hi, Math.max(lo, n));
  }
  function oneOf(v, list, def) { return list.indexOf(v) >= 0 ? v : def; }
  function str(v, max) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max) : ''; }

  // ---------------------------------------------------------------
  // 迷路（calc.js の完全迷路をそのまま使い、大きさだけ冊子に合わせる）
  // ---------------------------------------------------------------
  function genMaze(age, mini, seed, index) {
    var L = (mini ? LEVELS.mazeMini : LEVELS.maze)[age];
    var best = null;
    for (var attempt = 0; attempt < 20; attempt++) {
      var m = C.carveMaze(L.cols, L.rows, L.newest, C.makeRng(seed, 7100 + index * 37 + attempt));
      m.path = C.solveMaze(m);
      if (!best || m.path.length > best.path.length) best = m;
      if (m.path.length >= (L.cols + L.rows) * 1.5) break;
    }
    return best;
  }

  // ---------------------------------------------------------------
  // てんつなぎ: 角の点は必ず残し、長い辺から点を足して n 個にする
  // ---------------------------------------------------------------
  function resample(pts, n) {
    var k = pts.length;
    if (n <= k) return pts.map(function (p) { return [p[0], p[1]]; });
    var lens = pts.map(function (p, i) { var q = pts[(i + 1) % k]; return Math.hypot(q[0] - p[0], q[1] - p[1]); });
    // いちばん長い区切りに 1 つずつ足す（点の間がなるべく等しく、広くなる）
    var add = lens.map(function () { return 0; });
    for (var e = 0; e < n - k; e++) {
      var best = 0;
      for (var i = 1; i < k; i++) if (lens[i] / (add[i] + 1) > lens[best] / (add[best] + 1)) best = i;
      add[best]++;
    }
    var out = [];
    pts.forEach(function (p, i) {
      var q = pts[(i + 1) % k];
      out.push([p[0], p[1]]);
      for (var j = 1; j <= add[i]; j++) {
        var t = j / (add[i] + 1);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    });
    return out;
  }

  /** 番号の位置: 点から、図形の外側（重心と反対）へ少しずらす */
  function labelPos(pts, i, dist) {
    var cx = 0, cy = 0;
    pts.forEach(function (p) { cx += p[0]; cy += p[1]; });
    cx /= pts.length; cy /= pts.length;
    var p = pts[i], prev = pts[(i - 1 + pts.length) % pts.length], next = pts[(i + 1) % pts.length];
    // 辺の外向きの法線の平均（向きは重心の反対側にそろえる）
    var nx = 0, ny = 0;
    [[prev, p], [p, next]].forEach(function (e) {
      var dx = e[1][0] - e[0][0], dy = e[1][1] - e[0][1], l = Math.hypot(dx, dy) || 1;
      nx += -dy / l; ny += dx / l;
    });
    var l = Math.hypot(nx, ny);
    if (l < 1e-6) { nx = p[0] - cx; ny = p[1] - cy; l = Math.hypot(nx, ny) || 1; }
    nx /= l; ny /= l;
    if (nx * (p[0] - cx) + ny * (p[1] - cy) < 0) { nx = -nx; ny = -ny; }
    return [p[0] + nx * dist, p[1] + ny * dist];
  }

  function genDots(age, mini, seed, index, used) {
    var rng = C.makeRng(seed, 7300 + index * 41);
    var pool = FIGURES.filter(function (f) { return !used || used.indexOf(f.key) < 0; });
    if (!pool.length) pool = FIGURES;
    var fig = rng.pick(pool);
    var n = Math.max(fig.pts.length, (mini ? LEVELS.dotsMini : LEVELS.dots)[age]);
    var pts = resample(fig.pts, n);
    return { key: fig.key, name: fig.name, pts: pts, deco: fig.deco };
  }

  // ---------------------------------------------------------------
  // ビンゴ（見つけたら ○）。5×5 は真ん中が「フリー」
  // ---------------------------------------------------------------
  function genBingo(age, mini, scene, seed, index) {
    var n = (mini ? LEVELS.bingoMini : LEVELS.bingo)[age];
    var rng = C.makeRng(seed, 7500 + index * 43);
    var items = rng.shuffle(BINGO_ITEMS[scene]).slice(0, n * n);
    var cells = [];
    for (var i = 0; i < n * n; i++) cells.push(n === 5 && i === 12 ? { free: true, text: 'フリー' } : { text: items[i] });
    return { n: n, cells: cells };
  }

  // ---------------------------------------------------------------
  // ことばさがし: 言葉をます目に入れ、残りをひらがなでうめる
  // dirs: r = 右へ、d = 下へ、x = 右下へ（さかさまには入れない）
  // ---------------------------------------------------------------
  var DIR_VEC = { r: [1, 0], d: [0, 1], x: [1, 1] };
  function genWords(age, mini, scene, seed, index) {
    var L = (mini ? LEVELS.wordsMini : LEVELS.words)[age];
    var size = L.size;
    for (var attempt = 0; attempt < 60; attempt++) {
      var rng = C.makeRng(seed, 7700 + index * 47 + attempt * 1009);
      var cand = rng.shuffle(WORDS[scene].filter(function (w) { return Array.from(w).length <= size && Array.from(w).length >= 2; }));
      var grid = [];
      for (var i = 0; i < size * size; i++) grid.push('');
      var placed = [];
      for (var w = 0; w < cand.length && placed.length < L.n; w++) {
        var chars = Array.from(cand[w]);
        var opts = [];
        Array.from(L.dirs).forEach(function (d) {
          var v = DIR_VEC[d];
          for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
            var ex = x + v[0] * (chars.length - 1), ey = y + v[1] * (chars.length - 1);
            if (ex >= size || ey >= size) continue;
            var ok = true, overlap = 0;
            for (var k = 0; k < chars.length; k++) {
              var g = grid[(y + v[1] * k) * size + x + v[0] * k];
              if (g && g !== chars[k]) { ok = false; break; }
              if (g) overlap++;
            }
            if (ok && overlap < chars.length) opts.push({ x: x, y: y, d: d });
          }
        });
        if (!opts.length) continue;
        var o = rng.pick(opts), vv = DIR_VEC[o.d], cells = [];
        chars.forEach(function (ch, k) {
          var idx = (o.y + vv[1] * k) * size + o.x + vv[0] * k;
          grid[idx] = ch; cells.push(idx);
        });
        placed.push({ word: cand[w], cells: cells, dir: o.d });
      }
      if (placed.length < L.n) continue;
      var fill = Array.from(FILL_KANA);
      for (var j = 0; j < grid.length; j++) if (!grid[j]) grid[j] = rng.pick(fill);
      // 言葉がほかの場所にも偶然できていたら作り直す（答えがひとつになるように）
      if (placed.every(function (p) { return countWord(grid, size, p.word, L.dirs) === 1; })) {
        return { size: size, grid: grid, words: placed, dirs: L.dirs };
      }
    }
    throw new Error('words: 作れませんでした');
  }
  function countWord(grid, size, word, dirs) {
    var chars = Array.from(word), n = 0;
    Array.from(dirs).forEach(function (d) {
      var v = DIR_VEC[d];
      for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
        var ex = x + v[0] * (chars.length - 1), ey = y + v[1] * (chars.length - 1);
        if (ex >= size || ey >= size) continue;
        var ok = true;
        for (var k = 0; k < chars.length && ok; k++) ok = grid[(y + v[1] * k) * size + x + v[0] * k] === chars[k];
        if (ok) n++;
      }
    });
    return n;
  }

  // ---------------------------------------------------------------
  // すうじパズル（4×4 は 2×2 の箱、6×6 は 2 行×3 列の箱）。答えがひとつだけになるまで数字を消す
  // ---------------------------------------------------------------
  function boxOf(n) { return n === 4 ? { h: 2, w: 2 } : { h: 2, w: 3 }; }
  function canPlace(g, n, i, v) {
    var r = Math.floor(i / n), c = i % n, b = boxOf(n);
    for (var k = 0; k < n; k++) {
      if (g[r * n + k] === v || g[k * n + c] === v) return false;
    }
    var br = r - r % b.h, bc = c - c % b.w;
    for (var y = br; y < br + b.h; y++) for (var x = bc; x < bc + b.w; x++) if (g[y * n + x] === v) return false;
    return true;
  }
  /** 解の数を limit まで数える */
  function countSolutions(g, n, limit) {
    g = g.slice();
    var count = 0;
    (function rec() {
      if (count >= limit) return;
      var i = g.indexOf(0);
      if (i < 0) { count++; return; }
      for (var v = 1; v <= n; v++) {
        if (canPlace(g, n, i, v)) { g[i] = v; rec(); g[i] = 0; if (count >= limit) return; }
      }
    })();
    return count;
  }
  function genSudoku(age, mini, seed, index) {
    var L = (mini ? LEVELS.sudokuMini : LEVELS.sudoku)[age === 'y' ? 'l' : age];
    var n = L.n, rng = C.makeRng(seed, 7900 + index * 53);
    var g = [];
    for (var i = 0; i < n * n; i++) g.push(0);
    (function fill(i) {
      if (i === n * n) return true;
      var vals = rng.shuffle(Array.from({ length: n }, function (_, k) { return k + 1; }));
      for (var j = 0; j < vals.length; j++) {
        if (canPlace(g, n, i, vals[j])) { g[i] = vals[j]; if (fill(i + 1)) return true; g[i] = 0; }
      }
      return false;
    })(0);
    var solution = g.slice(), puzzle = g.slice(), givens = n * n;
    rng.shuffle(Array.from({ length: n * n }, function (_, k) { return k; })).forEach(function (i) {
      if (givens <= L.givens) return;
      var keep = puzzle[i];
      puzzle[i] = 0;
      if (countSolutions(puzzle, n, 2) !== 1) puzzle[i] = keep; else givens--;
    });
    return { n: n, box: boxOf(n), puzzle: puzzle, solution: solution };
  }

  // ---------------------------------------------------------------
  // 状態（設定）の正規化
  // ---------------------------------------------------------------
  function newSeed(rand) { return Math.floor((rand || Math.random)() * 4294967296) >>> 0; }

  function defaults() {
    return { age: 'l', layout: 'a5', scene: 'train', counts: Object.assign({}, DEFAULT_COUNTS.l), countsAuto: true,
      answers: true, name: '', title: '', flip: 'short', credit: true, seed: 1 };
  }

  function normalize(v) {
    var o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    var d = defaults();
    var s = {
      age: oneOf(o.age, AGE_KEYS, d.age),
      layout: oneOf(o.layout, LAYOUT_KEYS, d.layout),
      scene: oneOf(o.scene, SCENE_KEYS, d.scene),
      countsAuto: o.countsAuto === undefined ? true : !!o.countsAuto,
      answers: o.answers === undefined ? d.answers : !!o.answers,
      name: str(o.name, 20),
      title: str(o.title, 24),
      flip: oneOf(o.flip, ['short', 'long'], d.flip),
      credit: o.credit === undefined ? d.credit : !!o.credit,
      seed: intIn(o.seed, 0, 4294967295, d.seed),
    };
    var base = DEFAULT_COUNTS[s.age];
    var c = o.counts && typeof o.counts === 'object' ? o.counts : {};
    s.counts = {};
    KINDS.forEach(function (k) {
      s.counts[k] = s.countsAuto ? base[k] : intIn(c[k], 0, MAX_PER_KIND, base[k]);
    });
    if (s.age === 'y') s.counts.sudoku = 0;
    return s;
  }

  // ---------------------------------------------------------------
  // 冊子のページの並び（読む順）を作る
  // ---------------------------------------------------------------
  /**
   * @returns {{pages: object[], notes: string[]}} pages は読む順。各ページは { kind, ... }。
   *   kind: cover / maze / dots / bingo / words / sudoku / duo / draw / free（ページ数をそろえるための おえかき）/ answers / back
   */
  function buildBook(state) {
    var s = normalize(state);
    var mini = s.layout === 'mini';
    var notes = [];
    var content = [];
    if (mini) {
      content = s.age === 'y' ? ['maze', 'dots', 'bingo', 'duo', 'draw'] : ['maze', 'dots', 'bingo', 'words', 'sudoku'];
    } else {
      var max = s.layout === 'a5' ? MAX_A5_PAGES : MAX_CUT_PAGES;
      if (bookLength(s.counts, s.answers, s.layout) > max) {
        s.counts = fitCounts(s.counts, s.answers, s.layout, max);
        notes.push('ページが多すぎるので、' + max + ' ページに収まるように減らしました。');
      }
      KINDS.forEach(function (k) { for (var i = 0; i < s.counts[k]; i++) content.push(k); });
      if (!content.length) { content = ['draw']; notes.push('中身のページが 0 なので、おえかきのページを 1 つ入れました。'); }
    }
    var idx = {}, usedFigs = [];
    var pages = [{ kind: 'cover' }];
    content.forEach(function (k) {
      var i = idx[k] = (idx[k] || 0);
      idx[k]++;
      var p = { kind: k, n: i };
      if (k === 'maze') p.maze = genMaze(s.age, mini, s.seed, i);
      if (k === 'dots') { p.dots = genDots(s.age, mini, s.seed, i, usedFigs); usedFigs.push(p.dots.key); }
      if (k === 'bingo') p.bingo = genBingo(s.age, mini, s.scene, s.seed, i);
      if (k === 'words') p.words = genWords(s.age, mini, s.scene, s.seed, i);
      if (k === 'sudoku') p.sudoku = genSudoku(s.age, mini, s.seed, i);
      if (k === 'duo') p.duo = { dots: s.age === 'y' ? 0 : (mini ? 4 : 6) };
      pages.push(p);
    });
    // 答え（めいろ・てんつなぎ・ことばさがし・すうじパズル）
    var ans = [];
    pages.forEach(function (p, i) { if (/^(maze|dots|words|sudoku)$/.test(p.kind)) ans.push({ page: i + 1, src: p }); });
    var per = mini ? 4 : 6, ansPages = [];
    if (mini) {
      // ミニブックは 7 ページ目が答え（1 ページに 4 つまで）。A5 は 1 ページに 6 つ（2 列×3 段）
      // 答えを入れないときは じゆうちょう にする
      ansPages.push(s.answers ? { kind: 'answers', items: ans.slice(0, per) } : { kind: 'free', n: 0 });
    } else if (s.answers && ans.length) {
      for (var a = 0; a < ans.length; a += per) ansPages.push({ kind: 'answers', items: ans.slice(a, a + per) });
    }
    var back = { kind: 'back' };
    if (mini) {
      pages = pages.concat(ansPages, [back]);
      if (pages.length !== 8) throw new Error('mini: 8 ページになっていません ' + pages.length);
    } else {
      var total = pages.length + ansPages.length + 1;
      var target = s.layout === 'a5' ? Math.ceil(total / 4) * 4 : Math.ceil(total / 2) * 2;
      var pad = target - total;
      for (var f = 0; f < pad; f++) pages.push({ kind: 'free', n: f });
      pages = pages.concat(ansPages, [back]);
    }
    pages.forEach(function (p, i) { p.no = i + 1; });
    return { state: s, pages: pages, notes: notes, mini: mini };
  }
  var ANSWER_KINDS = ['maze', 'dots', 'words', 'sudoku'];
  /** 表紙・中身・答え・うら表紙のページ数を、作り方の単位（A5 は 4、切ってとじるは 2）にそろえた数 */
  function bookLength(counts, answers, layout) {
    var content = 0, ans = 0;
    KINDS.forEach(function (k) { content += counts[k]; if (ANSWER_KINDS.indexOf(k) >= 0) ans += counts[k]; });
    var total = 2 + Math.max(1, content) + (answers ? Math.ceil(ans / 6) : 0);
    var unit = layout === 'a5' ? 4 : 2;
    return Math.ceil(total / unit) * unit;
  }
  /** 多すぎるときは、いちばん多い種類から 1 つずつ減らす（同じ数なら後ろの種類から） */
  function fitCounts(counts, answers, layout, max) {
    var c = Object.assign({}, counts);
    while (bookLength(c, answers, layout) > max) {
      var best = null;
      KINDS.forEach(function (k) { if (c[k] > 0 && (best === null || c[k] >= c[best])) best = k; });
      if (best === null) break;
      c[best]--;
    }
    return c;
  }

  // ---------------------------------------------------------------
  // 面付け（印刷する紙の上の並び）
  // ---------------------------------------------------------------
  /**
   * 中とじ（A4 よこ・両面・短辺とじ）: 紙 s 枚目（0 から）の
   *   表 = 左 N−2s ・ 右 2s+1、裏 = 左 2s+2 ・ 右 N−2s−1（ページは 1 から）
   * flip='long'（長辺とじしか選べないプリンター）のときは、裏の面を 180° 回して印刷する（向きと左右が入れかわる）
   * @returns {object[]} 印刷する面の並び。{ sheet, side, slots: [{page, x, y, rot}], rot }
   */
  function imposeA5(n, flip) {
    if (n % 4) throw new Error('中とじのページ数は 4 の倍数');
    var faces = [];
    for (var s = 0; s < n / 4; s++) {
      faces.push({ sheet: s, side: 'front', rot: 0, slots: [{ page: n - 2 * s, col: 0, row: 0, rot: 0 }, { page: 2 * s + 1, col: 1, row: 0, rot: 0 }] });
      faces.push({ sheet: s, side: 'back', rot: flip === 'long' ? 180 : 0, slots: [{ page: 2 * s + 2, col: 0, row: 0, rot: 0 }, { page: n - 2 * s - 1, col: 1, row: 0, rot: 0 }] });
    }
    return faces;
  }
  /** 切ってとじる（片面）: 1 枚に 2 ページずつ、読む順 */
  function imposeCut(n) {
    var faces = [];
    for (var s = 0; s < Math.ceil(n / 2); s++) {
      faces.push({ sheet: s, side: 'front', rot: 0, slots: [{ page: 2 * s + 1, col: 0, row: 0, rot: 0 }].concat(2 * s + 2 <= n ? [{ page: 2 * s + 2, col: 1, row: 0, rot: 0 }] : []) });
    }
    return faces;
  }
  /**
   * ミニブック（A4 よこ・片面 1 枚に 8 面。4 列×2 段）
   *   下の段（左から）: 6 7 8 1   上の段（左から、さかさま）: 5 4 3 2
   */
  var MINI_LAYOUT = { top: [5, 4, 3, 2], bottom: [6, 7, 8, 1] };
  function imposeMini() {
    var slots = [];
    MINI_LAYOUT.top.forEach(function (p, c) { slots.push({ page: p, col: c, row: 0, rot: 180 }); });
    MINI_LAYOUT.bottom.forEach(function (p, c) { slots.push({ page: p, col: c, row: 1, rot: 0 }); });
    return [{ sheet: 0, side: 'front', rot: 0, slots: slots }];
  }
  function impose(layout, n, flip) {
    if (layout === 'mini') return imposeMini();
    if (layout === 'cut') return imposeCut(n);
    return imposeA5(n, flip);
  }

  // ---------------------------------------------------------------
  // 折ったときに読む順（紙の上の見え方から、折って開く順をたどる）。テストと PDF の確かめで使う
  // 面付けの式とは別に、紙の動きから書いた。
  // ---------------------------------------------------------------
  /**
   * 中とじ: faces は紙ごとの { front: [左, 右], back: [左, 右] }（紙を左右に裏返して見たときの並び・向き）。
   *   各面の要素は { page, up }（up=false はさかさまに見える）。
   *   紙を重ねて（1 枚目が外側）真ん中で山折りにすると、読む順は
   *   外から内へ 各紙の 表の右 → 裏の左、内から外へ 各紙の 裏の右 → 表の左。
   * @returns {{order: number[], upright: boolean}}
   */
  function readSaddle(sheets) {
    var order = [], upright = true;
    var take = function (x) { order.push(x.page); if (!x.up) upright = false; };
    sheets.forEach(function (sh) { take(sh.front[1]); take(sh.back[0]); });
    sheets.slice().reverse().forEach(function (sh) { take(sh.back[1]); take(sh.front[0]); });
    return { order: order, upright: upright };
  }
  /**
   * 印刷の結果（faces）とプリンターのとじ方から、紙を左右に裏返したときの見え方を作る。
   * printer: 'short'（短辺とじ）なら裏はそのまま、'long'（長辺とじ）なら裏は上下さかさま（左右も入れかわる）に出る
   */
  function physicalSheets(faces, printer) {
    var sheets = [];
    faces.forEach(function (f) {
      var sh = sheets[f.sheet] = sheets[f.sheet] || {};
      var turned = (f.rot + (f.side === 'back' && printer === 'long' ? 180 : 0)) % 360 === 180;
      var row = f.slots.slice().sort(function (a, b) { return a.col - b.col; }).map(function (x) { return { page: x.page, up: !turned }; });
      if (turned) row.reverse();
      sh[f.side] = row;
    });
    return sheets;
  }
  /**
   * ミニブック: 横に半分に折る（上の段を裏へ）→ 真ん中の 2 面ぶんの折り目に切り込み → 縦に押して十字にし、たたむ。
   *   上の段は裏へ回るので、さかさまに印刷したものが正しい向きになる。
   *   たたんだ本の読む順: 下の段の右はし（表紙）→ その裏（上の段の右はし）→ 上の段を右から左へ → 下の段を左から右へ。
   * panels: { top: [{page, up}×4], bottom: [...] }（紙の上で見た並び。up はその面が紙の上で正立か）
   */
  function readMini(panels) {
    var order = [], upright = true;
    var take = function (x, needUp) { order.push(x.page); if (x.up !== needUp) upright = false; };
    take(panels.bottom[3], true);
    [3, 2, 1, 0].forEach(function (c) { take(panels.top[c], false); });
    [0, 1, 2].forEach(function (c) { take(panels.bottom[c], true); });
    return { order: order, upright: upright };
  }
  function miniPanels(faces) {
    var p = { top: [], bottom: [] };
    faces[0].slots.forEach(function (x) { (x.row === 0 ? p.top : p.bottom)[x.col] = { page: x.page, up: x.rot === 0 }; });
    return p;
  }

  // ---------------------------------------------------------------
  // 共有リンク（#s=）とバックアップ
  // ---------------------------------------------------------------
  var SHARE_MAX = 4000;
  function encodeShare(state, withName) {
    var s = normalize(state);
    var o = { v: 1, a: s.age, l: s.layout, c: s.scene, s: s.seed, ans: s.answers ? 1 : 0, f: s.flip, cr: s.credit ? 1 : 0, t: s.title };
    if (!s.countsAuto) o.k = KINDS.map(function (k) { return s.counts[k]; });
    if (withName && s.name) o.n = s.name;
    return C.b64uEncode(JSON.stringify(o));
  }
  function decodeShare(hash) {
    var m = /^#?s=([A-Za-z0-9_-]+)$/.exec(String(hash || '').trim());
    if (!m) return null;
    try {
      var p = JSON.parse(C.b64uDecode(m[1]));
      if (!p || p.v !== 1) return null;
      var counts = null;
      if (Array.isArray(p.k)) { counts = {}; KINDS.forEach(function (k, i) { counts[k] = p.k[i]; }); }
      return normalize({ age: p.a, layout: p.l, scene: p.c, seed: p.s, answers: p.ans !== 0, flip: p.f, credit: p.cr !== 0,
        title: p.t, name: p.n || '', countsAuto: !counts, counts: counts || undefined });
    } catch (e) { return null; }
  }

  var api = {
    AGES: AGES, LAYOUTS: LAYOUTS, SCENES: SCENES, KINDS: KINDS, KIND_NAMES: KIND_NAMES, LEVELS: LEVELS, DEFAULT_COUNTS: DEFAULT_COUNTS,
    BINGO_ITEMS: BINGO_ITEMS, WORDS: WORDS, FIGURES: FIGURES, MAX_PER_KIND: MAX_PER_KIND, MAX_A5_PAGES: MAX_A5_PAGES, SHARE_MAX: SHARE_MAX, MINI_LAYOUT: MINI_LAYOUT,
    genMaze: genMaze, genDots: genDots, resample: resample, labelPos: labelPos, genBingo: genBingo, genWords: genWords, countWord: countWord,
    genSudoku: genSudoku, countSolutions: countSolutions, canPlace: canPlace,
    newSeed: newSeed, defaults: defaults, normalize: normalize, buildBook: buildBook, bookLength: bookLength,
    impose: impose, imposeA5: imposeA5, imposeCut: imposeCut, imposeMini: imposeMini,
    readSaddle: readSaddle, physicalSheets: physicalSheets, readMini: readMini, miniPanels: miniPanels,
    encodeShare: encodeShare, decodeShare: decodeShare,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Book = api;
})(this);
