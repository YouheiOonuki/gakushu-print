// ===========================
// 暗号メーカー — 紙（A4 縦）の HTML と SVG（暗号文・解読シート・円盤・答え）
// 文字列を返すだけの関数。DOM に触らない（tests/angou.test.js から確かめる）
// え・きごう のマーク、円盤、たぬき の絵は、このファイルで座標を書いたもの（ほかの素材は使っていない）
// ブラウザでは window.AngouSheets、Node では module.exports
// ===========================
(function (root) {
  'use strict';

  var A = root.Angou || (typeof require !== 'undefined' ? require('./cipher.js') : null);
  var C = root.Calc || (typeof require !== 'undefined' ? require('../calc.js') : null);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function f1(n) { return Math.round(n * 100) / 100; }

  // ---------------------------------------------------------------
  // え・きごう（72 個 = 形 8 × 中の しるし 9）。viewBox 0 0 100 100
  // ---------------------------------------------------------------
  var SHAPES = [
    { name: 'まる', cx: 50, cy: 50, m: 18, el: function (a) { return '<circle cx="50" cy="50" r="38"' + a + '/>'; } },
    { name: 'しかく', cx: 50, cy: 50, m: 18, el: function (a) { return '<rect x="14" y="14" width="72" height="72"' + a + '/>'; } },
    { name: 'さんかく', cx: 50, cy: 60, m: 13, el: function (a) { return '<path d="M50 10L91 84H9Z"' + a + '/>'; } },
    { name: 'ひしがた', cx: 50, cy: 50, m: 16, el: function (a) { return '<path d="M50 6L94 50L50 94L6 50Z"' + a + '/>'; } },
    { name: 'ほし', cx: 50, cy: 54, m: 11, el: function (a) { return '<path d="' + starPath(50, 54, 46, 20) + '"' + a + '/>'; } },
    { name: 'ハート', cx: 50, cy: 46, m: 14, el: function (a) { return '<path d="M50 88C18 64 6 44 12 28C18 12 40 10 50 28C60 10 82 12 88 28C94 44 82 64 50 88Z"' + a + '/>'; } },
    { name: 'さかさんかく', cx: 50, cy: 40, m: 13, el: function (a) { return '<path d="M9 16H91L50 90Z"' + a + '/>'; } },
    { name: 'いえ', cx: 50, cy: 62, m: 16, el: function (a) { return '<path d="M50 8L90 42V90H10V42Z"' + a + '/>'; } },
  ];
  var FILLS = ['なし', 'ぬり', 'てん', 'よこ', 'たて', 'じゅうじ', 'ばつ', 'なかに ぬり', 'なかに わく'];
  function starPath(cx, cy, R, r) {
    var d = '';
    for (var i = 0; i < 10; i++) {
      var ang = Math.PI / 5 * i, rr = i % 2 ? r : R;
      d += (i ? 'L' : 'M') + f1(cx + rr * Math.sin(ang)) + ' ' + f1(cy - rr * Math.cos(ang));
    }
    return d + 'Z';
  }
  var ST = ' stroke="#222" stroke-width="6" stroke-linejoin="round"';
  /** マーク番号 0〜71 の SVG（中身だけ。<svg> で包むのは呼ぶ側） */
  function symbolInner(id) {
    var sh = SHAPES[id % 8], f = Math.floor(id / 8) % 9, cx = sh.cx, cy = sh.cy, m = sh.m;
    var out = sh.el(' fill="' + (f === 1 ? '#222' : '#fff') + '"' + ST);
    var line = function (x1, y1, x2, y2) { return '<line x1="' + f1(x1) + '" y1="' + f1(y1) + '" x2="' + f1(x2) + '" y2="' + f1(y2) + '" stroke="#222" stroke-width="7" stroke-linecap="round"/>'; };
    var inner = function (s, fill) {
      return '<g transform="translate(' + cx + ' ' + cy + ') scale(' + s + ') translate(' + (-cx) + ' ' + (-cy) + ')">' +
        sh.el(' fill="' + fill + '" stroke="#222" stroke-width="' + f1(6 / s) + '" stroke-linejoin="round"') + '</g>';
    };
    if (f === 2) out += '<circle cx="' + cx + '" cy="' + cy + '" r="7" fill="#222"/>';
    if (f === 3) out += line(cx - m, cy, cx + m, cy);
    if (f === 4) out += line(cx, cy - m, cx, cy + m);
    if (f === 5) out += line(cx - m, cy, cx + m, cy) + line(cx, cy - m, cx, cy + m);
    if (f === 6) { var d = m * 0.75; out += line(cx - d, cy - d, cx + d, cy + d) + line(cx - d, cy + d, cx + d, cy - d); }
    if (f === 7) out += inner(0.42, '#222');
    if (f === 8) out += inner(0.5, '#fff');
    return out;
  }
  function symbolSvg(id, cls) {
    return '<svg class="' + (cls || 'sym') + '" viewBox="0 0 100 100" aria-hidden="true">' + symbolInner(id) + '</svg>';
  }
  function symbolName(id) { return SHAPES[id % 8].name + '・' + FILLS[Math.floor(id / 8) % 9]; }

  // ---------------------------------------------------------------
  // 1 粒の見た目
  // ---------------------------------------------------------------
  /** ますの右上に描く 濁点（2 本線）・半濁点（まる）。字の ゛ は書体で小さすぎることがあるので線で描く */
  function markSvg(m) {
    var inner = m === '゛'
      ? '<line x1="4" y1="3" x2="7" y2="13" stroke="#222" stroke-width="2.6" stroke-linecap="round"/><line x1="12" y1="3" x2="15" y2="13" stroke="#222" stroke-width="2.6" stroke-linecap="round"/>'
      : '<circle cx="10" cy="8" r="5" fill="none" stroke="#222" stroke-width="2.2"/>';
    return '<svg class="mk" viewBox="0 0 20 16" role="img" aria-label="' + m + '">' + inner + '</svg>';
  }
  /** 暗号の 1 粒を、ますの中に描く HTML */
  function glyph(tok) {
    var mark = tok.t === 'k' && tok.mark ? (tok.mark === 1 ? '゛' : '゜') : '';
    var sm = tok.t === 'k' && tok.small;
    if (tok.sym !== undefined) {
      return symbolSvg(tok.sym, 'sym' + (sm ? ' sm' : '')) + (mark ? markSvg(mark) : '');
    }
    if (tok.num !== undefined) {
      return '<span class="nm' + (sm ? ' sm' : '') + (tok.num >= 10 ? ' n2' : '') + '">' + tok.num + '</span>' + (mark ? markSvg(mark) : '');
    }
    var ch = A.charOf(tok), tail = '';
    if (ch.length === 2 && /[゛゜]$/.test(ch)) { tail = ch.slice(1); ch = ch.slice(0, 1); }
    var smallStyle = A.smallByStyle(tok);
    return '<span class="kc' + (smallStyle ? ' sm' : '') + '">' + esc(ch) + '</span>' + (tail ? markSvg(tail) : '');
  }

  // ---------------------------------------------------------------
  // 暗号文のます目（答えのページでは下のますに赤で答え）
  // ---------------------------------------------------------------
  var BODY_W = 186, CELL_GAP = 1.2;
  var SIZES = [18, 15, 13, 11, 9.5, 8];
  function lines(tokens) {
    var ls = [[]];
    tokens.forEach(function (t) { if (t.t === 'o' && t.ch === '\n') ls.push([]); else ls[ls.length - 1].push(t); });
    return ls;
  }
  /** 入る いちばん大きい ますの大きさ（mm）。availH は ます目に使える高さ */
  function fitSize(tokens, availH) {
    var ls = lines(tokens);
    for (var i = 0; i < SIZES.length; i++) {
      var w = SIZES[i], cols = Math.floor((BODY_W + CELL_GAP) / (w + CELL_GAP));
      var rows = ls.reduce(function (n, l) { return n + Math.max(1, Math.ceil(l.length / cols)); }, 0);
      if (rows * (w * 2 + 3.2) <= availH) return { w: w, cols: cols, rows: rows };
    }
    var last = SIZES[SIZES.length - 1];
    return { w: last, cols: Math.floor((BODY_W + CELL_GAP) / (last + CELL_GAP)), rows: 99 };
  }
  function grid(b, withAnswers, availH) {
    var fit = fitSize(b.cipher, availH);
    var cells = b.cipher.map(function (t) {
      if (t.t === 'o' && t.ch === '\n') return '<span class="cbr"></span>';
      if (t.t === 'o' && /\s/.test(t.ch)) return '<span class="cc sp"></span>';
      if (t.t === 'o') return '<span class="cc ot"><span class="cq">' + esc(t.ch) + '</span><span class="ca no"></span></span>';
      var ans = '';
      if (withAnswers) {
        var p = A.plainOf(t, b.key);
        ans = p === null ? '<span class="ax">×</span>' : '<span class="af">' + esc(p) + '</span>';
      }
      return '<span class="cc"><span class="cq">' + glyph(t) + '</span><span class="ca">' + ans + '</span></span>';
    }).join('');
    return '<div class="cgrid" style="--w:' + fit.w + 'mm">' + cells + '</div>';
  }

  // ---------------------------------------------------------------
  // 文言
  // ---------------------------------------------------------------
  var K = A.KANA;
  function hintOf(b) {
    var s = b.state, k = b.key, h;
    switch (s.method) {
      case 'shift':
        h = 'ヒント: ' + s.key + 'つ まえに もどそう（えんばんの うちがわの「' + K[s.key] + '」を そとがわの「あ」に あわせる）';
        if (b.hasAlpha) h += '。英字は ' + A.shiftAlpha(s.key) + 'つ';
        break;
      case 'subst': h = 'ヒント: 「いれかえ表」で さがそう'; break;
      case 'pict': h = 'ヒント: マークの ひょうで さがそう'; break;
      case 'num': h = 'ヒント: あ＝1、い＝2 … あいうえおの じゅんばん'; break;
      case 'tanuki': h = k.filler === 'た' ? 'ヒント: たぬき（「た」を ぬく）' : 'ヒント: 「' + (k.filler || '') + '」ぬき（「' + (k.filler || '') + '」を ぬく）'; break;
      default: h = 'ヒント: うしろから よもう';
    }
    if (s.rev && s.method !== 'rev') h += '。さいごに うしろから よむ';
    return h;
  }
  /** 答えのページの「かぎ」の説明 */
  function keyText(b) {
    var s = b.state, k = b.key, t;
    switch (s.method) {
      case 'shift': t = 'ずらし ' + s.key + '（あ→' + K[s.key] + '）' + (b.hasAlpha ? '・英字 ' + A.shiftAlpha(s.key) + '（A→' + A.ALPHA[A.shiftAlpha(s.key)] + '）' : ''); break;
      case 'subst': t = 'いれかえ表'; break;
      case 'pict': t = 'え・きごう'; break;
      case 'num': t = 'ばんごう（あ＝1 … ん＝46' + (b.hasAlpha ? '、A＝47 … Z＝72' : '') + '）'; break;
      case 'tanuki': t = '「' + (k.filler || '') + '」を まぜた（ぬいて よむ）'; break;
      default: t = 'さかさ（うしろから よむ）';
    }
    if (s.rev && s.method !== 'rev') t += '＋さかさ';
    return t;
  }
  /** 濁点・小さい字の きまり（解読シートに書く）。いまの かぎで 1 つ例を作る */
  function markRule(b) {
    var s = b.state;
    if (s.method === 'tanuki' || s.method === 'rev') return '';
    var ex = A.tokenize('が')[0];
    var enc = A.encode([ex], Object.assign({}, b.key, { rev: false }), s.seed)[0];
    var bare = Object.assign({}, enc, { mark: 0 });
    var shown = s.method === 'num' ? String(enc.num) + '゛' : A.charOf(enc);
    var bareShown = s.method === 'num' ? String(bare.num) : A.charOf(bare);
    if (s.method === 'pict') return '<p class="rule">マークの 右上の てんてん（゛）・まる（゜）と、小さい マーク（小さい字）は、もどした字に そのまま つける（れい: か の マークに ゛ → が）。</p>';
    return '<p class="rule">てんてん（゛）・まる（゜）・小さい字は、そのまま つける。字だけ もどそう。' +
      'れい: ' + esc(shown) + ' → ' + esc(bareShown) + ' を もどすと か → てんてんを つけて が</p>';
  }

  // ---------------------------------------------------------------
  // 紙の枠
  // ---------------------------------------------------------------
  function head(title, sub, right, answer) {
    return '<div class="sh-head"><div class="sh-title"><h3>' + esc(title) + (answer ? ' <span class="ans-badge">こたえ</span>' : '') + '</h3>' +
      (sub ? '<p class="sh-sub">' + esc(sub) + '</p>' : '') + '</div><div class="sh-fields">' + right + '</div></div>';
  }
  function foot(b) {
    var s = b.state;
    return '<div class="sh-foot"><span>' + (s.credit ? esc(C.CREDIT) : '') + '</span><span>あんごう ばんごう ' + C.seedLabel(s.seed) + '・' + esc(A.METHODS[s.method].label) + (s.method === 'shift' ? ' ' + s.key : '') + '</span></div>';
  }
  function sheet(cls, inner) { return '<section class="sheet angou ' + cls + '">' + inner + '</section>'; }
  function toFrom(s) {
    var r = '';
    if (s.to) r += '<span class="f"><span class="tf">' + esc(s.to) + '</span><span class="lbl">へ</span></span>';
    if (s.from) r += '<span class="f"><span class="tf">' + esc(s.from) + '</span><span class="lbl">より</span></span>';
    return r;
  }

  function cipherSheet(b, answer) {
    var s = b.state;
    var title = s.title || 'ひみつの てがみ';
    var body = b.cipher.length ? grid(b, answer, answer ? 196 : 212) : '<p class="empty">（ここに 暗号が 出ます）</p>';
    var top = answer
      ? '<p class="sh-inst">かぎ: ' + esc(keyText(b)) + '</p><p class="plain">' + esc(A.detokenize(b.tokens)).replace(/\n/g, '<br>') + '</p>'
      : '<p class="sh-inst">あんごうを といて、したの ますに かこう。</p>' + (s.hint ? '<p class="hint-line">' + esc(hintOf(b)) + '</p>' : '');
    return sheet(answer ? 'ans' : 'ciph', head(title, answer ? '' : '', toFrom(s), answer) + top + '<div class="sh-body">' + body + '</div>' + foot(b));
  }

  // ---------------------------------------------------------------
  // 円盤（ずらし）。そとがわ＝もとの字、うちがわ＝暗号の字。単位は mm
  // ---------------------------------------------------------------
  function ring(chars, cx, cy, rIn, rOut, rLabel, fs, cls) {
    var n = chars.length, out = '';
    for (var i = 0; i < n; i++) {
      var a = (i + 0.5) * 2 * Math.PI / n;
      out += '<line x1="' + f1(cx + rIn * Math.sin(a)) + '" y1="' + f1(cy - rIn * Math.cos(a)) + '" x2="' + f1(cx + rOut * Math.sin(a)) + '" y2="' + f1(cy - rOut * Math.cos(a)) + '" class="wl"/>';
      var t = i * 2 * Math.PI / n, x = cx + rLabel * Math.sin(t), y = cy - rLabel * Math.cos(t), deg = f1(i * 360 / n);
      out += '<text x="' + f1(x) + '" y="' + f1(y) + '" font-size="' + fs + '" class="' + cls + (i === 0 ? ' w0' : '') + '" transform="rotate(' + deg + ' ' + f1(x) + ' ' + f1(y) + ')">' + esc(chars[i]) + '</text>';
    }
    return out;
  }
  /** 円盤 1 組（そと・うち）を 1 枚の紙に。chars は かな 46 か 英字 26 */
  function wheelSheet(b, chars, label) {
    var n = chars.length, big = n < 30;
    var R1 = 72, R2 = 56;              // そとの円盤・うちの円盤の半径
    var o = { x: 74, y: 76 }, i = { x: 128, y: 196 };
    var svg = '<svg class="wheel" viewBox="0 0 186 254" width="186mm" height="254mm" aria-hidden="true">' +
      // そと
      '<circle cx="' + o.x + '" cy="' + o.y + '" r="' + R1 + '" class="wc"/>' +
      '<circle cx="' + o.x + '" cy="' + o.y + '" r="' + R2 + '" class="wg"/>' +
      ring(chars, o.x, o.y, R2, R1, 64, big ? 7 : 5.4, 'wt') +
      '<text x="' + o.x + '" y="' + (o.y - 26) + '" class="wn" font-size="5">そとがわ</text>' +
      '<text x="' + o.x + '" y="' + (o.y - 19) + '" class="wn" font-size="4">（もとの字）</text>' +
      pin(o.x, o.y) +
      // うち
      '<circle cx="' + i.x + '" cy="' + i.y + '" r="' + R2 + '" class="wc"/>' +
      '<circle cx="' + i.x + '" cy="' + i.y + '" r="42" class="wg"/>' +
      ring(chars, i.x, i.y, 42, R2, 49, big ? 6 : 4.6, 'wt') +
      '<text x="' + i.x + '" y="' + (i.y - 14) + '" class="wn" font-size="5">うちがわ</text>' +
      '<text x="' + i.x + '" y="' + (i.y - 8) + '" class="wn" font-size="4">（あんごう）</text>' +
      pin(i.x, i.y) +
      '</svg>';
    var s = b.state, k = n === 26 ? A.shiftAlpha(s.key) : s.key;
    var steps = '<ol class="wsteps">' +
      '<li>2 まいの まるを、ふとい せんで きりとる。</li>' +
      '<li>まん中の ＋ に あなを あけて、うちがわを うえに かさね、わりピンで とめる。</li>' +
      '<li>うちがわの「' + esc(chars[k]) + '」を、そとがわの「' + esc(chars[0]) + '」に あわせる。</li>' +
      '<li>あんごうの 字を うちがわで さがし、となりの そとがわの 字を よむ。</li></ol>';
    var note = '<p class="wnote">' + (s.hint ? 'この あんごうは ' + k + 'つ ずらし。' : 'ずらす かずは、あんごうを つくった 人に きこう。') + '</p>' + markRule(b);
    return sheet('tool wheel-page', head('かいどく シート', 'ずらしの えんばん（' + label + '）', '', false) +
      '<div class="sh-body wbody">' + svg + '<div class="wtext">' + steps + note + '</div></div>' + foot(b));
  }
  function pin(x, y) {
    return '<line x1="' + (x - 3) + '" y1="' + y + '" x2="' + (x + 3) + '" y2="' + y + '" class="wp"/><line x1="' + x + '" y1="' + (y - 3) + '" x2="' + x + '" y2="' + (y + 3) + '" class="wp"/>';
  }

  // ---------------------------------------------------------------
  // 表（いれかえ・え・きごう・ばんごう）。五十音の並び
  // ---------------------------------------------------------------
  var GOJUON = [
    'あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの', 'はひふへほ', 'まみむめも', 'や ゆ よ', 'らりるれろ', 'わ   を', 'ん    ',
  ];
  function tableSheet(b) {
    var s = b.state, k = b.key, title, sub, lead;
    var KI = {}; K.forEach(function (c, i) { KI[c] = i; });
    // cell(i): 五十音の i 番目の字の ます
    var cellK, cellA;
    if (s.method === 'subst') {
      var invK = []; k.kana.forEach(function (v, i) { invK[v] = i; });
      var invA = []; k.alpha.forEach(function (v, i) { invA[v] = i; });
      cellK = function (i) { return '<b class="tk">' + K[i] + '</b><span class="tar">→</span><span class="tp">' + K[invK[i]] + '</span>'; };
      cellA = function (i) { return '<b class="tk">' + A.ALPHA[i] + '</b><span class="tar">→</span><span class="tp">' + A.ALPHA[invA[i]] + '</span>'; };
      title = 'いれかえ表'; sub = 'あんごうの 字 → もとの 字'; lead = 'あんごうの 字を 五十音の ならびで さがして、→ の 右の 字に もどそう。';
    } else if (s.method === 'pict') {
      cellK = function (i) { return symbolSvg(k.kana[i], 'tsym') + '<span class="tar">→</span><span class="tp">' + K[i] + '</span>'; };
      cellA = function (i) { return symbolSvg(k.alpha[i], 'tsym') + '<span class="tar">→</span><span class="tp">' + A.ALPHA[i] + '</span>'; };
      title = 'マークの ひょう'; sub = 'マーク → もとの 字'; lead = 'おなじ マークを さがして、→ の 右の 字に もどそう。';
    } else {
      cellK = function (i) { return '<b class="tk tn">' + (i + 1) + '</b><span class="tar">→</span><span class="tp">' + K[i] + '</span>'; };
      cellA = function (i) { return '<b class="tk tn">' + (47 + i) + '</b><span class="tar">→</span><span class="tp">' + A.ALPHA[i] + '</span>'; };
      title = 'ばんごうの ひょう'; sub = 'ばんごう → もとの 字'; lead = 'ばんごうは あいうえおの じゅんばん。';
    }
    var rows = GOJUON.map(function (r) {
      return '<tr>' + r.split('').map(function (c) { return c === ' ' ? '<td class="blank"></td>' : '<td><div class="kcell">' + cellK(KI[c]) + '</div></td>'; }).join('') + '</tr>';
    }).join('');
    var html = '<table class="ktab' + (b.hasAlpha ? ' tight' : '') + '">' + rows + '</table>';
    if (b.hasAlpha) {
      var ar = '';
      for (var r = 0; r < 4; r++) {
        ar += '<tr>';
        for (var c = 0; c < 7; c++) { var j = r * 7 + c; ar += j < 26 ? '<td><div class="kcell">' + cellA(j) + '</div></td>' : '<td class="blank"></td>'; }
        ar += '</tr>';
      }
      html += '<table class="ktab atab">' + ar + '</table>';
    }
    var tail = s.rev ? '<p class="rule">さいごに、うしろから よもう。</p>' : '';
    return sheet('tool', head('かいどく シート', title + '（' + sub + '）', '', false) + '<p class="sh-inst">' + esc(lead) + '</p>' + markRule(b) + tail +
      '<div class="sh-body">' + html + '</div>' + foot(b));
  }

  // ---------------------------------------------------------------
  // たぬき・さかさ
  // ---------------------------------------------------------------
  function tanukiSvg() {
    // たぬきの顔（このツールで描いた単純な形）
    return '<svg class="tanuki" viewBox="0 0 200 180" aria-hidden="true">' +
      '<path d="M40 60L30 12L78 40Z" fill="#fff" stroke="#222" stroke-width="5" stroke-linejoin="round"/>' +
      '<path d="M160 60L170 12L122 40Z" fill="#fff" stroke="#222" stroke-width="5" stroke-linejoin="round"/>' +
      '<ellipse cx="100" cy="100" rx="78" ry="68" fill="#fff" stroke="#222" stroke-width="5"/>' +
      '<path d="M40 96C48 70 80 70 92 96C84 116 50 118 40 96Z" fill="#555"/>' +
      '<path d="M160 96C152 70 120 70 108 96C116 116 150 118 160 96Z" fill="#555"/>' +
      '<circle cx="68" cy="94" r="9" fill="#fff"/><circle cx="132" cy="94" r="9" fill="#fff"/>' +
      '<circle cx="70" cy="95" r="4.5" fill="#222"/><circle cx="130" cy="95" r="4.5" fill="#222"/>' +
      '<ellipse cx="100" cy="126" rx="26" ry="20" fill="#fff" stroke="#222" stroke-width="4"/>' +
      '<ellipse cx="100" cy="118" rx="10" ry="7" fill="#222"/>' +
      '<path d="M90 136Q100 144 110 136" fill="none" stroke="#222" stroke-width="4" stroke-linecap="round"/>' +
      '</svg>';
  }
  function tanukiSheet(b) {
    var f = b.key.filler || '';
    var name = f === 'た' ? 'たぬき' : '「' + f + '」ぬき';
    var body = '<div class="bigrule">' + (f === 'た' ? tanukiSvg() : '') +
      '<p class="big">' + esc(name) + '</p><p class="mid">あんごうの 中の「<span class="xout">' + esc(f) + '</span>」を ぜんぶ けして よもう。</p>' +
      (b.state.rev ? '<p class="mid">さいごに、うしろから よもう。</p>' : '') + '</div>';
    return sheet('tool', head('かいどく シート', name + ' あんごう', '', false) + '<div class="sh-body">' + body + '</div>' + foot(b));
  }
  function revSheet(b) {
    var body = '<div class="bigrule"><svg class="arrow" viewBox="0 0 200 60" aria-hidden="true"><path d="M190 30H30M60 6L20 30L60 54" fill="none" stroke="#222" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '<p class="big">さかさ あんごう</p><p class="mid">いちばん うしろの 字から、まえへ むかって よもう。</p><p class="mid">ぎょうが かわるところで、ぎょうごとに よむ。</p></div>';
    return sheet('tool', head('かいどく シート', 'うしろから よむ', '', false) + '<div class="sh-body">' + body + '</div>' + foot(b));
  }

  /** 解読シート（方式ごと。ずらしは かな と 英字 で 1 枚ずつ） */
  function toolSheets(b) {
    var m = b.state.method;
    if (m === 'shift') {
      var out = [];
      if (b.hasKana || !b.hasAlpha) out.push(wheelSheet(b, K, 'ひらがな・カタカナ'));
      if (b.hasAlpha) out.push(wheelSheet(b, A.ALPHA, '英字'));
      return out;
    }
    if (m === 'tanuki') return [tanukiSheet(b)];
    if (m === 'rev') return [revSheet(b)];
    return [tableSheet(b)];
  }

  /** 印刷する紙の HTML（pages で選んだものを 暗号文 → 解読シート → 答え の順に） */
  function sheetsHtml(b, pages) {
    var p = pages || b.state.pages, out = [];
    if (p.cipher && b.cipher.length) out.push(cipherSheet(b, false));
    if (p.tool) out = out.concat(toolSheets(b));
    if (p.answer && b.cipher.length) out.push(cipherSheet(b, true));
    return out;
  }

  var api = {
    esc: esc, symbolSvg: symbolSvg, symbolInner: symbolInner, symbolName: symbolName, SHAPES: SHAPES, FILLS: FILLS,
    glyph: glyph, fitSize: fitSize, hintOf: hintOf, keyText: keyText, markRule: markRule,
    cipherSheet: cipherSheet, toolSheets: toolSheets, sheetsHtml: sheetsHtml, SIZES: SIZES,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AngouSheets = api;
})(this);
