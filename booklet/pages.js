// ===========================
// おでかけ冊子 — 1 ページずつの絵（SVG の文字列）と、印刷する紙（面付け）の HTML
// DOM に触らない（文字列を返すだけ）。ブラウザでは window.BookPages、Node では module.exports
// 1 ページは A5 たて（148.5×210mm）の座標で描く。ミニブック（A7）は同じ座標を半分に縮めて置くので、字を大きめにする（k）
// ===========================
(function (root) {
  'use strict';

  var B = root.Book || (typeof require !== 'undefined' ? require('./book.js') : null);
  var C = root.Calc || (typeof require !== 'undefined' ? require('../calc.js') : null);

  var W = 148.5, H = 210;
  var CREDIT = 'yorozu-craft.com/gakushu-print/print/ で作成';
  var INK = '#222', SOFT = '#999', ANS = '#d0342c';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function f(n) { return Math.round(n * 100) / 100; }
  function text(x, y, s, size, opt) {
    opt = opt || {};
    return '<text x="' + f(x) + '" y="' + f(y) + '" font-size="' + f(size) + '"' +
      (opt.anchor ? ' text-anchor="' + opt.anchor + '"' : '') + (opt.bold ? ' font-weight="700"' : '') +
      ' fill="' + (opt.fill || INK) + '"' + (opt.base ? ' dominant-baseline="' + opt.base + '"' : '') + '>' + esc(s) + '</text>';
  }
  function line(x1, y1, x2, y2, w, color, dash) {
    return '<line x1="' + f(x1) + '" y1="' + f(y1) + '" x2="' + f(x2) + '" y2="' + f(y2) + '" stroke="' + (color || INK) + '" stroke-width="' + f(w) + '"' +
      (dash ? ' stroke-dasharray="' + dash + '"' : '') + ' stroke-linecap="round"/>';
  }
  function rect(x, y, w, h, sw, color, rx, fill) {
    return '<rect x="' + f(x) + '" y="' + f(y) + '" width="' + f(w) + '" height="' + f(h) + '"' + (rx ? ' rx="' + f(rx) + '"' : '') +
      ' fill="' + (fill || 'none') + '" stroke="' + (color || INK) + '" stroke-width="' + f(sw) + '"/>';
  }
  function circle(x, y, r, sw, color, fill) {
    return '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(r) + '" fill="' + (fill || 'none') + '" stroke="' + (color || INK) + '" stroke-width="' + f(sw) + '"/>';
  }
  function poly(pts, sw, color, closed) {
    return '<' + (closed ? 'polygon' : 'polyline') + ' points="' + pts.map(function (p) { return f(p[0]) + ',' + f(p[1]); }).join(' ') +
      '" fill="none" stroke="' + (color || INK) + '" stroke-width="' + f(sw) + '" stroke-linejoin="round" stroke-linecap="round"/>';
  }
  /** 字の数に合わせて、1 行に入る字数で折り返す（空白で区切る。区切れない言葉はそのまま） */
  function wrap(s, maxChars) {
    var out = [];
    String(s).split(' ').forEach(function (tok) {
      var last = out[out.length - 1];
      if (last !== undefined && Array.from(last + ' ' + tok).length <= maxChars) out[out.length - 1] = last + ' ' + tok;
      else out.push(tok);
    });
    return out;
  }

  // ---------------------------------------------------------------
  // 中身（box = {x, y, w, h} の中に描く）。answer=true で答えを重ねる
  // ---------------------------------------------------------------
  function mazeBody(m, box, answer, k) {
    var cs = Math.min(box.w / m.cols, (box.h - 12 * k) / m.rows);
    var gw = cs * m.cols, gh = cs * m.rows;
    var ox = box.x + (box.w - gw) / 2, oy = box.y + 6 * k + (box.h - 12 * k - gh) / 2;
    var sw = Math.max(0.35, Math.min(0.9, cs * 0.09)), out = [];
    for (var y = 0; y < m.rows; y++) for (var x = 0; x < m.cols; x++) {
      var i = y * m.cols + x, wl = m.walls[i], x0 = ox + x * cs, y0 = oy + y * cs;
      if ((wl & 1) && i !== m.start) out.push(line(x0, y0, x0 + cs, y0, sw));
      if (wl & 8) out.push(line(x0, y0, x0, y0 + cs, sw));
      if (x === m.cols - 1 && (wl & 2)) out.push(line(x0 + cs, y0, x0 + cs, y0 + cs, sw));
      if (y === m.rows - 1 && (wl & 4) && i !== m.goal) out.push(line(x0, y0 + cs, x0 + cs, y0 + cs, sw));
    }
    var fs = Math.min(4.2 * k, 7 * k);
    out.push(text(ox + cs / 2, oy - 1.6 * k, 'スタート ↓', fs * 0.8, { anchor: 'start', bold: true }));
    out.push(text(ox + gw - cs / 2, oy + gh + 4.4 * k, '↓ ゴール', fs * 0.8, { anchor: 'end', bold: true }));
    if (answer) {
      var pts = m.path.map(function (c) { var cx = c % m.cols, cy = (c - cx) / m.cols; return [ox + (cx + 0.5) * cs, oy + (cy + 0.5) * cs]; });
      pts.unshift([pts[0][0], oy - cs * 0.3]);
      pts.push([pts[pts.length - 1][0], oy + gh + cs * 0.3]);
      out.push(poly(pts, Math.max(0.6, cs * 0.18), ANS));
    }
    return out.join('');
  }

  function dotsBody(d, box, answer, k, small) {
    var S = Math.min(box.w, box.h);
    var sc = S / 108, ox = box.x + (box.w - 100 * sc) / 2, oy = box.y + (box.h - 100 * sc) / 2;
    var P = function (p) { return [ox + p[0] * sc, oy + p[1] * sc]; };
    var out = [];
    d.deco.forEach(function (e) {
      if (e.c) { var c = P(e.c); out.push(circle(c[0], c[1], e.c[2] * sc, 0.5 * k, INK)); }
      if (e.r) { var a = P(e.r); out.push(rect(a[0], a[1], e.r[2] * sc, e.r[3] * sc, 0.5 * k, INK)); }
      if (e.l) out.push(poly(e.l.map(P), 0.5 * k, INK));
    });
    if (answer) out.push(poly(d.pts.map(P), 0.8 * k, ANS, true));
    var fs = (d.pts.length > 30 ? 2.7 : d.pts.length > 18 ? 3.2 : 3.8) * k * (small ? 1.4 : 1);
    d.pts.forEach(function (p, i) {
      var q = P(p);
      out.push('<circle cx="' + f(q[0]) + '" cy="' + f(q[1]) + '" r="' + f((i === 0 ? 1.1 : 0.75) * k) + '" fill="' + INK + '"/>');
      if (!answer || !small) {
        var lp = P(B.labelPos(d.pts, i, 4.2 * k / sc * (small ? 1.2 : 1)));
        out.push(text(lp[0], lp[1], String(i + 1), fs, { anchor: 'middle', base: 'central', bold: i === 0 }));
      }
    });
    return out.join('');
  }

  function bingoBody(b, box, k) {
    var side = Math.min(box.w, box.h), cs = side / b.n;
    var ox = box.x + (box.w - side) / 2, oy = box.y + (box.h - side) / 2, out = [];
    out.push(rect(ox, oy, side, side, 0.8 * k));
    for (var i = 1; i < b.n; i++) {
      out.push(line(ox + i * cs, oy, ox + i * cs, oy + side, 0.5 * k));
      out.push(line(ox, oy + i * cs, ox + side, oy + i * cs, 0.5 * k));
    }
    var base = (b.n === 3 ? 6.6 : b.n === 4 ? 5.2 : 4.2) * k;
    b.cells.forEach(function (c, i) {
      var x = ox + (i % b.n + 0.5) * cs, y = oy + (Math.floor(i / b.n) + 0.5) * cs;
      var maxChars = Math.max(3, Math.floor(cs * 0.86 / base));
      var lines = wrap(c.text, maxChars);
      var longest = Math.max.apply(null, lines.map(function (l) { return Array.from(l).length; }));
      var fs = Math.min(base, cs * 0.86 / longest, cs * 0.8 / (lines.length * 1.25));
      lines.forEach(function (l, j) {
        out.push(text(x, y + (j - (lines.length - 1) / 2) * fs * 1.25, l, fs, { anchor: 'middle', base: 'central', bold: c.free, fill: c.free ? SOFT : INK }));
      });
    });
    return out.join('');
  }

  function wordsBody(w, box, answer, k, small) {
    var fs = 4.4 * k, cols = w.words.length > 2 ? 2 : 1, rows = Math.ceil(w.words.length / cols);
    var listH = small ? 0 : 6 * k + rows * fs * 1.6;
    var cs = Math.min(box.w / w.size, (box.h - listH) / w.size, 13 * k);
    var gw = cs * w.size, ox = box.x + (box.w - gw) / 2, oy = box.y, out = [];
    if (answer) {
      w.words.forEach(function (p) {
        var a = p.cells[0], z = p.cells[p.cells.length - 1];
        var ax = ox + (a % w.size + 0.5) * cs, ay = oy + (Math.floor(a / w.size) + 0.5) * cs;
        var zx = ox + (z % w.size + 0.5) * cs, zy = oy + (Math.floor(z / w.size) + 0.5) * cs;
        out.push('<line x1="' + f(ax) + '" y1="' + f(ay) + '" x2="' + f(zx) + '" y2="' + f(zy) + '" stroke="' + ANS + '" stroke-opacity="0.35" stroke-width="' + f(cs * 0.78) + '" stroke-linecap="round"/>');
      });
    }
    out.push(rect(ox, oy, gw, gw, 0.7 * k));
    for (var i = 1; i < w.size; i++) {
      out.push(line(ox + i * cs, oy, ox + i * cs, oy + gw, 0.3 * k, SOFT));
      out.push(line(ox, oy + i * cs, ox + gw, oy + i * cs, 0.3 * k, SOFT));
    }
    w.grid.forEach(function (ch, i) {
      out.push(text(ox + (i % w.size + 0.5) * cs, oy + (Math.floor(i / w.size) + 0.5) * cs, ch, cs * 0.6, { anchor: 'middle', base: 'central' }));
    });
    if (!small) {
      var ly = oy + gw + 6 * k + fs * 0.4;
      w.words.forEach(function (p, i) {
        var col = i % cols, row = Math.floor(i / cols);
        var x = box.x + (cols === 1 ? box.w / 2 - 20 * k : 4 + col * box.w / 2), y = ly + row * fs * 1.6;
        out.push(rect(x, y - fs * 0.75, fs * 0.9, fs * 0.9, 0.4 * k));
        out.push(text(x + fs * 1.4, y, p.word, fs, {}));
      });
    }
    return out.join('');
  }

  function sudokuBody(s, box, answer, k) {
    var side = Math.min(box.w, box.h, s.n === 4 ? 88 : 102), cs = side / s.n;
    var ox = box.x + (box.w - side) / 2, oy = box.y + (box.h - side) / 2, out = [];
    for (var i = 0; i <= s.n; i++) {
      var thickV = i % s.box.w === 0, thickH = i % s.box.h === 0;
      out.push(line(ox + i * cs, oy, ox + i * cs, oy + side, (thickV ? 0.9 : 0.3) * k));
      out.push(line(ox, oy + i * cs, ox + side, oy + i * cs, (thickH ? 0.9 : 0.3) * k));
    }
    s.puzzle.forEach(function (v, i) {
      var x = ox + (i % s.n + 0.5) * cs, y = oy + (Math.floor(i / s.n) + 0.5) * cs;
      if (v) out.push(text(x, y, String(v), cs * 0.55, { anchor: 'middle', base: 'central', bold: true }));
      else if (answer) out.push(text(x, y, String(s.solution[i]), cs * 0.55, { anchor: 'middle', base: 'central', fill: ANS }));
    });
    return out.join('');
  }

  function tttBoard(x, y, size, k) {
    var c = size / 3;
    return line(x + c, y, x + c, y + size, 0.7 * k) + line(x + 2 * c, y, x + 2 * c, y + size, 0.7 * k) +
      line(x, y + c, x + size, y + c, 0.7 * k) + line(x, y + 2 * c, x + size, y + 2 * c, 0.7 * k);
  }

  // ---------------------------------------------------------------
  // ページ（A5 の座標）。k は字の倍率（ミニブックは 1.9）
  // ---------------------------------------------------------------
  function frame(title, sub, k, no) {
    var out = [];
    var tf = Math.min(8 * k * (k > 1 ? 0.8 : 1), 124 / Array.from(title).length);
    out.push(text(12, 17 * (k > 1 ? 1.35 : 1), title, tf, { bold: true }));
    if (sub) {
      var fs = 4 * k * (k > 1 ? 0.8 : 1), maxC = Math.floor(126 / (fs * 0.92));
      wrap(sub, maxC).forEach(function (l, i) { out.push(text(12, (k > 1 ? 36 : 25.5) + i * fs * 1.35, l, fs, { fill: '#444' })); });
    }
    out.push(pageNo(no, k));
    return out.join('');
  }
  function pageNo(no, k) { return text(W / 2, H - 6 * (k > 1 ? 1.2 : 1), '- ' + no + ' -', 3.6 * k * (k > 1 ? 0.8 : 1), { anchor: 'middle', fill: '#666' }); }
  function body(k) { return k > 1 ? { x: 12, y: 58, w: W - 24, h: 128 } : { x: 12, y: 36, w: W - 24, h: 158 }; }

  var SUBS = {
    maze: 'スタートから ゴールまで、かべを こえずに すすもう。',
    dots: '1 から じゅんばんに せんで つなごう。さいごは 1 に もどろう。',
    words: { r: 'ことばを さがして かこもう。よこ（→）に ならんでいるよ。', rd: 'ことばを さがして かこもう。よこ（→）と たて（↓）に あるよ。', rdx: 'ことばを さがして かこもう。よこ（→）・たて（↓）・ななめ（↘）に あるよ。' },
    sudoku: function (n) { return 'たて・よこ・ふとい わくの なかに、1〜' + n + ' が 1 つずつ はいるように かこう。'; },
  };
  var SCENE_BINGO = {
    train: 'まどの そとや でんしゃの なかで みつけたら ○。たて・よこ・ななめに そろったら ビンゴ！',
    car: 'まどの そとで みつけたら ○。たて・よこ・ななめに そろったら ビンゴ！',
    wait: 'まわりを みて、みつけたら ○。たて・よこ・ななめに そろったら ビンゴ！',
  };
  var SCENE_DRAW = { train: 'まどから みえた ものを かこう', car: 'まどから みえた ものを かこう', wait: 'すきな ものを かこう' };

  function coverPage(book, k) {
    var s = book.state, out = [];
    var title = s.title || B.SCENES[s.scene].title;
    var fs = (k > 1 ? 12 : 10.5), maxC = Math.floor(118 / fs);
    var tl = wrap(title, maxC);
    tl.forEach(function (l, i) { out.push(text(W / 2, 30 + i * fs * 1.3, l, fs, { anchor: 'middle', bold: true })); });
    var ty = 30 + tl.length * fs * 1.3;
    // 場面の小さな絵（てんつなぎの絵を線で）
    var figKey = { train: 'train', car: 'car', wait: 'umbrella' }[s.scene];
    var fig = B.FIGURES.filter(function (x) { return x.key === figKey; })[0];
    var items = book.pages.filter(function (p) { return B.KINDS.indexOf(p.kind) >= 0; });
    var fbox = k > 1 ? { x: 34, y: ty, w: 80, h: 70 } : { x: 34, y: ty, w: 80, h: items.length > 10 ? 36 : 58 };
    out.push(dotsBody({ pts: fig.pts, deco: fig.deco }, fbox, true, 1, true).replace(new RegExp(ANS, 'g'), INK));
    var y = fbox.y + fbox.h + (k > 1 ? 14 : 10), lf = k > 1 ? 8.5 : 5;
    out.push(text(16, y, 'なまえ', lf, {}));
    out.push(line(16 + lf * 3.4, y + 1.5, W - 16, y + 1.5, 0.4));
    if (s.name) out.push(text(16 + lf * 3.8, y - 0.5, s.name, lf * 1.25, { fill: '#aaa' }));
    if (k > 1) return out.join('') + pageNo(1, k);
    y += 13;
    out.push(text(16, y, '　　　がつ　　　にち（　　）', lf, {}));
    y += 13;
    out.push(text(16, y, 'どこへ いく？', lf, {}));
    out.push(line(16 + lf * 6.4, y + 1.5, W - 16, y + 1.5, 0.4));
    // もくじ（できたら ○）
    y += 12;
    out.push(text(16, y, 'もくじ（できたら ○）', 4.4, { bold: true }));
    var cols = items.length > 10 ? 3 : items.length > 5 ? 2 : 1;
    var perCol = Math.ceil(items.length / cols), rowH = cols === 3 ? 5.4 : 6.6, ifs = cols === 3 ? 3.2 : 3.9, colW = cols === 3 ? 40 : 60;
    items.forEach(function (p, i) {
      var col = Math.floor(i / perCol), row = i % perCol;
      var x = 16 + col * colW, yy = y + 7 + row * rowH;
      out.push(circle(x + 2, yy - 1.2, ifs * 0.55, 0.35));
      out.push(text(x + ifs * 1.6, yy, p.no + '. ' + B.KIND_NAMES[p.kind], ifs, {}));
    });
    return out.join('') + pageNo(1, k);
  }

  function backPage(book, k, no) {
    var s = book.state, out = [];
    var big = k > 1;
    out.push(text(W / 2, big ? 40 : 36, 'おしまい！', big ? 16 : 12, { anchor: 'middle', bold: true }));
    var y = big ? 70 : 60, lf = big ? 7.2 : 5;
    out.push(text(16, y, 'いちばん たのしかった ページ', lf, {}));
    out.push(line(16, y + lf * 1.8, W - 16, y + lf * 1.8, 0.4));
    if (!big) {
      out.push(text(16, y + 24, 'つぎは どこへ いきたい？', lf, {}));
      out.push(line(16, y + 34, W - 16, y + 34, 0.4));
      out.push(rect(W / 2 - 24, y + 48, 48, 48, 0.5, SOFT, 24));
      out.push(text(W / 2, y + 102, 'シールや はんこを はろう', 3.8, { anchor: 'middle', fill: '#666' }));
    }
    var cy = H - (big ? 26 : 20), cf = big ? 5.2 : 3.2;
    out.push(text(W / 2, cy, 'もんだい ばんごう ' + C.seedLabel(s.seed), cf, { anchor: 'middle', fill: '#666' }));
    if (s.credit) out.push(text(W / 2, cy + cf * 1.5, CREDIT, cf, { anchor: 'middle', fill: '#666' }));
    return out.join('') + pageNo(no, k);
  }

  function duoPage(p, k, no) {
    var out = [];
    var d = p.duo;
    if (!d.dots) {
      out.push(frame('まるばつ ゲーム', 'ふたりで じゅんばんに ○ と × を かこう。さきに 3 つ ならべたら かち。', k, no));
      var bx = body(k), size = Math.min((bx.w - 16) / 2, (bx.h - 16) / (k > 1 ? 2 : 3));
      var rows = k > 1 ? 2 : 3;
      for (var r = 0; r < rows; r++) for (var c = 0; c < 2; c++) {
        out.push(tttBoard(bx.x + 4 + c * (size + 8), bx.y + 4 + r * (size + 8), size, k));
      }
      return out.join('');
    }
    out.push(frame('ふたりで あそぼう', '', k, no));
    var fs = 4 * k;
    out.push(text(12, 27, 'まるばつ: ○ と × を じゅんばんに。3 つ ならべたら かち。', 3.8, { fill: '#444' }));
    var size2 = 38;
    for (var i = 0; i < 3; i++) out.push(tttBoard(12 + i * (size2 + 7.25), 32, size2, 1));
    var y0 = 86;
    out.push(text(12, y0, 'じんとり: となりの てんを 1 ぽん つなぐ。しかくを かこんだら', 3.8, { fill: '#444' }));
    out.push(text(12, y0 + 5.2, 'じぶんの しるしを かいて もう 1 かい。しかくが おおい ほうの かち。', 3.8, { fill: '#444' }));
    var n = d.dots, gap = 96 / (n - 1), gx = (W - 96) / 2, gy = y0 + 14;
    for (var yy = 0; yy < n; yy++) for (var xx = 0; xx < n; xx++) {
      out.push('<circle cx="' + f(gx + xx * gap) + '" cy="' + f(gy + yy * gap) + '" r="1.1" fill="' + INK + '"/>');
    }
    void fs;
    return out.join('');
  }

  function drawPage(book, p, k, no) {
    var s = book.state, out = [];
    var free = p.kind === 'free';
    var title = free ? 'じゆうちょう' : SCENE_DRAW[s.scene];
    out.push(frame(title, '', k, no));
    var bx = body(k);
    var withNote = !free && s.age !== 'y' && k === 1;
    var fh = withNote ? 100 : bx.h - 4;
    out.push(rect(bx.x, bx.y - 6, bx.w, fh, 0.6, INK, 3));
    if (withNote) {
      var y = bx.y - 6 + fh + 10;
      ['どこで みた？', 'なにが たのしかった？'].forEach(function (q, i) {
        out.push(text(bx.x, y + i * 22, q, 4.4, {}));
        out.push(line(bx.x, y + i * 22 + 10, bx.x + bx.w, y + i * 22 + 10, 0.35, SOFT));
      });
    } else if (!free && k === 1) {
      out.push(text(bx.x, bx.y - 6 + fh + 0, '', 1, {}));
    }
    return out.join('');
  }

  function answersPage(book, p, k, no) {
    var out = [];
    out.push(frame('こたえ', '', k, no));
    var bx = body(k), cols = 2, rows = k > 1 ? 2 : 3;
    var cw = bx.w / cols, ch = bx.h / rows;
    p.items.forEach(function (it, i) {
      var c = i % cols, r = Math.floor(i / cols);
      var x = bx.x + c * cw, y = bx.y + r * ch;
      var cap = it.page + 'ページ ' + B.KIND_NAMES[it.src.kind];
      out.push(text(x + 2, y + 3.5 * (k > 1 ? 1.6 : 1), cap, 3.5 * (k > 1 ? 1.5 : 1), { bold: true }));
      var box = { x: x + 3, y: y + (k > 1 ? 10 : 7), w: cw - 6, h: ch - (k > 1 ? 13 : 10) };
      var src = it.src;
      if (src.kind === 'maze') out.push(mazeBody(src.maze, box, true, 0.55));
      if (src.kind === 'dots') out.push(dotsBody(src.dots, box, true, 0.6, true));
      if (src.kind === 'words') out.push(wordsBody(src.words, box, true, 0.6, true));
      if (src.kind === 'sudoku') out.push(sudokuBody(src.sudoku, box, true, 0.6));
    });
    return out.join('');
  }

  /** 1 ページの SVG の中身（<svg> の中）。book は Book.buildBook の結果 */
  function pageInner(book, p) {
    var k = book.mini ? 1.9 : 1, no = p.no, bx = body(k), s = book.state;
    switch (p.kind) {
      case 'cover': return coverPage(book, k);
      case 'back': return backPage(book, k, no);
      case 'answers': return answersPage(book, p, k, no);
      case 'maze': return frame('めいろ', SUBS.maze, k, no) + mazeBody(p.maze, bx, false, k);
      case 'dots': return frame('てんつなぎ', SUBS.dots, k, no) + dotsBody(p.dots, bx, false, k > 1 ? 1.5 : 1);
      case 'bingo': return frame('みつけたら ビンゴ', SCENE_BINGO[s.scene], k, no) + bingoBody(p.bingo, { x: bx.x, y: bx.y + (k > 1 ? 4 : 6), w: bx.w, h: bx.h - 10 }, k > 1 ? 1.35 : 1);
      case 'words': return frame('ことばさがし', SUBS.words[p.words.dirs], k, no) + wordsBody(p.words, { x: bx.x, y: bx.y + 4, w: bx.w, h: bx.h - 4 }, false, k > 1 ? 1.6 : 1);
      case 'sudoku': return frame('すうじパズル', SUBS.sudoku(p.sudoku.n), k, no) + sudokuBody(p.sudoku, bx, false, k > 1 ? 1.4 : 1);
      case 'duo': return duoPage(p, k, no);
      case 'draw': case 'free': return drawPage(book, p, k, no);
    }
    return '';
  }
  function pageSvg(book, p, cls) {
    return '<svg class="' + (cls || 'pg-svg') + '" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' +
      esc(p.no + 'ページ ' + (B.KIND_NAMES[p.kind] || { cover: 'ひょうし', back: 'うらびょうし', answers: 'こたえ', free: 'じゆうちょう' }[p.kind])) +
      '" font-family="\'Noto Sans JP\', \'Noto Sans CJK JP\', \'Hiragino Sans\', \'Hiragino Kaku Gothic ProN\', Meiryo, sans-serif">' +
      '<rect width="' + W + '" height="' + H + '" fill="#fff"/>' + pageInner(book, p) + '</svg>';
  }

  // ---------------------------------------------------------------
  // 印刷する紙（A4 よこ 297×210mm）。面付けは Book.impose
  // ---------------------------------------------------------------
  function sheetsHtml(book) {
    var s = book.state, n = book.pages.length;
    var faces = B.impose(s.layout, n, s.flip);
    var L = B.LAYOUTS[s.layout];
    return faces.map(function (fc, fi) {
      var slots = fc.slots.map(function (x) {
        var p = book.pages[x.page - 1];
        var st = 'left:' + f(x.col * L.pageW) + 'mm;top:' + f(x.row * L.pageH) + 'mm;width:' + L.pageW + 'mm;height:' + L.pageH + 'mm;' + (x.rot ? 'transform:rotate(180deg);' : '');
        return '<div class="slot" data-page="' + x.page + '" style="' + st + '">' + pageSvg(book, p) + '</div>';
      }).join('');
      var marks = '';
      if (s.layout === 'a5') marks = '<i class="mk mk-fold-t"></i><i class="mk mk-fold-b"></i>';
      if (s.layout === 'cut') marks = '<i class="mk mk-cut"></i>';
      if (s.layout === 'mini') marks = '<i class="mk mk-mini-h"></i><i class="mk mk-mini-cut"></i><i class="mk mk-mini-v1"></i><i class="mk mk-mini-v2"></i><i class="mk mk-mini-v3"></i>';
      var label = s.layout === 'a5' ? (fc.sheet + 1) + ' まいめの ' + (fc.side === 'front' ? 'おもて' : 'うら') : (fc.sheet + 1) + ' まいめ';
      return '<div class="bsheet lay-' + s.layout + (fc.rot ? ' rot180' : '') + '" data-face="' + fi + '" data-side="' + fc.side + '" aria-label="' + esc(label) + '">' +
        '<div class="bsheet-in"><div class="bsheet-face">' + slots + marks + '</div></div></div>';
    }).join('');
  }

  var api = { pageSvg: pageSvg, sheetsHtml: sheetsHtml, wrap: wrap, esc: esc, CREDIT: CREDIT, W: W, H: H };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BookPages = api;
})(this);
