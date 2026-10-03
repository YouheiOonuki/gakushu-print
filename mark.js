// ===========================
// 学習プリントメーカー — 丸つけカメラ用の印（企画書 71・K86）
// 印刷する側（sheets.js）と読む側（marutsuke/）が同じ寸法・同じ符号を使うための 1 か所。純粋関数で、DOM に触らない
//
// 紙（A4 縦 210×297mm）に入れるもの:
//   - 四すみの位置合わせ印（QR コードの角と同じ 1:1:3:1:1 の入れ子の四角）
//   - 下の「しるしの帯」: 種類・設定・種・ページを 68 個の黒白のますで（CRC-16 つき）
//   - 答えのます: 1 ますに数字 1 つ。位置は layout() が mm で決める（読む側も同じ関数で場所を知る）
// 紙に答えは書かない。読む側は「しるしの帯」から calc.js で同じ問題を作り直して答えを知る（画像は端末の外に出さない）
//
// ブラウザでは window.Mark、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var Calc = root.Calc || (typeof require !== 'undefined' ? require('./calc.js') : null);

  var VERSION = 1;               // 符号の版（2 bit。0 は使わない）。問題の作り方を変えたら上げ、読む側は古い版も作り直せるようにする
  var PAGE = { w: 210, h: 297 };
  // 位置合わせ印。中心の座標（mm）と一辺。7 単位（外の黒 1・白 1・中の黒 3・白 1・外の黒 1）
  var MARKER = { size: 10, centers: [[13, 13], [197, 13], [197, 284], [13, 284]] };   // 左上・右上・右下・左下（時計回り）
  // しるしの帯（2 段 × 34 ます）。左上の角（mm）・ます 1 つの大きさ
  var CODE = { x: 37.8, y: 266, cw: 4, ch: 3.4, cols: 34, rows: 2 };
  var CODE_BITS = CODE.cols * CODE.rows;   // 68 = 52（中身）+ 16（CRC）
  // 問題を並べる範囲
  var AREA = { top: 50, bottom: 262, cols: [[12, 101], [109, 198]] };

  var ARITH_LEVELS = ['d1', 'teen', 'd2d1', 'd2d2', 'd3d2', 'd3d3'];
  var OPS = ['add', 'sub', 'mix'];
  var CARRIES = ['none', 'with', 'any'];
  var ORDERS = ['seq', 'rev', 'random'];

  // ---------------------------------------------------------------
  // CRC-16/CCITT-FALSE（多項式 0x1021・初期値 0xFFFF）
  // ---------------------------------------------------------------
  function crc16(bits) {
    var c = 0xFFFF;
    for (var i = 0; i < bits.length; i++) {
      var top = ((c >> 15) & 1) ^ (bits[i] & 1);
      c = (c << 1) & 0xFFFF;
      if (top) c ^= 0x1021;
    }
    return c;
  }
  function pushBits(out, v, n) { for (var i = n - 1; i >= 0; i--) out.push(Math.floor(v / Math.pow(2, i)) % 2); }
  function readBits(bits, at, n) { var v = 0; for (var i = 0; i < n; i++) v = v * 2 + bits[at + i]; return v; }

  /** このプリントに印を入れられるか（たし算・ひき算の「よこ」と九九。入れたい問題を使っていないとき） */
  function applicable(state) {
    var t = state.type;
    if (t !== 'arith' && t !== 'kuku') return { ok: false, reason: 'type' };
    var o = state[t];
    if (t === 'arith' && o.style !== 'yoko') return { ok: false, reason: 'tate' };
    var parsed = Calc.parseArithLines(o.custom, t === 'arith' ? Calc.arithRule(o) : Calc.kukuRule());
    if (parsed.items.length) return { ok: false, reason: 'custom' };
    return { ok: true, reason: '' };
  }

  /** 1 ページ分の符号（0/1 の 68 個）。state は normalizeState 済み、page は 0 から */
  function encode(state, page) {
    var b = [];
    pushBits(b, VERSION, 2);
    if (state.type === 'arith') {
      var o = state.arith;
      pushBits(b, 0, 1);
      pushBits(b, OPS.indexOf(o.op), 2);
      pushBits(b, ARITH_LEVELS.indexOf(o.level), 3);
      pushBits(b, CARRIES.indexOf(o.carry), 2);
      pushBits(b, [10, 20, 30].indexOf(o.count), 2);
      pushBits(b, 0, 4);
    } else {
      var k = state.kuku, mask = 0;
      k.dans.forEach(function (d) { mask += Math.pow(2, d - 1); });
      pushBits(b, 1, 1);
      pushBits(b, mask, 9);
      pushBits(b, ORDERS.indexOf(k.order), 2);
      pushBits(b, k.count === 30 ? 1 : 0, 1);
      pushBits(b, 0, 1);
    }
    pushBits(b, page, 4);
    pushBits(b, state.seed >>> 0, 32);
    pushBits(b, crc16(b), 16);
    return b;
  }

  /** 符号を読む。CRC が合わない・ありえない値なら null。返すのは normalizeState 済みの設定とページ */
  function decode(bits) {
    if (!bits || bits.length !== CODE_BITS) return null;
    if (crc16(bits.slice(0, CODE_BITS - 16)) !== readBits(bits, CODE_BITS - 16, 16)) return null;
    var ver = readBits(bits, 0, 2);
    if (ver !== VERSION) return null;
    var raw = { common: {} };
    if (bits[2] === 0) {
      var op = OPS[readBits(bits, 3, 2)], lv = ARITH_LEVELS[readBits(bits, 5, 3)], ca = CARRIES[readBits(bits, 8, 2)], cn = [10, 20, 30][readBits(bits, 10, 2)];
      if (!op || !lv || !ca || !cn || readBits(bits, 12, 4)) return null;
      raw.type = 'arith';
      raw.arith = { op: op, level: lv, carry: ca, count: cn, style: 'yoko', pages: Calc.MAX_PAGES };
    } else {
      var mask = readBits(bits, 3, 9), order = ORDERS[readBits(bits, 12, 2)];
      if (!mask || !order || bits[15]) return null;
      var dans = [];
      for (var d = 1; d <= 9; d++) if (Math.floor(mask / Math.pow(2, d - 1)) % 2) dans.push(d);
      raw.type = 'kuku';
      raw.kuku = { dans: dans, order: order, count: bits[14] ? 30 : 20, pages: Calc.MAX_PAGES };
    }
    var page = readBits(bits, 16, 4);
    raw.seed = readBits(bits, 20, 32);
    var state = Calc.normalizeState(raw);
    if (encode(Object.assign({}, state, { seed: raw.seed }), page).join('') !== bits.join('')) return null;   // 正規化で値が変わったら読みちがい
    return { state: state, page: page, version: ver };
  }

  /**
   * 符号からそのページの問題を作り直す。ページの問題は、それより前のページの問題に左右されるが、後ろには左右されない
   * （genArith・genKuku は前から順に作る）ので、pages を最大にしてそのページを取り出せばよい
   */
  function problemsOf(decoded) {
    var wb = Calc.buildWorkbook(decoded.state, {}, 'ja');
    var p = wb.pages[decoded.page];
    return p ? p.items.map(function (it) { return { a: it.a, b: it.b, op: it.op, answer: Calc.answerOf(it) }; }) : null;
  }

  /** 答えのますの数（設定でいちばん大きい答えの桁数。どの問題も同じ数にする＝ますの数で答えの桁がわからない） */
  function answerDigits(state) {
    if (state.type === 'kuku') return 2;
    var o = state.arith, lv = Calc.ARITH_LEVELS[o.level];
    var add = lv.a[1] + lv.b[1], sub = lv.a[1] - lv.b[0];
    var max = o.op === 'add' ? add : o.op === 'sub' ? sub : Math.max(add, sub);
    return String(max).length;
  }

  /** 式の幅（em）のおおよそ。数字は 0.6em、＋−×＝ は 1em、細い空白 2 つで 0.6em */
  function exprEm(item) { return (String(item.a).length + String(item.b).length) * 0.6 + 2 + 0.6; }

  /**
   * 1 ページの並び（mm）。2 列、上から下へ（左の列が先）。読む側も同じ値を使う
   * @returns {{rows:number, rowH:number, cell:number, fontPt:number, noW:number, items:{no:number, x:number, y:number, w:number, h:number, cells:{x:number,y:number,s:number}[]}[]}}
   */
  function layout(count, digits, items) {
    var rows = Math.ceil(count / 2);
    var rowH = (AREA.bottom - AREA.top) / rows;
    var base = count <= 10 ? { cell: 16, pt: 26 } : count <= 20 ? { cell: 13, pt: 19 } : { cell: 11, pt: 15 };
    var colW = AREA.cols[0][1] - AREA.cols[0][0];
    var noW = 9;
    var cell = Math.min(base.cell, rowH * 0.78, (colW - noW - 36) / digits);
    var maxEm = 0;
    (items || []).forEach(function (it) { maxEm = Math.max(maxEm, exprEm(it)); });
    var avail = colW - noW - cell * digits - 3;
    var fontPt = Math.max(11, Math.min(base.pt, maxEm ? Math.floor(avail / (maxEm * 0.3528) * 2) / 2 : base.pt));
    var out = [];
    for (var i = 0; i < count; i++) {
      var col = i < rows ? 0 : 1, r = i % rows;
      var x = AREA.cols[col][0], y = AREA.top + r * rowH, right = AREA.cols[col][1];
      var cy = y + (rowH - cell) / 2;
      var cells = [];
      for (var d = 0; d < digits; d++) cells.push({ x: right - cell * (digits - d), y: cy, s: cell });
      out.push({ no: i, x: x, y: y, w: right - x, h: rowH, cells: cells });
    }
    return { rows: rows, rowH: rowH, cell: cell, fontPt: fontPt, noW: noW, items: out };
  }

  /** 位置合わせ印の SVG（mm の座標系。紙全体に重ねる） */
  function markerSvg(cx, cy) {
    var u = MARKER.size / 7, x = cx - MARKER.size / 2, y = cy - MARKER.size / 2;
    return '<rect x="' + x + '" y="' + y + '" width="' + MARKER.size + '" height="' + MARKER.size + '" fill="#000"/>' +
      '<rect x="' + (x + u) + '" y="' + (y + u) + '" width="' + 5 * u + '" height="' + 5 * u + '" fill="#fff"/>' +
      '<rect x="' + (x + 2 * u) + '" y="' + (y + 2 * u) + '" width="' + 3 * u + '" height="' + 3 * u + '" fill="#000"/>';
  }

  /** 紙に重ねる SVG（印・しるしの帯）。bits を省くと印だけ */
  function overlaySvg(bits) {
    var s = '<svg class="mk-svg" viewBox="0 0 ' + PAGE.w + ' ' + PAGE.h + '" width="' + PAGE.w + 'mm" height="' + PAGE.h + 'mm" aria-hidden="true">';
    MARKER.centers.forEach(function (c) { s += markerSvg(c[0], c[1]); });
    if (bits) {
      // 帯のまわりに細い枠（読む側は使わない。帯だと分かるように）
      s += '<rect x="' + (CODE.x - 0.8) + '" y="' + (CODE.y - 0.8) + '" width="' + (CODE.cols * CODE.cw + 1.6) + '" height="' + (CODE.rows * CODE.ch + 1.6) + '" fill="none" stroke="#bbb" stroke-width="0.2"/>';
      for (var i = 0; i < bits.length; i++) {
        if (!bits[i]) continue;
        var r = Math.floor(i / CODE.cols), c = i % CODE.cols;
        s += '<rect x="' + (CODE.x + c * CODE.cw) + '" y="' + (CODE.y + r * CODE.ch) + '" width="' + CODE.cw + '" height="' + CODE.ch + '" fill="#000"/>';
      }
    }
    return s + '</svg>';
  }

  /** ます i の中心（mm）。読む側が使う */
  function codeCellCenter(i) {
    var r = Math.floor(i / CODE.cols), c = i % CODE.cols;
    return [CODE.x + (c + 0.5) * CODE.cw, CODE.y + (r + 0.5) * CODE.ch];
  }

  var api = {
    VERSION: VERSION, PAGE: PAGE, MARKER: MARKER, CODE: CODE, CODE_BITS: CODE_BITS, AREA: AREA,
    crc16: crc16, applicable: applicable, encode: encode, decode: decode, problemsOf: problemsOf,
    answerDigits: answerDigits, layout: layout, overlaySvg: overlaySvg, codeCellCenter: codeCellCenter,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Mark = api;
})(this);
