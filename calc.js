// ===========================
// 学習プリントメーカー — 問題を作るロジック（画面から切り離した純粋関数）
// DOM や localStorage に触らない。tests/*.test.js から node --test で確かめる
// ブラウザでは window.Calc、Node（テスト）では module.exports で使う
//
// 同じ「種（seed）」と同じ設定からは、いつでも同じ問題ができる（共有リンクで同じプリントを再現するため）。
// 乱数は Math.random を使わず、seed から作る。
// ===========================
(function (root) {
  'use strict';

  var TOOL = 'gakushu-print';
  // 文言（日本語・英語）は text.js。lang を省くと日本語
  var TX = root.TEXT || (typeof require !== 'undefined' ? require('./text.js') : null);
  function msg(lang) { return TX.calc[lang === 'en' ? 'en' : 'ja']; }
  // ローマ字のプリントだけが使う（romaji.js・romaji-words.js）。読み込んでいないページ（九九ゲームなど）でも動くよう、使うときに取る
  function romajiLib() { return root.Romaji || (typeof require !== 'undefined' ? require('./romaji.js') : null); }
  function romajiWords() { return root.RomajiWords || (typeof require !== 'undefined' ? require('./romaji-words.js') : null); }

  // ---------------------------------------------------------------
  // 乱数（seed つき）
  // ---------------------------------------------------------------

  /** mulberry32。0 以上 1 未満を返す関数を作る */
  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** seed と用途の番号（ページ番号など）を混ぜて、別の 32bit の種にする */
  function mixSeed(seed, salt) {
    var h = ((seed >>> 0) ^ Math.imul((salt | 0) + 1, 0x9E3779B1)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B);
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function makeRng(seed, salt) {
    var r = mulberry32(mixSeed(seed, salt || 0));
    return {
      next: r,
      /** lo 以上 hi 以下の整数 */
      int: function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); },
      pick: function (a) { return a[Math.floor(r() * a.length)]; },
      shuffle: function (a) {
        a = a.slice();
        for (var i = a.length - 1; i > 0; i--) {
          var j = Math.floor(r() * (i + 1));
          var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
      },
    };
  }

  /** 画面とプリントに出す「問題番号」（seed を 5 桁-5 桁で。口で伝えやすい形） */
  function seedLabel(seed) {
    var s = String(seed >>> 0).padStart(10, '0');
    return s.slice(0, 5) + '-' + s.slice(5);
  }

  // ---------------------------------------------------------------
  // 小さな道具
  // ---------------------------------------------------------------
  function intIn(v, lo, hi, def) {
    if (v === null || v === undefined || v === '') return def;
    var n = Number(v);
    if (!isFinite(n)) return def;
    n = Math.round(n);
    return n < lo ? lo : n > hi ? hi : n;
  }
  function oneOf(v, list, def) { return list.indexOf(v) >= 0 ? v : def; }
  function str(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }
  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }

  /** 全角の数字・記号を半角に。計算式・時刻の読み取りに使う */
  function toHalf(s) {
    return String(s)
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[＋]/g, '+')
      .replace(/[－−ー―‐–—]/g, '-')
      .replace(/[×✕＊*xXｘＸ]/g, '×')
      .replace(/[＝]/g, '=')
      .replace(/[：]/g, ':')
      .replace(/[（]/g, '(').replace(/[）]/g, ')')
      .replace(/[\s　]+/g, '');
  }

  // ---------------------------------------------------------------
  // たし算・ひき算
  // ---------------------------------------------------------------

  // 桁の組み合わせ。a が前の数、b が後ろの数の範囲。ひき算は a − b（a ≧ b）
  var ARITH_LEVELS = {
    d1:   { label: '1けた と 1けた', a: [1, 9], b: [1, 9] },
    teen: { label: '十いくつ と 1けた（11〜19）', a: [11, 19], b: [1, 9] },
    d2d1: { label: '2けた と 1けた', a: [10, 99], b: [1, 9] },
    d2d2: { label: '2けた と 2けた', a: [10, 99], b: [10, 99] },
    d3d2: { label: '3けた と 2けた', a: [100, 999], b: [10, 99] },
    d3d3: { label: '3けた と 3けた', a: [100, 999], b: [100, 999] },
  };
  var ARITH_LEVEL_KEYS = Object.keys(ARITH_LEVELS);

  /** たし算でくり上がりがあるか（どこかの位で和が 10 以上になる。5+5 も「あり」） */
  function hasCarry(a, b) {
    while (a > 0 || b > 0) {
      if ((a % 10) + (b % 10) >= 10) return true;
      a = Math.floor(a / 10); b = Math.floor(b / 10);
    }
    return false;
  }
  /** ひき算でくり下がりがあるか（どこかの位で上の数字が下の数字より小さい） */
  function hasBorrow(a, b) {
    while (b > 0) {
      if ((a % 10) < (b % 10)) return true;
      a = Math.floor(a / 10); b = Math.floor(b / 10);
    }
    return false;
  }
  function needsCarry(op, a, b) { return op === '+' ? hasCarry(a, b) : hasBorrow(a, b); }

  function answerOf(p) {
    return p.op === '+' ? p.a + p.b : p.op === '-' ? p.a - p.b : p.a * p.b;
  }

  /** この組み合わせで問題が作れるか（1けた−1けたの「くり下がりあり」は作れない） */
  function arithPossible(op, level, carry) {
    if (carry !== 'with' || op === 'add') return true;
    return level !== 'd1';   // ひき算・まぜる（のひき算）で d1 は a ≦ 9 なので、くり下がりは起きない
  }

  /** 1 問を作る。条件に合うまで引き直す（どの組み合わせも十分な割合で当たる） */
  function oneArith(rng, op, lv, carry) {
    for (var i = 0; i < 3000; i++) {
      var a = rng.int(lv.a[0], lv.a[1]);
      var b = rng.int(lv.b[0], lv.b[1]);
      if (op === '-' && a < b) continue;
      if (carry === 'none' && needsCarry(op, a, b)) continue;
      if (carry === 'with' && !needsCarry(op, a, b)) continue;
      return { a: a, b: b, op: op };
    }
    return null;
  }

  /**
   * たし算・ひき算の問題を必要な数だけ作る。
   * 同じページの中では同じ問題を出さない（組み合わせが足りる限り）。足りるときは、ページをまたいでも出さない
   * @param {object} o normalize 済みの設定（op / level / carry / count）
   * @param {number} seed
   * @param {number} total 作る数
   */
  function genArith(o, seed, total) {
    var rng = makeRng(seed, 101);
    var lv = ARITH_LEVELS[o.level];
    var perPage = o.count;
    var used = {}, onPage = {}, out = [];
    for (var n = 0; n < total; n++) {
      if (n % perPage === 0) onPage = {};
      var op = o.op === 'add' ? '+' : o.op === 'sub' ? '-' : (rng.next() < 0.5 ? '+' : '-');
      if (op === '-' && !arithPossible('sub', o.level, o.carry)) op = '+';
      var best = null;
      for (var tries = 0; tries < 80; tries++) {
        var p = oneArith(rng, op, lv, o.carry);
        if (!p) break;
        var k = p.a + p.op + p.b;
        if (!onPage[k] && !used[k]) { best = p; break; }
        if (!onPage[k] && !best) best = p;     // ページの中で重ならなければ、ひとまず候補にする
      }
      if (!best) best = oneArith(rng, op, lv, o.carry) || { a: 1, b: 1, op: '+' };
      var key = best.a + best.op + best.b;
      used[key] = onPage[key] = true;
      out.push(best);
    }
    return out;
  }

  /** 九九の問題。order: seq（段ごとに 1 から 9）/ rev（9 から 1）/ random（ばらばら。全部を一巡してから次） */
  function genKuku(o, seed, total) {
    var dans = o.dans.slice().sort(function (x, y) { return x - y; });
    if (o.order !== 'random') {
      var list = [];
      dans.forEach(function (d) {
        for (var i = 1; i <= 9; i++) list.push({ a: d, b: o.order === 'rev' ? 10 - i : i, op: '×' });
      });
      return list;
    }
    var rng = makeRng(seed, 202);
    var pool = [];
    dans.forEach(function (d) { for (var i = 1; i <= 9; i++) pool.push({ a: d, b: i, op: '×' }); });
    var out = [], bag = [];
    while (out.length < total) {
      if (!bag.length) bag = rng.shuffle(pool);
      var p = bag.pop();
      var prev = out[out.length - 1];
      if (prev && prev.a === p.a && prev.b === p.b && bag.length) { bag.unshift(p); continue; }  // 同じ問題を続けない
      out.push(p);
    }
    return out;
  }

  /**
   * 「入れたい問題」を読む（1 行に 1 問。7+8、１５－９、6×7 など。(1) などの番号と「=」から後ろは無視する）
   * @param {string} text
   * @param {{ops: string[], maxA: number, maxB: number, kuku?: boolean, opsLabel: string}} rule
   * @returns {{items: {a:number,b:number,op:string}[], errors: {line:number, text:string, reason:string}[]}}
   */
  function parseArithLines(text, rule) {
    var items = [], errors = [];
    String(text || '').split(/\r?\n/).slice(0, 200).forEach(function (raw, i) {
      var line = raw.trim();
      if (!line) return;
      var s = toHalf(line).replace(/^\(\d{1,3}\)|^\d{1,3}[.)、]|^[①-⑳]/, '').replace(/=.*$/, '');
      var err = function (reason) { errors.push({ line: i + 1, text: line.slice(0, 30), reason: reason }); };
      var m = /^(\d{1,4})([+\-×])(\d{1,4})$/.exec(s);
      if (!m) {
        if (/÷|\//.test(s)) return err('わり算は入れられません');
        return err('式として読めません（例: 7+8、15-9、6×7）');
      }
      var a = Number(m[1]), op = m[2], b = Number(m[3]);
      if (rule.ops.indexOf(op) < 0) return err('このプリントは' + rule.opsLabel + 'です');
      if (rule.kuku) {
        if (a < 1 || a > 9 || b < 1 || b > 9) return err('九九の範囲（1〜9 どうし）ではありません');
      } else if (op === '-') {
        if (a < b) return err('答えがマイナスになります');
        if (a > rule.maxA || b > rule.maxB) return err('数が大きすぎます（この設定では ' + rule.maxA + ' − ' + rule.maxB + ' まで）');
      } else {
        var hi = Math.max(a, b), lo = Math.min(a, b);   // たし算は順番を入れ替えてもよい（3+15 も「十いくつと1けた」）
        if (hi > rule.maxA || lo > rule.maxB) return err('数が大きすぎます（この設定では ' + rule.maxA + ' ＋ ' + rule.maxB + ' まで）');
      }
      items.push({ a: a, b: b, op: op });
    });
    return { items: items.slice(0, 100), errors: errors };
  }

  function arithRule(o) {
    var lv = ARITH_LEVELS[o.level];
    var ops = o.op === 'add' ? ['+'] : o.op === 'sub' ? ['-'] : ['+', '-'];
    return { ops: ops, maxA: lv.a[1], maxB: lv.b[1],
      opsLabel: o.op === 'add' ? '「たし算」' : o.op === 'sub' ? '「ひき算」' : '「たし算・ひき算」' };
  }
  function kukuRule() { return { ops: ['×'], kuku: true, maxA: 9, maxB: 9, opsLabel: '「九九（かけ算）」' }; }

  /**
   * 入れたい問題と、作った問題をまとめる。
   * mode 'mix': 入れた問題を含めて合計（1 ページの数 × 枚数）になるまで作った問題で埋め、全体をまぜる
   * mode 'only': 入れた問題だけ（ページ数は問題の数から決まる）
   */
  function withCustom(custom, mode, perPage, pages, gen, seed) {
    if (mode === 'only' && custom.length) return custom.slice();
    var total = perPage * pages;
    var mine = custom.slice(0, total);
    var rest = gen(total - mine.length);
    if (!mine.length) return rest;
    return makeRng(seed, 303).shuffle(mine.concat(rest));
  }

  // ---------------------------------------------------------------
  // 百ます計算
  // ---------------------------------------------------------------
  /**
   * 百ます（size 10）・25 ます（size 5）。top が上の数、left が左の数、cells[行][列] が答え。
   * たし算・かけ算は 0〜9（25 ますは 1〜9 から 5 つ）。ひき算は上が 10〜19（ひかれる数）・左が 0〜9（ひく数）
   */
  function genHyaku(o, seed, index) {
    var rng = makeRng(seed, 400 + index);
    var size = o.size;
    var top, left;
    if (o.op === 'sub') {
      top = rng.shuffle([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]).slice(0, size);
      left = rng.shuffle(size === 5 ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, size);
    } else {
      var digits = size === 5 ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      top = rng.shuffle(digits).slice(0, size);
      left = rng.shuffle(digits).slice(0, size);
    }
    var cells = left.map(function (l) {
      return top.map(function (t) { return o.op === 'add' ? t + l : o.op === 'sub' ? t - l : t * l; });
    });
    return { top: top, left: left, cells: cells, op: o.op };
  }

  // ---------------------------------------------------------------
  // 時計
  // ---------------------------------------------------------------
  var CLOCK_LEVELS = ['hour', 'half', 'five', 'min'];

  function clockFits(level, m) {
    return level === 'hour' ? m === 0 : level === 'half' ? (m === 0 || m === 30) : level === 'five' ? m % 5 === 0 : true;
  }
  function clockPool(level) { return level === 'hour' ? 12 : level === 'half' ? 24 : level === 'five' ? 144 : 720; }

  /** 時刻を作る。組み合わせを一巡するまで同じ時刻を出さない（「何時」だけなら 12 通り） */
  function genClock(o, seed, total) {
    var rng = makeRng(seed, 500);
    var out = [], seen = {}, nSeen = 0, pool = clockPool(o.level);
    for (var n = 0; n < total; n++) {
      var t = null;
      for (var i = 0; i < 200; i++) {
        var h = rng.int(1, 12);
        var m = o.level === 'hour' ? 0 : o.level === 'half' ? (rng.next() < 0.7 ? 30 : 0) : o.level === 'five' ? rng.int(0, 11) * 5 : rng.int(0, 59);
        if (o.level === 'five' && m === 0 && rng.next() < 0.7) continue;      // ちょうどの時刻は少なめに
        if (o.level === 'min' && m % 5 === 0 && rng.next() < 0.8) continue;   // 1 分きざみは 5 の倍数を少なめに
        t = { h: h, m: m };
        if (!seen[h + ':' + m]) break;
      }
      if (!seen[t.h + ':' + t.m]) { seen[t.h + ':' + t.m] = true; nSeen++; }
      if (nSeen >= pool) { seen = {}; nSeen = 0; }
      out.push(t);
    }
    return out;
  }

  /** 分の読み方（1・3・4・6・8・0 で終わると「ぷん」: いっぷん、さんぷん、よんぷん、ろっぷん、はっぷん、じゅっぷん） */
  function funPun(m) {
    var d = m % 10;
    return (d === 1 || d === 3 || d === 4 || d === 6 || d === 8 || d === 0) ? 'ぷん' : 'ふん';
  }
  /** 子ども向けの答え: 3じ、3じ30ぷん */
  function clockText(t) {
    return t.h + 'じ' + (t.m ? t.m + funPun(t.m) : '');
  }
  /** 針の角度（12 の方向が 0 度、時計回り。短い針は分に合わせて少し進む） */
  function handAngles(t) {
    return { hour: ((t.h % 12) + t.m / 60) * 30, minute: t.m * 6 };
  }

  /** 「入れたい時刻」を読む（7:30、7時30分、7じはん、19:05 など。1 行に 1 つ、または 、 で区切る） */
  function parseClockLines(text, level) {
    var items = [], errors = [];
    String(text || '').split(/[\r\n、,，]+/).slice(0, 100).forEach(function (raw, i) {
      var line = raw.trim();
      if (!line) return;
      var s = toHalf(line).replace(/ごぜん|午前|ごご|午後/g, '');
      var m = /^(\d{1,2})(?::|時|じ)(?:(\d{1,2})(?:分|ふん|ぷん)?|(半|はん))?$/.exec(s);
      var err = function (reason) { errors.push({ line: i + 1, text: line.slice(0, 20), reason: reason }); };
      if (!m) return err('時刻として読めません（例: 7:30、7時30分）');
      var h = Number(m[1]), mm = m[3] ? 30 : m[2] ? Number(m[2]) : 0;
      if (h > 23 || mm > 59) return err('ありえない時刻です');
      h = h % 12 || 12;
      if (!clockFits(level, mm)) {
        return err(level === 'hour' ? 'この設定は「何時」だけです' : level === 'half' ? 'この設定は「何時」と「何時半」だけです' : 'この設定は 5 分きざみです');
      }
      items.push({ h: h, m: mm });
    });
    return { items: items.slice(0, 60), errors: errors };
  }

  // ---------------------------------------------------------------
  // 迷路（必ず解ける。枝分かれはあっても、スタートからゴールへの道はひとつだけ）
  // ---------------------------------------------------------------
  var MAZE_LEVELS = {
    easy:   { cols: 7, rows: 9, newest: 1 },      // 長い通路が多く、行き止まりが少ない
    normal: { cols: 13, rows: 16, newest: 0.7 },
    hard:   { cols: 22, rows: 28, newest: 0.45 }, // 枝分かれと行き止まりが多い
  };
  // 壁のビット: 1=上 2=右 4=下 8=左（立っている壁）
  var DIRS = [
    { bit: 1, dx: 0, dy: -1, opp: 4 },
    { bit: 2, dx: 1, dy: 0, opp: 8 },
    { bit: 4, dx: 0, dy: 1, opp: 1 },
    { bit: 8, dx: -1, dy: 0, opp: 2 },
  ];

  /**
   * growing tree 法で「完全迷路」（どの 2 マスの間にも道がちょうど 1 本）を作る。
   * newest=1 で深さ優先（長い通路）、小さいほど枝分かれと行き止まりが増える。
   * 答えの道が短すぎるときは作り直す（最大 20 回。いちばん長いものを使う）
   */
  function genMaze(level, seed, index) {
    var L = MAZE_LEVELS[level] || MAZE_LEVELS.normal;
    var best = null;
    for (var attempt = 0; attempt < 20; attempt++) {
      var m = carveMaze(L.cols, L.rows, L.newest, makeRng(seed, 600 + index * 31 + attempt));
      m.path = solveMaze(m);
      if (!best || m.path.length > best.path.length) best = m;
      if (m.path.length >= (L.cols + L.rows) * 1.6) break;
    }
    best.level = level;
    return best;
  }

  function carveMaze(cols, rows, newest, rng) {
    var n = cols * rows;
    var walls = [], visited = [];
    for (var i = 0; i < n; i++) { walls.push(15); visited.push(false); }
    var active = [rng.int(0, n - 1)];
    visited[active[0]] = true;
    while (active.length) {
      var idx = rng.next() < newest ? active.length - 1 : rng.int(0, active.length - 1);
      var c = active[idx];
      var x = c % cols, y = (c - x) / cols;
      var nb = [];
      for (var d = 0; d < 4; d++) {
        var nx = x + DIRS[d].dx, ny = y + DIRS[d].dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        var ni = ny * cols + nx;
        if (!visited[ni]) nb.push({ d: DIRS[d], i: ni });
      }
      if (!nb.length) { active.splice(idx, 1); continue; }
      var pick = rng.pick(nb);
      walls[c] &= ~pick.d.bit;
      walls[pick.i] &= ~pick.d.opp;
      visited[pick.i] = true;
      active.push(pick.i);
    }
    // スタートは左上のマス（上の辺に入口）、ゴールは右下のマス（下の辺に出口）
    return { cols: cols, rows: rows, walls: walls, start: 0, goal: n - 1 };
  }

  function neighbors(m, c) {
    var x = c % m.cols, y = (c - x) / m.cols, out = [];
    for (var d = 0; d < 4; d++) {
      if (m.walls[c] & DIRS[d].bit) continue;
      var nx = x + DIRS[d].dx, ny = y + DIRS[d].dy;
      if (nx < 0 || ny < 0 || nx >= m.cols || ny >= m.rows) continue;
      out.push(ny * m.cols + nx);
    }
    return out;
  }

  /** 幅優先でスタートからゴールまでの道（マスの番号の並び）を返す。つながっていなければ [] */
  function solveMaze(m) {
    var n = m.cols * m.rows, prev = [], q = [m.start], head = 0;
    for (var i = 0; i < n; i++) prev.push(-1);
    prev[m.start] = m.start;
    while (head < q.length) {
      var c = q[head++];
      if (c === m.goal) break;
      neighbors(m, c).forEach(function (ni) { if (prev[ni] === -1) { prev[ni] = c; q.push(ni); } });
    }
    if (prev[m.goal] === -1) return [];
    var path = [m.goal];
    while (path[0] !== m.start) path.unshift(prev[path[0]]);
    return path;
  }

  /** 迷路の数字（テスト用）: 通路の数・行き止まりの数・スタートから行けるマスの数・答えの長さ */
  function mazeStats(m) {
    var n = m.cols * m.rows, open = 0, deadEnds = 0;
    for (var i = 0; i < n; i++) {
      var k = neighbors(m, i).length;
      open += k;
      if (k === 1) deadEnds++;
    }
    var seen = {}, st = [m.start], reach = 0;
    seen[m.start] = true;
    while (st.length) {
      var c = st.pop(); reach++;
      neighbors(m, c).forEach(function (ni) { if (!seen[ni]) { seen[ni] = true; st.push(ni); } });
    }
    return { cells: n, passages: open / 2, deadEnds: deadEnds, reachable: reach, pathLength: solveMaze(m).length };
  }

  // ---------------------------------------------------------------
  // なぞり書き（ひらがな・カタカナ）・漢字
  // ---------------------------------------------------------------
  var KANA_ROWS = {
    a: 'あいうえお', ka: 'かきくけこ', sa: 'さしすせそ', ta: 'たちつてと', na: 'なにぬねの',
    ha: 'はひふへほ', ma: 'まみむめも', ya: 'やゆよ', ra: 'らりるれろ', wa: 'わをん',
    ga: 'がぎぐげご', za: 'ざじずぜぞ', da: 'だぢづでど', ba: 'ばびぶべぼ', pa: 'ぱぴぷぺぽ',
    small: 'ぁぃぅぇぉっゃゅょ',
  };
  var KANA_ROW_KEYS = Object.keys(KANA_ROWS);

  function toKata(s) {
    return String(s).replace(/[ぁ-ゖ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); });
  }
  function isHira(c) { return /^[ぁ-ゖー]$/.test(c); }
  function isKata(c) { return /^[ァ-ヺー]$/.test(c); }

  // ローマ字（ヘボン式）。英語ページの「お手本にローマ字」で、行（1 字ずつ）の練習にだけ使う
  // し shi・ち chi・つ tsu・ふ fu・じ／ぢ ji・ず／づ zu・を o（ヘボン式。助詞の「を」は o と書く）・ん n
  // 小さい字（ぁ ゃ っ など）は前の字と合わせて読む（きゃ kya）ので、1 字だけのローマ字は持たない
  var ROMAJI = {
    'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
    'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
    'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
    'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
    'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
    'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
    'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
    'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
    'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
    'わ': 'wa', 'を': 'o', 'ん': 'n',
    'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
    'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
    'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
    'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
    'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
  };
  /** 1 字のローマ字（ひらがな・カタカナ）。持っていない字は '' */
  function romajiOf(c) {
    var h = String(c).replace(/[ァ-ヶ]/g, function (x) { return String.fromCharCode(x.charCodeAt(0) - 0x60); });
    return ROMAJI[h] || '';
  }

  /**
   * 「なぞる言葉」を読む。区切りは空白・改行・、。・
   * ひらがなのプリントにはひらがな（と のばす棒「ー」・小さい字）だけ、カタカナにはカタカナだけを残す
   * @returns {{words: string[], dropped: string[], hint: string}} dropped は外した文字（重なりなし）
   */
  function parseKanaWords(text, script, lang) {
    var ok = script === 'kata' ? isKata : isHira;
    var dropped = [], words = [], otherScript = 0;
    String(text || '').split(/[\s　、。,.・]+/).forEach(function (w) {
      var kept = '';
      Array.from(w).forEach(function (c) {
        if (ok(c)) { kept += c; return; }
        if (dropped.indexOf(c) < 0) dropped.push(c);
        if (script === 'kata' ? isHira(c) : isKata(c)) otherScript++;
      });
      if (kept.replace(/ー/g, '')) words.push(kept.slice(0, 20));   // のばす棒だけの言葉は使わない
    });
    var hint = !otherScript ? '' : script === 'kata' ? msg(lang).kanaHintKata : msg(lang).kanaHintHira;
    return { words: words.slice(0, 40), dropped: dropped.slice(0, 20), hint: hint };
  }

  /** 漢字 → 学年（配当表に無ければ undefined） */
  function kanjiGradeMap(byGrade) {
    var map = {};
    Object.keys(byGrade).forEach(function (g) { Array.from(byGrade[g]).forEach(function (c) { map[c] = Number(g); }); });
    return map;
  }

  /**
   * 「練習したい漢字」を読む。選んだ学年までの配当表の字だけを残す（順番はそのまま・同じ字は 1 つに）
   * @returns {{chars: string[], higher: {c:string,g:number}[], outside: string[]}}
   *   higher: 選んだ学年より上の学年の字（外した）、outside: 配当表に無い漢字（外した）。漢字でない文字は黙って外す
   */
  function parseKanjiInput(text, grade, gradeMap) {
    var chars = [], seen = {}, higher = [], outside = [];
    Array.from(String(text || '')).forEach(function (c) {
      if (!/[㐀-鿿豈-﫿]/.test(c) || seen[c]) return;
      seen[c] = true;
      var g = gradeMap[c] || 0;
      if (!g) outside.push(c);
      else if (g > grade) higher.push({ c: c, g: g });
      else chars.push(c);
    });
    return { chars: chars.slice(0, 200), higher: higher.slice(0, 30), outside: outside.slice(0, 30) };
  }

  // マスの大きさ（mm）と、A4 縦 1 ページに入る列・行の数、1 文字のときのなぞる回数。rowsLetter はレター（英語ページ）
  var TRACE_SIZES = {
    L: { mm: 20, cols: 9, rows: 11, rowsLetter: 10, trace: 3 },
    M: { mm: 15, cols: 12, rows: 15, rowsLetter: 14, trace: 4 },
    S: { mm: 12, cols: 15, rows: 19, rowsLetter: 18, trace: 5 },
  };
  /** なぞり書き（かな・漢字）の 1 ページの行数。レターは A4 より少ない */
  function traceRowsPerPage(size, paper) {
    var sz = TRACE_SIZES[size];
    return paper === 'letter' ? sz.rowsLetter : sz.rows;
  }

  // 用紙（mm）。body は原稿用紙のページの本文（見出し・ページの下を除く）に使える大きさ（Chromium で測った値から少し引いた。
  // A4 245.5・レター 227.9。2026-09-24）。rowsLetter も同じく測って、はみ出さない行数にした
  var PAPERS = {
    a4: { w: 210, h: 297, body: { w: 186, h: 245 } },
    letter: { w: 215.9, h: 279.4, body: { w: 191.9, h: 227 } },
  };

  // 原稿用紙: 400 字詰（20 字 × 20 行）のたて書き・よこ書きと、ますの大きさを選ぶ練習用のマス目
  // 400 字詰はマス 10・行間（ふりがなの欄）3 の比で描き、本文の大きさに合わせて縮める（sheets.js）
  var GENKO_SIZES = [20, 15, 12, 10];
  function genkoPage(o, paper, index) {
    if (o.layout !== 'grid') return { kind: 'genko', index: index, layout: o.layout, cols: 20, rows: 20, cell: 10, gap: 3 };
    var b = PAPERS[paper].body;
    return { kind: 'genko', index: index, layout: 'grid', size: o.size, guides: o.guides,
      cols: Math.floor(b.w / o.size), rows: Math.floor(b.h / o.size) };
  }

  /**
   * 1 つの文字・言葉のマスの並び（行の配列）を作る。マスは {ch, kind}、kind は
   * 'dark'（お手本）/ 'light'（なぞる）/ 'blank'（自分で書く）/ 'gap'（言葉と言葉のあいだ）
   * 1 文字: [お手本][なぞる × trace][空き…] の 1 行
   * 2 文字以上: 1 行目「お手本＋なぞる」、2 行目「なぞる」、3 行目「空き」。1 行に入らない言葉は折り返す
   */
  function traceRows(word, cols, trace) {
    var chars = Array.from(word);
    var cell = function (ch, kind) { return { ch: ch, kind: kind }; };
    var fill = function (row) { while (row.length < cols) row.push(cell('', 'blank')); return row; };
    if (chars.length === 1) {
      var r = [cell(chars[0], 'dark')];
      for (var i = 0; i < trace && r.length < cols; i++) r.push(cell(chars[0], 'light'));
      return [fill(r)];
    }
    var chunks = [];
    for (var s = 0; s < chars.length; s += cols) chunks.push(chars.slice(s, s + cols));
    var rows = [];
    chunks.forEach(function (ch) {
      var repeatRow = function (first) {
        var row = [], k = 0;
        while (row.length + ch.length <= cols) {
          ch.forEach(function (c) { row.push(cell(c, first && k === 0 ? 'dark' : 'light')); });
          k++;
          if (row.length < cols) row.push(cell('', 'gap'));
          if (chunks.length > 1) break;       // 折り返した言葉は 1 回ずつ
        }
        return fill(row);
      };
      rows.push(repeatRow(true), repeatRow(false), fill([]));
    });
    return rows;
  }

  /**
   * 行のまとまり（1 語ぶんの 3 行など）を 1 ページの行数に詰める。まとまりはページをまたがせない
   * （1 ページに入らない大きさのまとまりだけは分ける）
   */
  function paginateGroups(groups, perPage) {
    var pages = [], cur = [];
    groups.forEach(function (g) {
      if (cur.length + g.length > perPage && cur.length) { pages.push(cur); cur = []; }
      for (var i = 0; i < g.length; i++) {
        if (cur.length === perPage) { pages.push(cur); cur = []; }
        cur.push(g[i]);
      }
    });
    if (cur.length) pages.push(cur);
    return pages;
  }

  /** 並びを 1 ページの数で区切る */
  function paginate(items, perPage) {
    var out = [];
    for (var i = 0; i < items.length; i += perPage) out.push(items.slice(i, i + perPage));
    return out;
  }

  // ---------------------------------------------------------------
  // 設定（保存・共有・ファイル）の形をそろえる
  // ---------------------------------------------------------------
  var TYPES = ['arith', 'kuku', 'hyaku', 'clock', 'kana', 'kanji', 'maze', 'genko', 'romaji'];
  var ROMAJI_PER_PAGE = 10;   // ローマ字の言葉のプリント 1 枚の言葉の数（4 本線 1 組ずつ）
  var MAX_PAGES = 10;
  var COUNTS = { yoko: [10, 20, 30], tate: [12, 16, 20] };

  function defaults() {
    return {
      type: 'arith',
      seed: 1,
      common: { name: '', nameTrace: true, showName: true, showDate: true, showScore: true, answers: 'qa', credit: true, paper: 'a4' },
      arith: { op: 'add', level: 'd1', carry: 'any', count: 20, style: 'yoko', pages: 1, custom: '', customMode: 'mix' },
      kuku: { dans: [2], order: 'random', count: 20, pages: 1, custom: '', customMode: 'mix' },
      hyaku: { op: 'add', size: 10, hand: 'right', pages: 1 },
      clock: { level: 'half', mode: 'read', count: 6, guide: true, pages: 1, custom: '', customMode: 'mix' },
      kana: { script: 'hira', rows: ['a', 'ka'], source: 'rows', words: '', size: 'L', romaji: false },
      kanji: { grade: 1, source: 'order', start: 1, size: 'L', pages: 1, custom: '' },
      maze: { level: 'normal', pages: 1 },
      genko: { layout: 'v', size: 15, guides: true, pages: 1 },
      romaji: { source: 'words', grade: 3, sys: 'hep', mode: 'trace', pages: 1 },
    };
  }

  function normalizeType(type, v) {
    var d = defaults()[type];
    var o = obj(v);
    var pages = intIn(o.pages, 1, MAX_PAGES, 1);
    var mode = oneOf(o.customMode, ['mix', 'only'], 'mix');
    switch (type) {
      case 'arith': {
        var style = oneOf(o.style, ['yoko', 'tate'], d.style);
        var r = {
          op: oneOf(o.op, ['add', 'sub', 'mix'], d.op),
          level: oneOf(o.level, ARITH_LEVEL_KEYS, d.level),
          carry: oneOf(o.carry, ['none', 'with', 'any'], d.carry),
          count: oneOf(Number(o.count), COUNTS[style], COUNTS[style][1]),
          style: style, pages: pages, custom: str(o.custom, 2000), customMode: mode,
        };
        if (!arithPossible(r.op, r.level, r.carry)) r.carry = 'any';
        return r;
      }
      case 'kuku': {
        var dans = Array.isArray(o.dans) ? o.dans.map(Number).filter(function (x, i, a) { return x >= 1 && x <= 9 && x % 1 === 0 && a.indexOf(x) === i; }) : [];
        return {
          dans: dans.length ? dans.sort(function (x, y) { return x - y; }) : d.dans.slice(),
          order: oneOf(o.order, ['seq', 'rev', 'random'], d.order),
          count: oneOf(Number(o.count), [20, 30], d.count), pages: pages, custom: str(o.custom, 2000), customMode: mode,
        };
      }
      case 'hyaku':
        return { op: oneOf(o.op, ['add', 'sub', 'mul'], d.op), size: oneOf(Number(o.size), [10, 5], 10), hand: oneOf(o.hand, ['right', 'left'], 'right'), pages: pages };
      case 'clock':
        return {
          level: oneOf(o.level, CLOCK_LEVELS, d.level), mode: oneOf(o.mode, ['read', 'draw'], d.mode),
          count: oneOf(Number(o.count), [4, 6, 9, 12], d.count), guide: o.guide === undefined ? d.guide : !!o.guide, pages: pages,
          custom: str(o.custom, 1000), customMode: mode,
        };
      case 'kana': {
        var rows = Array.isArray(o.rows) ? o.rows.filter(function (k, i, a) { return KANA_ROW_KEYS.indexOf(k) >= 0 && a.indexOf(k) === i; }) : [];
        return {
          script: oneOf(o.script, ['hira', 'kata'], d.script), rows: rows.length ? rows : d.rows.slice(),
          source: oneOf(o.source, ['rows', 'words'], d.source), words: str(o.words, 600), size: oneOf(o.size, ['L', 'M', 'S'], d.size),
          romaji: o.romaji === undefined ? d.romaji : !!o.romaji,
        };
      }
      case 'kanji':
        return {
          grade: intIn(o.grade, 1, 6, 1), source: oneOf(o.source, ['order', 'random', 'custom'], d.source),
          start: intIn(o.start, 1, 202, 1), size: oneOf(o.size, ['L', 'M', 'S'], d.size), pages: pages, custom: str(o.custom, 1000),
        };
      case 'maze':
        return { level: oneOf(o.level, Object.keys(MAZE_LEVELS), d.level), pages: pages };
      case 'genko':
        return { layout: oneOf(o.layout, ['v', 'h', 'grid'], d.layout), size: oneOf(Number(o.size), GENKO_SIZES, d.size),
          guides: o.guides === undefined ? d.guides : !!o.guides, pages: pages };
      case 'romaji':
        return { source: oneOf(o.source, ['words', 'table'], d.source), grade: intIn(o.grade, 1, 6, d.grade), sys: oneOf(o.sys, ['hep', 'kun'], d.sys),
          mode: oneOf(o.mode, ['trace', 'write'], d.mode), pages: pages };
    }
    return d;
  }

  function normalizeCommon(v) {
    var d = defaults().common, o = obj(v);
    var b = function (k) { return o[k] === undefined ? d[k] : !!o[k]; };
    return {
      name: str(o.name, 20).replace(/[\r\n\t]/g, ' '), nameTrace: b('nameTrace'),
      showName: b('showName'), showDate: b('showDate'), showScore: b('showScore'),
      answers: oneOf(o.answers, ['q', 'qa', 'a'], d.answers), credit: b('credit'), paper: oneOf(o.paper, Object.keys(PAPERS), d.paper),
    };
  }

  /** 保存・共有・ファイルから来た設定を今の形にそろえる（中身はそのまま信じない） */
  function normalizeState(v) {
    var o = obj(v);
    var s = { type: oneOf(o.type, TYPES, 'arith'), seed: intIn(o.seed, 0, 4294967295, 1), common: normalizeCommon(o.common) };
    TYPES.forEach(function (t) { s[t] = normalizeType(t, o[t]); });
    return s;
  }

  // 「よく使う設定」（子どもごとの設定など）。問題の種は持たない（呼び出すたびに新しい問題になる）
  var MAX_PRESETS = 30;
  function normalizePresets(v, lang) {
    var ids = {};
    return (Array.isArray(v) ? v : []).slice(0, MAX_PRESETS).map(function (p, i) {
      var o = obj(p);
      var st = normalizeState(o.state);
      delete st.seed;
      var id = str(o.id, 20).replace(/[^A-Za-z0-9_-]/g, '') || ('p' + i);
      while (ids[id]) id += 'x';
      ids[id] = true;
      return { id: id, name: str(o.name, 30).replace(/[\r\n\t]/g, ' ').trim() || msg(lang).presetNoName, state: st };
    });
  }

  // ---------------------------------------------------------------
  // 共有リンク（#s= の後ろ。README「ツールを追加するとき」11）
  // いま選んでいる種類の設定・共通の設定・種だけを入れる。子どもの名前は既定で入れない
  // ---------------------------------------------------------------
  var SHARE_MAX = 4000;

  function b64uEncode(text) {
    var bytes = new TextEncoder().encode(text);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64uDecode(s) {
    var b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }

  /** 共有リンクの # 以降に入れる文字列（"s=" は付けない） */
  function encodeShare(state, withName) {
    var s = normalizeState(state);
    var c = Object.assign({}, s.common);
    if (!withName) c.name = '';
    return b64uEncode(JSON.stringify({ v: 1, t: s.type, s: s.seed, c: c, o: s[s.type] }));
  }

  /** 共有リンクの # 以降（"#s=..."）を設定に戻す。壊れていれば null */
  function decodeShare(hash) {
    var m = /^#?s=([A-Za-z0-9_-]+)$/.exec(String(hash || '').trim());
    if (!m) return null;
    try {
      var p = JSON.parse(b64uDecode(m[1]));
      if (!p || p.v !== 1 || TYPES.indexOf(p.t) < 0) return null;
      var raw = { type: p.t, seed: p.s, common: p.c };
      raw[p.t] = p.o;
      return normalizeState(raw);
    } catch (e) { return null; }
  }

  // ---------------------------------------------------------------
  // プリント 1 部の中身（問題のページ）を作る。答えのページは sheets.js が同じ中身から作る
  // ---------------------------------------------------------------
  /**
   * @param {object} state normalizeState 済み
   * @param {object} kanjiByGrade 学年 → 字の並び（constants.js）
   * @returns {{type: string, pages: object[], notes: string[], custom: object|null, hasAnswers: boolean}}
   *   pages はページごとの中身。notes は画面に出すお知らせ。custom は「入れたい問題」の読み取り結果
   */
  function buildWorkbook(state, kanjiByGrade, lang) {
    var t = state.type, o = state[t], seed = state.seed;
    var notes = [], pages = [], custom = null;

    if (t === 'arith' || t === 'kuku') {
      var parsed = parseArithLines(o.custom, t === 'arith' ? arithRule(o) : kukuRule());
      custom = parsed;
      var list;
      if (t === 'kuku' && o.order !== 'random' && !(o.customMode === 'only' && parsed.items.length)) {
        list = parsed.items.concat(genKuku(o, seed, 0));    // 順番どおりの九九は、入れた問題を先に
      } else {
        var gen = t === 'arith' ? function (n) { return genArith(o, seed, n); } : function (n) { return genKuku(o, seed, n); };
        list = withCustom(parsed.items, o.customMode, o.count, o.pages, gen, seed);
      }
      paginate(list, o.count).slice(0, MAX_PAGES * 3).forEach(function (items, i) {
        pages.push({ kind: t, index: i, items: items, count: o.count, style: t === 'arith' ? o.style : 'yoko', startNo: i * o.count + 1 });
      });
    } else if (t === 'hyaku') {
      var per = o.size === 10 ? 1 : 2;
      for (var p = 0; p < o.pages; p++) {
        var grids = [];
        for (var g = 0; g < per; g++) grids.push(genHyaku(o, seed, p * per + g));
        pages.push({ kind: 'hyaku', index: p, grids: grids, op: o.op, size: o.size, hand: o.hand });
      }
    } else if (t === 'clock') {
      var cp = parseClockLines(o.custom, o.level);
      custom = cp;
      var times = withCustom(cp.items, o.customMode, o.count, o.pages, function (n) { return genClock(o, seed, n); }, seed);
      paginate(times, o.count).forEach(function (items, i) {
        pages.push({ kind: 'clock', index: i, items: items, mode: o.mode, guide: o.guide, level: o.level, count: o.count, startNo: i * o.count + 1 });
      });
    } else if (t === 'kana') {
      var sz = TRACE_SIZES[o.size];
      var words = [];
      if (o.source === 'words') {
        var pw = parseKanaWords(o.words, o.script, lang);
        custom = pw;
        words = pw.words;
        if (!words.length) notes.push(msg(lang).noWords);
      } else {
        o.rows.forEach(function (k) { Array.from(KANA_ROWS[k]).forEach(function (c) { words.push(c); }); });
      }
      if (o.script === 'kata') words = words.map(toKata);
      var groups = words.map(function (w) { return traceRows(w, sz.cols, sz.trace); });
      // ローマ字は 1 字ずつの行の練習だけ（言葉は字の組み合わせで読みが変わるため付けない）
      if (o.romaji && o.source === 'rows') groups.forEach(function (g) { var c = g[0][0]; if (romajiOf(c.ch)) c.ro = romajiOf(c.ch); });
      paginateGroups(groups, traceRowsPerPage(o.size, state.common.paper)).forEach(function (rows, i) {
        pages.push({ kind: 'kana', index: i, rows: rows, size: o.size, script: o.script });
      });
    } else if (t === 'kanji') {
      var zs = TRACE_SIZES[o.size], zRows = traceRowsPerPage(o.size, state.common.paper);   // 英語ページのレターは行を減らす
      var all = Array.from(kanjiByGrade[o.grade] || '');
      var chars;
      if (o.source === 'custom') {
        var pk = parseKanjiInput(o.custom, o.grade, kanjiGradeMap(kanjiByGrade));
        custom = pk;
        chars = pk.chars;
        if (!chars.length) notes.push(msg(lang).noKanji);
      } else {
        var need = zRows * o.pages;
        if (o.source === 'random') chars = makeRng(seed, 700).shuffle(all).slice(0, need);
        else {
          var st = Math.min(o.start, all.length) - 1;
          chars = all.slice(st, st + need);
          if (chars.length < need) notes.push(msg(lang).kanjiEnd(o.grade, all.length));
        }
      }
      var g2 = chars.map(function (c) { return traceRows(c, zs.cols, zs.trace); });
      paginateGroups(g2, zRows).forEach(function (rows, i) {
        pages.push({ kind: 'kanji', index: i, rows: rows, size: o.size, grade: o.grade });
      });
    } else if (t === 'maze') {
      for (var q = 0; q < o.pages; q++) pages.push({ kind: 'maze', index: q, maze: genMaze(o.level, seed, q), level: o.level });
    } else if (t === 'genko') {
      for (var gp = 0; gp < o.pages; gp++) pages.push(genkoPage(o, state.common.paper, gp));
    } else if (t === 'romaji') {
      romajiPages(o, seed).forEach(function (pg) { pages.push(pg); });
    }

    return { type: t, pages: pages, notes: notes, custom: custom, hasAnswers: hasAnswersOf(state) };
  }

  /** 答えのページがあるか（なぞり書き・漢字・原稿用紙・ローマ字表・ローマ字のなぞり書きには無い） */
  function hasAnswersOf(state) {
    var t = state.type;
    if (t === 'romaji') return state.romaji.source === 'words' && state.romaji.mode === 'write';
    return t !== 'kana' && t !== 'kanji' && t !== 'genko';
  }

  /**
   * ローマ字のプリントの中身。表は 1 枚（清音・ん／濁音・半濁音／拗音）。言葉は学年の一覧を種でまぜて 1 枚 10 語
   * items: {w: 書き方, k: よみ, r: ローマ字（書くときの形。固有名詞は頭が大文字）}
   */
  function romajiPages(o, seed) {
    var RJ = romajiLib();
    if (o.source === 'table') {
      var rows = function (k) { return RJ.TABLE[k].map(function (row) { return RJ.tableRow(row).map(function (c) { return c ? { k: c, r: RJ.spell(c, o.sys) } : null; }); }); };
      return [{ kind: 'romaji', index: 0, source: 'table', sys: o.sys, mode: o.mode, seion: rows('seion'), dakuon: rows('dakuon'), yoon: rows('yoon') }];
    }
    var list = romajiWords()[o.grade] || [];
    var rng = makeRng(seed, 750), out = [], bag = [], need = ROMAJI_PER_PAGE * o.pages;
    while (out.length < need && list.length) {
      if (!bag.length) bag = rng.shuffle(list);
      out.push(bag.pop());
    }
    return paginate(out.map(function (x) {
      var r = RJ.spell(x.k, o.sys);
      return { w: x.w, k: x.k, r: x.p ? r.charAt(0).toUpperCase() + r.slice(1) : r };
    }), ROMAJI_PER_PAGE).map(function (items, i) {
      return { kind: 'romaji', index: i, source: 'words', sys: o.sys, mode: o.mode, grade: o.grade, items: items, startNo: i * ROMAJI_PER_PAGE + 1 };
    });
  }

  // ---------------------------------------------------------------
  // バックアップファイル（README「ツールを追加するとき」20。決定 D31）
  // 形式: { tool, version, exportedAt, data }。data はブラウザに保存しているものと同じ形
  // ---------------------------------------------------------------
  var BACKUP_VERSION = 1;

  /** 書き出すファイル名: <ツール名>-backup-YYYYMMDD.json（日付は端末の時計） */
  function backupFileName(tool, date) {
    var d = date || new Date();
    return tool + '-backup-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.json';
  }

  /** 書き出す中身 */
  function buildBackup(tool, data, date) {
    return { tool: tool, version: BACKUP_VERSION, exportedAt: (date || new Date()).toISOString(), data: data };
  }

  /**
   * 読み込んだファイルの文字列を確かめる。中身の正規化は normalizeState / normalizePresets で行う
   * @returns {{ok: true, data: object} | {ok: false, error: string}} error は画面にそのまま出す文
   */
  function parseBackup(text, tool, requiredKeys, lang) {
    var M = msg(lang);
    var o;
    try { o = JSON.parse(text); } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || Array.isArray(o) || typeof o.tool !== 'string') {
      return { ok: false, error: M.backupBad };
    }
    if (o.tool !== tool) {
      return { ok: false, error: M.backupOther(o.tool.slice(0, 40)) };
    }
    if (o.version !== BACKUP_VERSION) {
      return { ok: false, error: typeof o.version === 'number' && o.version > BACKUP_VERSION ? M.backupNewer : M.backupFormat };
    }
    var data = o.data;
    var missing = !data || typeof data !== 'object' || Array.isArray(data) ||
      (requiredKeys || []).some(function (k) { return data[k] === undefined || data[k] === null; });
    if (missing) return { ok: false, error: M.backupMissing };
    return { ok: true, data: data };
  }

  // 印刷物に小さく入れるクレジット（既定で表示、設定で外せる。決定 D38）。
  // 紙から来た人を数えるため、着地ページ /gakushu-print/print/ に向ける（サイト README「ツールを追加するとき」22）
  var CREDIT = TX.sheet.ja.credit;

  var api = {
    TOOL: TOOL, CREDIT: CREDIT, TYPES: TYPES, MAX_PAGES: MAX_PAGES, SHARE_MAX: SHARE_MAX, MAX_PRESETS: MAX_PRESETS,
    ARITH_LEVELS: ARITH_LEVELS, CLOCK_LEVELS: CLOCK_LEVELS, MAZE_LEVELS: MAZE_LEVELS, KANA_ROWS: KANA_ROWS, TRACE_SIZES: TRACE_SIZES, PAPERS: PAPERS, GENKO_SIZES: GENKO_SIZES, ROMAJI: ROMAJI, COUNTS: COUNTS, DIRS: DIRS,
    mulberry32: mulberry32, makeRng: makeRng, seedLabel: seedLabel, toHalf: toHalf,
    hasCarry: hasCarry, hasBorrow: hasBorrow, answerOf: answerOf, arithPossible: arithPossible, genArith: genArith, genKuku: genKuku,
    parseArithLines: parseArithLines, arithRule: arithRule, kukuRule: kukuRule, withCustom: withCustom,
    genHyaku: genHyaku, genClock: genClock, clockFits: clockFits, clockText: clockText, funPun: funPun, handAngles: handAngles, parseClockLines: parseClockLines,
    genMaze: genMaze, solveMaze: solveMaze, mazeStats: mazeStats,
    toKata: toKata, romajiOf: romajiOf, genkoPage: genkoPage, parseKanaWords: parseKanaWords, kanjiGradeMap: kanjiGradeMap, parseKanjiInput: parseKanjiInput,
    traceRows: traceRows, traceRowsPerPage: traceRowsPerPage, paginate: paginate, paginateGroups: paginateGroups,
    defaults: defaults, normalizeState: normalizeState, normalizePresets: normalizePresets,
    encodeShare: encodeShare, decodeShare: decodeShare, buildWorkbook: buildWorkbook, hasAnswersOf: hasAnswersOf, romajiPages: romajiPages, ROMAJI_PER_PAGE: ROMAJI_PER_PAGE,
    backupFileName: backupFileName, buildBackup: buildBackup, parseBackup: parseBackup,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Calc = api;
})(this);
