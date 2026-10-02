// ===========================
// 暗記カード — カードの読み取り（CSV・タブ区切り）・面付け（名刺 10 面／A4 2 面、両面で表と裏が重なる並び）・紙の HTML
// 画面から切り離した純粋関数。ブラウザでは window.Anki、Node（テスト）では module.exports で使う
// 企画は yorozu-plans の docs/54_暗記カードと時計.md（ROADMAP K50）
// ===========================
(function (root) {
  'use strict';

  var K = root.Constants || (typeof require !== 'undefined' ? require('../constants.js') : null);
  var CARD = K.ankiCard.value;   // 名刺サイズ（constants.js。出典と確認日もそこ）

  var MAX_CARDS = 500;        // 1 組のカードの上限（A4 2 面で 250 枚＝500 ページ。それより多い組は分けてもらう）
  var MAX_SIDE = 200;         // 1 面の字数の上限（名刺の大きさで読める量）
  var MAX_TEXT = 60000;       // 入力欄の字数の上限（保存の大きさを抑える）
  var RED = '#e60012';        // 赤シートで消える赤（ACCEPTANCE 3 章「赤 #e60012 相当」）

  // 紙の上の位置（mm）。A4 たて 210×297
  // 名刺: 91×55mm（constants.js の ankiCard。市販の 10 面のカード用紙と同じ大きさ）を 2 列×5 段、紙のまん中に置く
  // A4 2 面: 紙を上下に 2 つに切る（210×148.5mm）
  var PAPER = { w: 210, h: 297 };
  var LAYOUTS = {
    meishi: {
      cols: CARD.cols, rows: CARD.rows, w: CARD.w, h: CARD.h,
      left: (PAPER.w - CARD.cols * CARD.w) / 2, top: (PAPER.h - CARD.rows * CARD.h) / 2,   // 14mm・11mm
      pad: 4, maxPt: 26, minPt: 6, label: '名刺サイズ 10 面',
    },
    a4half: { cols: 1, rows: 2, w: 210, h: 148.5, left: 0, top: 0, pad: 14, maxPt: 72, minPt: 10, label: 'A4 2 面（はがきより大きい）' },
  };

  // ---------------------------------------------------------------
  // 読み取り
  // ---------------------------------------------------------------
  /** CSV／タブ区切りを行と列に分ける（RFC 4180 の引用符。"" は " 1 つ、引用符の中の改行・区切りはそのまま） */
  function splitRows(text, delim) {
    var rows = [], row = [], cell = '', q = false, i = 0, s = String(text || '');
    while (i < s.length) {
      var ch = s[i];
      if (q) {
        if (ch === '"') {
          if (s[i + 1] === '"') { cell += '"'; i += 2; continue; }
          q = false; i++; continue;
        }
        cell += ch; i++; continue;
      }
      if (ch === '"' && cell.trim() === '') { q = true; cell = ''; i++; continue; }
      if (ch === delim) { row.push(cell); cell = ''; i++; continue; }
      if (ch === '\r' || ch === '\n') {
        row.push(cell); rows.push(row); row = []; cell = '';
        if (ch === '\r' && s[i + 1] === '\n') i++;
        i++; continue;
      }
      cell += ch; i++;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  /** 区切りを決める: 最初の空でない行に（引用符の外で）タブがあればタブ、なければカンマ */
  function detectDelim(text) {
    var lines = String(text || '').split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '') continue;
      return lines[i].replace(/"[^"]*"/g, '').indexOf('\t') >= 0 ? '\t' : ',';
    }
    return ',';
  }

  var HEAD_FRONT = /^(表|おもて|オモテ|問題|もんだい|front|question|q)$/i;
  var HEAD_BACK = /^(裏|うら|ウラ|答え|こたえ|答|back|answer|a)$/i;

  /**
   * カードを読む。1 行に 1 枚「表,裏」（タブ区切りも可。Excel・Google スプレッドシートから 2 列を貼る）
   * @returns {{cards: {f: string, b: string}[], notes: string[], delim: string}}
   */
  function parseCards(text) {
    var src = String(text || '').slice(0, MAX_TEXT).replace(/^﻿/, '');
    var delim = detectDelim(src);
    var rows = splitRows(src, delim);
    var cards = [], notes = [], extra = 0, long = 0, emptyBack = 0, over = 0, first = true;
    rows.forEach(function (r, i) {
      var cells = r.map(function (c) { return c.replace(/\r\n?/g, '\n').trim(); });
      if (cells.every(function (c) { return c === ''; })) return;
      if (first) {
        first = false;
        if (cells.length >= 2 && HEAD_FRONT.test(cells[0]) && HEAD_BACK.test(cells[1])) { notes.push('1 行目（' + cells[0] + '・' + cells[1] + '）は見出しとして使いません。'); return; }
      }
      if (cells.length > 2 && cells.slice(2).some(function (c) { return c !== ''; })) extra++;
      var f = cells[0] || '', b = cells[1] || '';
      if (f.length > MAX_SIDE || b.length > MAX_SIDE) { long++; f = f.slice(0, MAX_SIDE); b = b.slice(0, MAX_SIDE); }
      if (b === '') emptyBack++;
      if (cards.length >= MAX_CARDS) { over++; return; }
      cards.push({ f: f, b: b, line: i + 1 });
    });
    if (extra) notes.push('3 列目から後は使いません（' + extra + ' 行）。');
    if (long) notes.push(MAX_SIDE + ' 字をこえた面は、' + MAX_SIDE + ' 字までにしました（' + long + ' 枚）。');
    if (emptyBack) notes.push('裏が空のカードがあります（' + emptyBack + ' 枚）。区切りはカンマ（,）かタブです。');
    if (over) notes.push('カードは ' + MAX_CARDS + ' 枚までです（' + over + ' 枚は使いません）。');
    return { cards: cards, notes: notes, delim: delim };
  }

  /** CSV に書き出す（Excel で開けるよう CRLF。, " 改行を含む面は引用符で囲む） */
  function toCsv(cards) {
    var q = function (s) { s = String(s); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return ['表,裏'].concat(cards.map(function (c) { return q(c.f) + ',' + q(c.b); })).join('\r\n') + '\r\n';
  }

  /** 1 行を入力欄の形にする（「1 枚ずつ足す」）。区切りはいまの入力欄に合わせる */
  function lineOf(f, b, delim) {
    var q = function (s) {
      s = String(s).trim();
      return (delim === '\t' ? /["\t\r\n]/ : /[",\r\n]/).test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return q(f) + (delim === '\t' ? '\t' : ',') + q(b);
  }

  // ---------------------------------------------------------------
  // 設定
  // ---------------------------------------------------------------
  function defaults() {
    return {
      title: '', text: '', layout: 'meishi', red: false, sides: 'both', binding: 'long',
      cut: true, num: true, credit: true, order: 'seq', start: 'f',
    };
  }
  function oneOf(v, list, d) { return list.indexOf(v) >= 0 ? v : d; }
  function bool(v, d) { return v === undefined ? d : !!v; }
  function normalize(v) {
    var o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}, d = defaults();
    return {
      title: typeof o.title === 'string' ? o.title.slice(0, 40) : '',
      text: typeof o.text === 'string' ? o.text.slice(0, MAX_TEXT) : '',
      layout: oneOf(o.layout, Object.keys(LAYOUTS), d.layout),
      red: bool(o.red, d.red),
      sides: oneOf(o.sides, ['both', 'front', 'back'], d.sides),
      binding: oneOf(o.binding, ['long', 'short'], d.binding),
      cut: bool(o.cut, d.cut), num: bool(o.num, d.num), credit: bool(o.credit, d.credit),
      order: oneOf(o.order, ['seq', 'random'], d.order),
      start: oneOf(o.start, ['f', 'b'], d.start),
    };
  }

  // ---------------------------------------------------------------
  // 面付け
  // ---------------------------------------------------------------
  /**
   * 表の位置 (r, c) のうらにあたる、裏のページでの位置。
   * 長辺とじ（たての紙を左右にめくる。ふつうの両面印刷）は左右が入れかわる。短辺とじ（上にめくる）は上下が入れかわる
   */
  function backSlot(r, c, L, binding) {
    return binding === 'short' ? { r: L.rows - 1 - r, c: c } : { r: r, c: L.cols - 1 - c };
  }
  function slotBox(r, c, L) {
    return { x: L.left + c * L.w, y: L.top + r * L.h, w: L.w, h: L.h };
  }

  /**
   * ページの並びを作る
   * - 両面（both）: 表 1 → 裏 1 → 表 2 → 裏 2 …（両面印刷で 1 枚の紙の表と裏になる）
   * - 表だけ（front）／裏だけ（back）: 片面ずつ印刷して、紙を入れなおすとき。裏だけのページも両面と同じ並び
   * - 赤シート（red）: 1 面に表（黒）と裏（赤）。片面だけ
   * @returns {{side: 'f'|'b'|'r', sheet: number, slots: {i: number, r: number, c: number, x: number, y: number, w: number, h: number}[]}[]}
   */
  function layoutPages(n, o) {
    var L = LAYOUTS[o.layout] || LAYOUTS.meishi, per = L.cols * L.rows, pages = [];
    var sheets = Math.ceil(n / per);
    for (var s = 0; s < sheets; s++) {
      var fr = [], bk = [];
      for (var k = 0; k < per; k++) {
        var i = s * per + k;
        if (i >= n) break;
        var r = Math.floor(k / L.cols), c = k % L.cols;
        var fb = slotBox(r, c, L);
        fr.push({ i: i, r: r, c: c, x: fb.x, y: fb.y, w: fb.w, h: fb.h });
        var bs = backSlot(r, c, L, o.binding), bb = slotBox(bs.r, bs.c, L);
        bk.push({ i: i, r: bs.r, c: bs.c, x: bb.x, y: bb.y, w: bb.w, h: bb.h });
      }
      if (o.red) { pages.push({ side: 'r', sheet: s, slots: fr }); continue; }
      if (o.sides !== 'back') pages.push({ side: 'f', sheet: s, slots: fr });
      if (o.sides !== 'front') pages.push({ side: 'b', sheet: s, slots: bk });
    }
    return pages;
  }

  /**
   * 紙を裏返したとき、裏のページの点 (x, y) が表のページのどこの真うらにあるか（mm）。テストで面付けを確かめる
   * 長辺とじ: 左右を反転、短辺とじ: 上下を反転
   */
  function flipPoint(x, y, binding) {
    return binding === 'short' ? { x: x, y: PAPER.h - y } : { x: PAPER.w - x, y: y };
  }

  // ---------------------------------------------------------------
  // 字の大きさ（面に収まる、いちばん大きい pt）
  // ---------------------------------------------------------------
  var PT = 0.3528;            // 1pt の mm
  var LINE = 1.3;             // 行の高さ（字の大きさの倍）
  function units(s) {
    var u = 0;
    for (var i = 0; i < s.length; i++) u += s.charCodeAt(i) < 0x2000 || (s.charCodeAt(i) >= 0xff61 && s.charCodeAt(i) <= 0xff9f) ? 0.6 : 1;
    return u;
  }
  /** w×h（mm）の箱に text が収まる大きさ（pt）。改行は保つ。収まらなければ minPt */
  function fitSize(text, w, h, maxPt, minPt) {
    var paras = String(text || '').split('\n');
    for (var pt = maxPt; pt > minPt; pt--) {
      var em = pt * PT, per = Math.floor(w / em);
      if (per < 1) continue;
      var lines = 0, ok = true;
      for (var i = 0; i < paras.length; i++) {
        var u = units(paras[i]);
        // 英単語の途中で切らないので、1 行に入る量より長い語があれば小さくする
        var words = paras[i].split(/\s+/);
        for (var j = 0; j < words.length; j++) if (/^[\x21-\x7e]+$/.test(words[j]) && units(words[j]) > per) ok = false;
        lines += Math.max(1, Math.ceil(u / per));
      }
      if (ok && lines * em * LINE <= h) return pt;
    }
    return minPt;
  }

  // ---------------------------------------------------------------
  // 紙の HTML（画面の見本と印刷は同じもの）
  // ---------------------------------------------------------------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function textHtml(s) { return esc(s).replace(/\n/g, '<br>'); }
  function mm(v) { return (Math.round(v * 100) / 100) + 'mm'; }

  function cutLines(L) {
    // 紙の端から端まで引く（切る位置の目印。名刺の外の余白も同じ線で落とせる）
    var s = '';
    var line = function (a, b, c, d) { s += '<line x1="' + a + '" y1="' + b + '" x2="' + c + '" y2="' + d + '"/>'; };
    for (var c = 0; c <= L.cols; c++) { var x = L.left + c * L.w; if (x > 0.5 && x < PAPER.w - 0.5) line(x, 0, x, PAPER.h); }
    for (var r = 0; r <= L.rows; r++) { var y = L.top + r * L.h; if (y > 0.5 && y < PAPER.h - 0.5) line(0, y, PAPER.w, y); }
    return '<svg class="ak-cut" viewBox="0 0 ' + PAPER.w + ' ' + PAPER.h + '" aria-hidden="true">' + s + '</svg>';
  }

  /**
   * @param {{f: string, b: string}[]} cards
   * @param {object} o normalize 済みの設定
   * @returns {{html: string, pages: number, sheets: number}}
   */
  function render(cards, o, credit) {
    var L = LAYOUTS[o.layout] || LAYOUTS.meishi;
    var pages = layoutPages(cards.length, o), out = [];
    pages.forEach(function (p) {
      var h = '<section class="sheet ak-page ak-' + o.layout + ' ak-side-' + p.side + '" data-side="' + p.side + '" data-sheet="' + p.sheet + '">';
      if (o.cut) h += cutLines(L);
      p.slots.forEach(function (sl) {
        var card = cards[sl.i], iw = sl.w - L.pad * 2, ih = sl.h - L.pad * 2;
        h += '<div class="ak-card" data-i="' + sl.i + '" style="left:' + mm(sl.x) + ';top:' + mm(sl.y) + ';width:' + mm(sl.w) + ';height:' + mm(sl.h) + ';padding:' + mm(L.pad) + '">';
        if (o.num) h += '<span class="ak-no">' + (sl.i + 1) + '</span>';
        if (p.side === 'r') {
          var half = (ih - 2) / 2;
          h += '<div class="ak-red-wrap">' +
            '<div class="ak-text ak-q" style="font-size:' + fitSize(card.f, iw, half, L.maxPt, L.minPt) + 'pt">' + textHtml(card.f) + '</div>' +
            '<div class="ak-text ak-a" style="font-size:' + fitSize(card.b, iw, half, L.maxPt, L.minPt) + 'pt;color:' + RED + '">' + textHtml(card.b) + '</div></div>';
        } else {
          var t = p.side === 'f' ? card.f : card.b;
          h += '<div class="ak-text" style="font-size:' + fitSize(t, iw, ih, L.maxPt, L.minPt) + 'pt">' + textHtml(t) + '</div>';
        }
        h += '</div>';
      });
      // クレジット（D38）: 表のページの下の余白に。裏に入れると表の字に重なることがあるので入れない
      if (o.credit && p.side !== 'b' && credit) h += '<p class="ak-credit">' + esc(credit) + '</p>';
      if (o.title && p.side !== 'b') h += '<p class="ak-title">' + esc(o.title) + '</p>';
      out.push(h + '</section>');
    });
    var per = L.cols * L.rows;
    return { html: out.join(''), pages: pages.length, sheets: Math.ceil(cards.length / per) };
  }

  /** めくる順（seq: 入れた順、random: 種から並べかえ） */
  function playOrder(n, order, rnd) {
    var a = [];
    for (var i = 0; i < n; i++) a.push(i);
    if (order !== 'random') return a;
    for (var j = a.length - 1; j > 0; j--) {
      var k = Math.floor(rnd() * (j + 1)), t = a[j]; a[j] = a[k]; a[k] = t;
    }
    return a;
  }

  var api = {
    LAYOUTS: LAYOUTS, PAPER: PAPER, RED: RED, MAX_CARDS: MAX_CARDS, MAX_SIDE: MAX_SIDE, MAX_TEXT: MAX_TEXT,
    splitRows: splitRows, detectDelim: detectDelim, parseCards: parseCards, toCsv: toCsv, lineOf: lineOf,
    defaults: defaults, normalize: normalize,
    layoutPages: layoutPages, backSlot: backSlot, flipPoint: flipPoint, fitSize: fitSize, units: units,
    render: render, playOrder: playOrder, esc: esc,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Anki = api;
})(this);
