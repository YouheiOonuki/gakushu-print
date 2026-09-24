// ===========================
// 学習プリントメーカー — プリント（A4 縦 1 枚ずつ）の HTML を作る
// calc.js の buildWorkbook の中身から、問題のページと答えのページを組み立てる。DOM には触らない（文字列を返す）
// 画面の見本と印刷は、同じこの HTML を使う（Ctrl+P でも、いまの見本がそのまま印刷される）
// ブラウザでは window.Sheets、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var Calc = root.Calc || (typeof require !== 'undefined' ? require('./calc.js') : null);
  var TX = root.TEXT || (typeof require !== 'undefined' ? require('./text.js') : null);
  // 紙に入る文言。render の lang で選ぶ（省くと日本語。日本語ページの出力は前と同じ）
  var L = TX.sheet.ja, LANG = 'ja';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  var OP_SIGN = { '+': '＋', '-': '−', '×': '×' };
  var LEVEL_KIDS = {
    d1: '1けた と 1けた', teen: '10いくつ と 1けた', d2d1: '2けた と 1けた', d2d2: '2けた と 2けた', d3d2: '3けた と 2けた', d3d3: '3けた と 3けた',
  };

  // ---------------------------------------------------------------
  // 見出し（題・なまえ・日付・点数）
  // ---------------------------------------------------------------
  function title(page, state) {
    var o = state[state.type];
    switch (page.kind) {
      case 'arith': {
        var op = o.op === 'add' ? 'たしざん' : o.op === 'sub' ? 'ひきざん' : 'たしざん・ひきざん';
        var c = o.carry === 'none' ? (o.op === 'add' ? 'くりあがり なし' : o.op === 'sub' ? 'くりさがり なし' : 'くりあがり・くりさがり なし')
          : o.carry === 'with' ? (o.op === 'add' ? 'くりあがり あり' : o.op === 'sub' ? 'くりさがり あり' : 'くりあがり・くりさがり あり') : '';
        return { main: op, sub: LEVEL_KIDS[o.level] + (c ? '（' + c + '）' : '') + (o.style === 'tate' ? '・ひっさん' : '') };
      }
      case 'kuku':
        return { main: 'かけざん（九九）', sub: o.dans.join('・') + ' のだん' + (o.order === 'random' ? '（ばらばら）' : o.order === 'rev' ? '（ぎゃくから）' : '') };
      case 'hyaku':
        return { main: (o.size === 10 ? 'ひゃくます' : '25ます') + ' けいさん', sub: o.op === 'add' ? 'たしざん' : o.op === 'sub' ? 'ひきざん' : 'かけざん' };
      case 'clock':
        return { main: o.mode === 'read' ? 'とけいの よみかた' : 'とけいの はりを かこう', sub: { hour: 'なんじ', half: 'なんじ・なんじはん', five: '5ふん きざみ', min: '1ぷん きざみ' }[o.level] };
      case 'kana':
        return { main: L.kanaTitle(o.script === 'kata'), sub: '' };
      case 'genko':
        return { main: o.layout === 'grid' ? L.gridTitle() : L.genkoTitle(), sub: L.genkoSub(o.layout, o.size) };
      case 'kanji':
        return { main: L.kanjiTitle(), sub: L.kanjiSub(o.grade) };
      case 'maze':
        return { main: 'めいろ', sub: { easy: 'かんたん', normal: 'ふつう', hard: 'むずかしい' }[o.level] };
    }
    return { main: '', sub: '' };
  }

  function instruction(page, state, answer) {
    var o = state[state.type];
    if (answer) return '';
    switch (page.kind) {
      case 'arith': case 'kuku': return 'けいさん しましょう。';
      case 'hyaku':
        return o.op === 'sub' ? 'うえの かずから、' + (o.hand === 'left' ? 'みぎ' : 'ひだり') + 'の かずを ひきましょう。'
          : (o.hand === 'left' ? 'うえと みぎの' : 'うえと ひだりの') + ' かずを ' + (o.op === 'add' ? 'たしましょう。' : 'かけましょう。');
      case 'clock': return o.mode === 'read' ? 'なんじ なんぷん ですか。' : 'とけいに ながい はりと みじかい はりを かきましょう。';
      case 'kana': case 'kanji': return L.traceInst;
      case 'maze': return 'スタートから ゴールまで いきましょう。';
    }
    return '';
  }

  function scoreBox(page, state) {
    if (!state.common.showScore) return '';
    var n;
    if (page.kind === 'arith' || page.kind === 'kuku' || page.kind === 'clock') n = page.items.length;
    else if (page.kind === 'hyaku') n = page.grids.reduce(function (s, g) { return s + g.top.length * g.left.length; }, 0);
    else return '';
    var time = page.kind === 'hyaku'
      ? '<span class="f f-time"><span class="lbl">じかん</span><span class="box sm"></span>ふん<span class="box sm"></span>びょう</span>' : '';
    return '<span class="f f-score"><span class="lbl">せいかい</span><span class="box sm"></span>／' + n + '</span>' + time;
  }

  function header(page, state, answer, pageNo, pageTotal) {
    var c = state.common, t = title(page, state);
    var fields = '';
    if (c.showName) {
      fields += '<span class="f f-name"><span class="lbl">' + L.name + '</span><span class="box name">' +
        (c.name ? '<span class="' + (c.nameTrace ? 'name-trace' : 'name-dark') + '">' + esc(c.name) + '</span>' : '') + '</span></span>';
    }
    if (c.showDate) {
      fields += L.date ? '<span class="f f-date"><span class="lbl">' + L.date + '</span><span class="box date"></span></span>'
        : '<span class="f f-date"><span class="box xs"></span>' + L.month + '<span class="box xs"></span>' + L.day + '</span>';
    }
    fields += scoreBox(page, state);
    var ins = instruction(page, state, answer);
    return '<header class="sh-head">' +
      '<div class="sh-title"><h3>' + esc(t.main) + (answer ? ' <span class="ans-badge">こたえ</span>' : '') + '</h3>' +
      (t.sub ? '<p class="sh-sub">' + esc(t.sub) + '</p>' : '') +
      (pageTotal > 1 ? '<p class="sh-page">' + pageNo + ' / ' + pageTotal + '</p>' : '') + '</div>' +
      (fields ? '<div class="sh-fields">' + fields + '</div>' : '') +
      '</header>' + (ins ? '<p class="sh-inst">' + esc(ins) + '</p>' : '');
  }

  function footer(state, hasSeed) {
    return '<footer class="sh-foot">' +
      '<span>' + (hasSeed ? esc(L.seedNo) + Calc.seedLabel(state.seed) : '') + '</span>' +
      (state.common.credit ? '<span class="credit">' + esc(L.credit) + '</span>' : '<span></span>') +
      '</footer>';
  }

  // ---------------------------------------------------------------
  // 各種類の本文
  // ---------------------------------------------------------------
  function arithBody(page, answer) {
    if (page.style === 'tate') return hissanBody(page, answer);
    var rows = Math.ceil(page.count / 2);
    var html = '<ol class="ar ar-c' + page.count + '" style="grid-template-rows:repeat(' + rows + ',1fr)">';
    page.items.forEach(function (p, i) {
      var ans = Calc.answerOf(p);
      html += '<li><span class="no">(' + (page.startNo + i) + ')</span><span class="ex">' + p.a + ' ' + OP_SIGN[p.op] + ' ' + p.b + ' ＝</span>' +
        '<span class="ansbox">' + (answer ? '<span class="ans-fill">' + ans + '</span>' : '') + '</span></li>';
    });
    return html + '</ol>';
  }

  /** 筆算（たての計算）。位をそろえるため、数字を 1 けたずつマスに入れる */
  function hissanBody(page, answer) {
    var width = 1;
    page.items.forEach(function (p) { width = Math.max(width, String(p.a).length, String(p.b).length, String(Calc.answerOf(p)).length); });
    var colsN = width + 1;   // 左の 1 列は記号
    var digits = function (n, cls) {
      var s = String(n), pad = colsN - s.length, out = '';
      for (var i = 0; i < colsN; i++) out += '<span class="d' + (cls ? ' ' + cls : '') + '">' + (i >= pad ? s[i - pad] : '') + '</span>';
      return out;
    };
    var html = '<ol class="hs hs-c' + page.count + '">';
    page.items.forEach(function (p, i) {
      var bottom = digits(p.b).replace('<span class="d">', '<span class="d op">' + OP_SIGN[p.op]);
      html += '<li><span class="no">(' + (page.startNo + i) + ')</span>' +
        '<div class="hs-box" style="grid-template-columns:repeat(' + colsN + ',1fr)">' +
        digits(p.a) + bottom +
        '<span class="hs-line" style="grid-column:1/span ' + colsN + '"></span>' +
        (answer ? digits(Calc.answerOf(p), 'ans-fill') : digits('', 'blank')) +
        '</div></li>';
    });
    return html + '</ol>';
  }

  function hyakuBody(page, answer) {
    var html = '<div class="hy-wrap hy-' + page.size + '">';
    page.grids.forEach(function (g) {
      var left = page.hand === 'left';
      var sign = OP_SIGN[g.op === 'add' ? '+' : g.op === 'sub' ? '-' : '×'];
      var tops = g.top.map(function (t) { return '<th>' + t + '</th>'; }).join('');
      var corner = '<th class="corner">' + sign + '</th>';
      var head = '<tr>' + (left ? tops + corner : corner + tops) + '</tr>';   // 左利き用は、左の数を右側に置く
      var body = g.left.map(function (l, r) {
        var cells = g.cells[r].map(function (v) { return '<td>' + (answer ? '<span class="ans-fill">' + v + '</span>' : '') + '</td>'; }).join('');
        return '<tr>' + (left ? cells + '<th>' + l + '</th>' : '<th>' + l + '</th>' + cells) + '</tr>';
      }).join('');
      html += '<table class="hy">' + head + body + '</table>';
    });
    return html + '</div>';
  }

  /** 時計の SVG（viewBox -110..110）。guide で 5・10・…・55 の分の数字を外側に出す */
  function clockSvg(t, showHands, guide, answerHands) {
    var s = '<svg class="clk" viewBox="-110 -110 220 220" role="img" aria-label="とけい">';
    s += '<circle r="88" class="clk-face"/>';
    for (var i = 0; i < 60; i++) {
      var a = i * 6 * Math.PI / 180, big = i % 5 === 0;
      var r1 = 88, r2 = big ? 77 : 82;
      s += '<line x1="' + (Math.sin(a) * r1).toFixed(2) + '" y1="' + (-Math.cos(a) * r1).toFixed(2) + '" x2="' + (Math.sin(a) * r2).toFixed(2) + '" y2="' + (-Math.cos(a) * r2).toFixed(2) + '" class="' + (big ? 'tk-b' : 'tk') + '"/>';
    }
    for (var h = 1; h <= 12; h++) {
      var b = h * 30 * Math.PI / 180;
      s += '<text x="' + (Math.sin(b) * 63).toFixed(2) + '" y="' + (-Math.cos(b) * 63 + 7.5).toFixed(2) + '" class="num">' + h + '</text>';
      if (guide) s += '<text x="' + (Math.sin(b) * 99).toFixed(2) + '" y="' + (-Math.cos(b) * 99 + 3.5).toFixed(2) + '" class="gnum">' + (h * 5 % 60 || 60) + '</text>';
    }
    if (showHands) {
      var an = Calc.handAngles(t);
      var cls = answerHands ? ' hand-ans' : '';
      s += '<line x1="0" y1="0" x2="' + (Math.sin(an.hour * Math.PI / 180) * 46).toFixed(2) + '" y2="' + (-Math.cos(an.hour * Math.PI / 180) * 46).toFixed(2) + '" class="hand-h' + cls + '"/>';
      s += '<line x1="0" y1="0" x2="' + (Math.sin(an.minute * Math.PI / 180) * 80).toFixed(2) + '" y2="' + (-Math.cos(an.minute * Math.PI / 180) * 80).toFixed(2) + '" class="hand-m' + cls + '"/>';
    }
    s += '<circle r="4" class="clk-dot"/></svg>';
    return s;
  }

  function clockBody(page, answer) {
    var html = '<ol class="ck ck-c' + page.count + '">';
    page.items.forEach(function (t, i) {
      var label;
      if (page.mode === 'read') {
        label = answer ? '<span class="ans-fill">' + Calc.clockText(t) + '</span>'
          : page.level === 'hour' ? '（　　　）じ' : '（　　　）じ（　　　）ふん';
      } else {
        label = Calc.clockText(t);
      }
      html += '<li><span class="no">(' + (page.startNo + i) + ')</span>' +
        clockSvg(t, page.mode === 'read' || answer, page.guide, answer && page.mode === 'draw') +
        '<span class="ck-label">' + label + '</span></li>';
    });
    return html + '</ol>';
  }

  function traceBody(page) {
    var sz = Calc.TRACE_SIZES[page.size];
    var html = '<div class="tr tr-' + page.size + '"' + (LANG === 'ja' ? '' : ' lang="ja"') + ' style="--cell:' + sz.mm + 'mm">';
    page.rows.forEach(function (row) {
      html += '<div class="tr-row">' + row.map(function (c) {
        return '<span class="tc tc-' + c.kind + '">' + (c.ro ? '<span class="ro" lang="en">' + esc(c.ro) + '</span>' : '') + (c.ch ? esc(c.ch) : '') + '</span>';
      }).join('') + '</div>';
    });
    return html + '</div>';
  }

  /** 迷路の SVG。1 マスを 10 とする座標。答えのページは道を線で引く */
  function mazeBody(page, answer) {
    var m = page.maze, W = m.cols * 10, H = m.rows * 10;
    var d = '';
    for (var y = 0; y < m.rows; y++) {
      for (var x = 0; x < m.cols; x++) {
        var w = m.walls[y * m.cols + x], X = x * 10, Y = y * 10;
        if ((w & 1) && !(y === 0 && x === 0)) d += 'M' + X + ' ' + Y + 'h10';
        if (w & 8) d += 'M' + X + ' ' + Y + 'v10';
        if (x === m.cols - 1 && (w & 2)) d += 'M' + (X + 10) + ' ' + Y + 'v10';
        if (y === m.rows - 1 && (w & 4) && x !== m.cols - 1) d += 'M' + X + ' ' + (Y + 10) + 'h10';
      }
    }
    var sw = { easy: 1.6, normal: 1.1, hard: 0.8 }[page.level] || 1;
    var svg = '<svg class="mz" viewBox="-2 -14 ' + (W + 4) + ' ' + (H + 28) + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="めいろ">';
    svg += '<text x="5" y="-4" class="mz-lbl">スタート ↓</text>';
    svg += '<text x="' + (W - 5) + '" y="' + (H + 11) + '" class="mz-lbl end">ゴール ↓</text>';
    svg += '<path d="' + d + '" class="mz-wall" stroke-width="' + sw + '"/>';
    if (answer) {
      var pts = ['5,-2'];
      m.path.forEach(function (c) { var x = c % m.cols, y = (c - x) / m.cols; pts.push((x * 10 + 5) + ',' + (y * 10 + 5)); });
      pts.push((W - 5) + ',' + (H + 2));
      svg += '<polyline points="' + pts.join(' ') + '" class="mz-path" stroke-width="' + (sw * 1.8) + '"/>';
    }
    return '<div class="mz-wrap">' + svg + '</svg></div>';
  }

  /**
   * 原稿用紙とマス目（SVG）。400 字詰は マス 10・行間 3 の座標で描いて本文の大きさに合わせて縮め、
   * 練習用のマス目は 1 単位 = 1mm で描いて原寸にする（ますの大きさが選んだ mm になる）
   */
  function genkoBody(page) {
    var d = '', g = '';
    var line = function (x1, y1, x2, y2) { return 'M' + x1 + ' ' + y1 + (x1 === x2 ? 'V' + y2 : 'H' + x2); };
    if (page.layout === 'grid') {
      var s = page.size, W = page.cols * s, H = page.rows * s, i;
      for (i = 0; i <= page.cols; i++) d += line(i * s, 0, i * s, H);
      for (i = 0; i <= page.rows; i++) d += line(0, i * s, W, i * s);
      if (page.guides) {
        for (i = 0; i < page.cols; i++) g += line(i * s + s / 2, 0, i * s + s / 2, H);
        for (i = 0; i < page.rows; i++) g += line(0, i * s + s / 2, W, i * s + s / 2);
      }
      return '<div class="gk-wrap"><svg class="gk" width="' + W + 'mm" height="' + H + 'mm" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">' +
        (g ? '<path d="' + g + '" class="gk-guide" stroke-dasharray="' + (s / 20) + ' ' + (s / 20) + '"/>' : '') +
        '<path d="' + d + '" class="gk-line"/></svg></div>';
    }
    // 400 字詰: 20 字の列（たて書き）または行（よこ書き）を 20 本。列と列のあいだは ふりがな・句読点の欄
    var c = page.cell, gap = page.gap, n = page.cols, len = n * c, span = n * c + (n + 1) * gap, k, j;
    var vert = page.layout === 'v';
    for (k = 0; k < n; k++) {
      var a = gap + k * (c + gap);    // 列（行）の始まり
      for (j = 0; j <= n; j++) d += vert ? line(a, j * c, a + c, j * c) : line(j * c, a, j * c, a + c);
      d += vert ? line(a, 0, a, len) + line(a + c, 0, a + c, len) : line(0, a, len, a) + line(0, a + c, len, a + c);
    }
    var VW = vert ? span : len, VH = vert ? len : span;
    return '<div class="gk-wrap"><svg class="gk gk-fit" viewBox="-1 -1 ' + (VW + 2) + ' ' + (VH + 2) + '" preserveAspectRatio="xMidYMin meet" aria-hidden="true">' +
      '<path d="' + d + '" class="gk-line"/><rect x="0" y="0" width="' + VW + '" height="' + VH + '" class="gk-frame"/></svg></div>';
  }

  function body(page, answer) {
    switch (page.kind) {
      case 'arith': case 'kuku': return arithBody(page, answer);
      case 'hyaku': return hyakuBody(page, answer);
      case 'clock': return clockBody(page, answer);
      case 'kana': case 'kanji': return traceBody(page);
      case 'maze': return mazeBody(page, answer);
      case 'genko': return genkoBody(page);
    }
    return '';
  }

  /**
   * 印刷するページの HTML を作る
   * @param {object} wb calc.js buildWorkbook の戻り値
   * @param {object} state normalizeState 済み
   * @param {string} [lang] 紙に入る文言の言語（'ja' 既定・'en'）
   * @returns {{html: string, questions: number, answers: number, total: number}}
   */
  function render(wb, state, lang) {
    LANG = lang === 'en' ? 'en' : 'ja';
    L = TX.sheet[LANG];
    var mode = wb.hasAnswers ? state.common.answers : 'q';
    var paper = state.common.paper === 'letter' ? ' paper-letter' : '';   // A4 のときはクラスを足さない（日本語ページの出力は前のまま）
    var seeded = !(wb.type === 'kana' || wb.type === 'genko' || (wb.type === 'kanji' && state.kanji.source !== 'random') ||
      (wb.type === 'kuku' && state.kuku.order !== 'random'));
    var out = [], q = 0, a = 0;
    var n = wb.pages.length;
    var one = function (page, answer) {
      out.push('<section class="sheet sheet-' + page.kind + paper + (answer ? ' sheet-answer' : '') + '" data-kind="' + page.kind + '" data-answer="' + (answer ? 1 : 0) + '">' +
        header(page, state, answer, page.index + 1, n) +
        '<div class="sh-body">' + body(page, answer) + '</div>' +
        footer(state, seeded) + '</section>');
    };
    if (mode !== 'a') wb.pages.forEach(function (p) { one(p, false); q++; });
    if (mode !== 'q') wb.pages.forEach(function (p) { one(p, true); a++; });
    return { html: out.join(''), questions: q, answers: a, total: q + a };
  }

  var api = { render: render, clockSvg: clockSvg, esc: esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sheets = api;
})(this);
