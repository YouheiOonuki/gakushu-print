// ===========================
// 暗号メーカー — 暗号にする・もどすロジック（画面から切り離した純粋関数）
// DOM や localStorage に触らない。tests/angou.test.js から node --test で確かめる
// ブラウザでは window.Angou、Node（テスト）では module.exports で使う
//
// 文は「字の粒（トークン）」に分けてから暗号にする。1 粒 = もとの字（46 のかな・26 の英字のどれか）＋ しるし。
//   しるし: 濁点（゛）・半濁点（゜）・小さい字・カタカナ・英大文字。暗号にするのは「もとの字」だけで、しるしはそのまま運ぶ。
//   だから どの方式でも、暗号の粒からもとの文が 1 字もちがわずに戻る（tests で往復を確かめる）。
// 乱数・共有リンクの符号化・バックアップは ../calc.js（学習プリントメーカー）のものを使う。
// ===========================
(function (root) {
  'use strict';

  var C = root.Calc || (typeof require !== 'undefined' ? require('../calc.js') : null);

  // ---------------------------------------------------------------
  // 字の表
  // ---------------------------------------------------------------
  // 五十音の順（46 字。を・ん を含む。ゐ・ゑ は入れない）。ずらし・ばんごう・円盤はこの順
  var KANA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん'.split('');
  var ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  var NK = KANA.length, NA = ALPHA.length;   // 46・26
  var KANA_INDEX = {};
  KANA.forEach(function (c, i) { KANA_INDEX[c] = i; });

  // 濁点・半濁点・小さい字（ひらがなで持ち、カタカナは +0x60 で行き来する）
  var DAKU = { 'か': 'が', 'き': 'ぎ', 'く': 'ぐ', 'け': 'げ', 'こ': 'ご', 'さ': 'ざ', 'し': 'じ', 'す': 'ず', 'せ': 'ぜ', 'そ': 'ぞ',
    'た': 'だ', 'ち': 'ぢ', 'つ': 'づ', 'て': 'で', 'と': 'ど', 'は': 'ば', 'ひ': 'び', 'ふ': 'ぶ', 'へ': 'べ', 'ほ': 'ぼ', 'う': 'ゔ' };
  var HANDAKU = { 'は': 'ぱ', 'ひ': 'ぴ', 'ふ': 'ぷ', 'へ': 'ぺ', 'ほ': 'ぽ' };
  var SMALL = { 'あ': 'ぁ', 'い': 'ぃ', 'う': 'ぅ', 'え': 'ぇ', 'お': 'ぉ', 'つ': 'っ', 'や': 'ゃ', 'ゆ': 'ゅ', 'よ': 'ょ', 'わ': 'ゎ' };
  var DECOMP = {};   // 'が' → { base: 'か', mark: 1 }
  Object.keys(DAKU).forEach(function (b) { DECOMP[DAKU[b]] = { base: b, mark: 1, small: false }; });
  Object.keys(HANDAKU).forEach(function (b) { DECOMP[HANDAKU[b]] = { base: b, mark: 2, small: false }; });
  Object.keys(SMALL).forEach(function (b) { DECOMP[SMALL[b]] = { base: b, mark: 0, small: true }; });
  var MARK_CHARS = ['', '゛', '゜'];

  function isKataCode(code) { return code >= 0x30A1 && code <= 0x30F6; }
  function toHira(ch) { var c = ch.charCodeAt(0); return isKataCode(c) ? String.fromCharCode(c - 0x60) : ch; }
  function toKata(ch) { var c = ch.charCodeAt(0); return c >= 0x3041 && c <= 0x3096 ? String.fromCharCode(c + 0x60) : ch; }

  // ---------------------------------------------------------------
  // 文 → 粒
  // 粒: { t: 'k', i, mark(0 なし・1 ゛・2 ゜), small, kata } … かな
  //     { t: 'a', i, up } … 英字
  //     { t: 'o', ch, bad? } … そのまま残す字（ー・、。・数字・空白・改行）。bad は暗号にできない字（漢字など）
  // ---------------------------------------------------------------
  var KEEP = /[\sー〜～、。，．,.!?！？「」『』（）()・:：;；…\-0-9]/;

  /** 入れた文を粒に分ける。NFKC で半角カナ・全角英字をそろえ、はなれた ゛゜ は前の字につける */
  function tokenize(text) {
    var s = String(text == null ? '' : text).replace(/\r\n?/g, '\n')
      .replace(/゛/g, '゙').replace(/゜/g, '゚')   // はなれた ゛゜ を結合文字に（NFKC で空白が入らないように）
      .normalize('NFKC');
    var out = [];
    Array.from(s).forEach(function (ch) {
      var code = ch.charCodeAt(0);
      if (ch === '゙' || ch === '゚') {
        // 前の字につける（か＋゛＝が）。つけられないとき（な゛ など）も しるしとして持つ
        var prev = out[out.length - 1];
        if (prev && prev.t === 'k' && !prev.mark && !prev.small) { prev.mark = ch === '゙' ? 1 : 2; return; }
        out.push({ t: 'o', ch: ch === '゙' ? '゛' : '゜', bad: true });
        return;
      }
      var kata = isKataCode(code) && ch !== 'ヷ' && ch !== 'ヸ' && ch !== 'ヹ' && ch !== 'ヺ';
      var h = kata ? toHira(ch) : ch;
      if (KANA_INDEX[h] !== undefined) { out.push({ t: 'k', i: KANA_INDEX[h], mark: 0, small: false, kata: kata }); return; }
      if (DECOMP[h]) { var d = DECOMP[h]; out.push({ t: 'k', i: KANA_INDEX[d.base], mark: d.mark, small: d.small, kata: kata }); return; }
      if (/[A-Za-z]/.test(ch)) { out.push({ t: 'a', i: ch.toUpperCase().charCodeAt(0) - 65, up: ch === ch.toUpperCase() }); return; }
      if (KEEP.test(ch)) { out.push({ t: 'o', ch: ch }); return; }
      out.push({ t: 'o', ch: ch, bad: true });
    });
    return out;
  }

  /** 粒 → 文（ふつうの字で。濁点がつけられない字は「な゛」のように後ろに ゛ を書く。小さくできない字は大きいまま） */
  function charOf(tok) {
    if (tok.t === 'a') { var a = ALPHA[tok.i]; return tok.up ? a : a.toLowerCase(); }
    if (tok.t !== 'k') return tok.ch;
    var base = KANA[tok.i], ch = base, tail = '';
    if (tok.mark === 1) { if (DAKU[base]) ch = DAKU[base]; else tail = '゛'; }
    if (tok.mark === 2) { if (HANDAKU[base]) ch = HANDAKU[base]; else tail = '゜'; }
    if (tok.small && SMALL[base] && !tok.mark) ch = SMALL[base];
    return (tok.kata ? toKata(ch) : ch) + tail;
  }
  /** 小さい字の しるしが、ふつうの字で書けない（紙では小さく描く）か */
  function smallByStyle(tok) { return tok.t === 'k' && tok.small && !SMALL[KANA[tok.i]]; }
  function detokenize(tokens) { return tokens.map(charOf).join(''); }

  // ---------------------------------------------------------------
  // 方式
  // ---------------------------------------------------------------
  var METHODS = {
    shift: { label: 'ずらし', sub: 'あいうえお順に ずらす' },
    subst: { label: 'いれかえ表', sub: '字を べつの字に' },
    pict: { label: 'え・きごう', sub: '字を マークに' },
    num: { label: 'ばんごう', sub: 'あ＝1 … ん＝46' },
    tanuki: { label: 'たぬき', sub: 'よけいな字を まぜる' },
    rev: { label: 'さかさ', sub: 'うしろから よむ' },
  };
  var METHOD_KEYS = Object.keys(METHODS);
  var MAX_LEN = 200;        // 入れられる字の数（改行・空白を含む粒の数）
  var KEY_MAX = NK - 1;     // ずらす数 1〜45
  var SYMBOLS = 72;         // え・きごう の数（かな 46 ＋ 英字 26。sheets.js の symbolSvg で描く）
  var SHARE_MAX = 4000;
  var TANUKI_ORDER = KANA.slice(0, 44);   // たぬき の まぜる字の候補（た を先に。を・ん は使わない）
  TANUKI_ORDER.splice(TANUKI_ORDER.indexOf('た'), 1);
  TANUKI_ORDER.unshift('た');

  /** 同じ数の並べかえで、どの字も自分と同じにならないもの（いれかえ表・え・きごう） */
  function derange(n, rng) {
    for (var tries = 0; tries < 200; tries++) {
      var p = rng.shuffle(Array.from({ length: n }, function (_, i) { return i; }));
      if (p.every(function (v, i) { return v !== i; })) return p;
    }
    // ここには来ない見込み（46 字でどれも動かない並べかえは約 37%）。念のため 1 つずらし
    return Array.from({ length: n }, function (_, i) { return (i + 1) % n; });
  }
  function invert(p) { var q = []; p.forEach(function (v, i) { q[v] = i; }); return q; }

  /** 種と方式から「かぎ」を作る。同じ種・同じ方式・同じ文なら いつでも同じ */
  function makeKey(state, tokens) {
    var s = state, rng;
    var key = { method: s.method, shift: s.key, rev: s.method === 'rev' || s.rev };
    if (s.method === 'subst') {
      rng = C.makeRng(s.seed, 101);
      key.kana = derange(NK, rng);
      key.alpha = derange(NA, rng);
    }
    if (s.method === 'pict') {
      rng = C.makeRng(s.seed, 202);
      var sym = rng.shuffle(Array.from({ length: SYMBOLS }, function (_, i) { return i; }));
      key.kana = sym.slice(0, NK);          // かな i → マーク番号
      key.alpha = sym.slice(NK, NK + NA);   // 英字 i → マーク番号
    }
    if (s.method === 'tanuki') {
      var used = {};
      (tokens || []).forEach(function (t) { if (t.t === 'k') used[t.i] = true; });
      // 共有リンクで かぎ だけ受け取ったとき（文なし）は、送った人の まぜた字（s.filler）を使う
      var pick = s.filler && !used[KANA_INDEX[s.filler]] ? s.filler : TANUKI_ORDER.filter(function (c) { return !used[KANA_INDEX[c]]; })[0];
      key.filler = pick || null;   // 44 字をすべて使った文では まぜる字がない（お知らせを出す）
    }
    return key;
  }

  function shiftAlpha(k) { return k % NA; }

  /** 1 粒を暗号にする（しるしは運ぶ）。num・pict は { sym | num } を足した粒を返す */
  function encTok(t, key, dir) {
    if (t.t === 'o') return t;
    var n = t.t === 'k' ? NK : NA, o = Object.assign({}, t);
    switch (key.method) {
      case 'shift': {
        var k = t.t === 'k' ? key.shift : shiftAlpha(key.shift);
        o.i = ((t.i + dir * k) % n + n) % n;
        return o;
      }
      case 'subst': {
        var p = t.t === 'k' ? key.kana : key.alpha;
        o.i = dir > 0 ? p[t.i] : invert(p)[t.i];
        return o;
      }
      default: return o;
    }
  }

  /** 行ごとに うしろから並べる（改行の位置は そのまま） */
  function reverseLines(tokens) {
    var out = [], line = [];
    tokens.forEach(function (t) {
      if (t.t === 'o' && t.ch === '\n') { out = out.concat(line.reverse(), [t]); line = []; } else line.push(t);
    });
    return out.concat(line.reverse());
  }

  /** たぬき: かなの粒のあいだに まぜる字を入れる（およそ 2 字に 1 つ。はじめと終わりにも入ることがある） */
  function addFiller(tokens, key, seed) {
    if (!key.filler) return tokens.slice();
    var rng = C.makeRng(seed, 303), out = [], fi = KANA_INDEX[key.filler];
    var kataMost = tokens.filter(function (t) { return t.t === 'k' && t.kata; }).length > tokens.filter(function (t) { return t.t === 'k' && !t.kata; }).length;
    var filler = function () { return { t: 'k', i: fi, mark: 0, small: false, kata: kataMost, filler: true }; };
    var nk = tokens.filter(function (t) { return t.t === 'k'; }).length, added = 0;
    tokens.forEach(function (t, j) {
      if (t.t === 'k' && rng.next() < 0.45) { out.push(filler()); added++; }
      out.push(t);
      if (j === tokens.length - 1 && t.t === 'k' && rng.next() < 0.3) { out.push(filler()); added++; }
    });
    // かなが 2 字以上あるのに 1 つも入らなかったら、まん中に 1 つ
    if (!added && nk >= 1) {
      var mid = out.findIndex(function (t, j) { return t.t === 'k' && j >= Math.floor(out.length / 2); });
      out.splice(mid < 0 ? 0 : mid, 0, filler());
    }
    return out;
  }

  /** 暗号にする。返り値の粒には、え・きごう なら sym、ばんごう なら num が付く */
  function encode(tokens, key, seed) {
    var out = tokens.map(function (t) { return encTok(t, key, 1); });
    if (key.method === 'tanuki') out = addFiller(out, key, seed);
    out = out.map(function (t) {
      if (key.method === 'pict' && t.t !== 'o') return Object.assign({}, t, { sym: (t.t === 'k' ? key.kana : key.alpha)[t.i] });
      if (key.method === 'num' && t.t !== 'o') return Object.assign({}, t, { num: numOf(t) });
      return t;
    });
    if (key.rev) out = reverseLines(out);
    return out;
  }

  /** 暗号の粒をもどす（紙に書いた暗号を手で読み取るのと同じ順: さかさ → まぜた字をぬく → 表で もどす） */
  function decode(cipher, key) {
    var t = cipher.slice();
    if (key.rev) t = reverseLines(t);
    if (key.method === 'tanuki' && key.filler) {
      var fi = KANA_INDEX[key.filler];
      t = t.filter(function (x) { return !(x.t === 'k' && x.i === fi && !x.mark && !x.small); });
    }
    if (key.method === 'pict') {
      var ik = invert(key.kana), ia = invert(key.alpha);
      t = t.map(function (x) {
        if (x.sym === undefined) return x;
        var o = Object.assign({}, x); delete o.sym;
        if (ik[x.sym] !== undefined) { o.t = 'k'; o.i = ik[x.sym]; delete o.up; } else { o.t = 'a'; o.i = ia[x.sym]; }
        return o;
      });
    }
    if (key.method === 'num') {
      t = t.map(function (x) {
        if (x.num === undefined) return x;
        var o = Object.assign({}, x), n = x.num; delete o.num;
        if (n <= NK) { o.t = 'k'; o.i = n - 1; } else { o.t = 'a'; o.i = n - NK - 1; }
        return o;
      });
    }
    return t.map(function (x) { return encTok(x, key, -1); });
  }

  /** 暗号の 1 粒が、もとの何の字か（答えのページで暗号の下に書く）。たぬき の まぜた字は null */
  function plainOf(tok, key) {
    if (tok.t === 'o') return tok.ch;
    var k = Object.assign({}, key, { rev: false });
    var d = decode([tok], k);
    return d.length ? charOf(d[0]) : null;
  }

  /** ばんごう: あ＝1 … ん＝46、英字は A＝47 … Z＝72（かなと重ならないように続ける） */
  function numOf(t) { return t.t === 'k' ? t.i + 1 : NK + t.i + 1; }

  /** 暗号の粒を、画面にそのまま写せる文にする（え・きごう は □） */
  function cipherText(tokens) {
    if (tokens.some(function (t) { return t.num !== undefined; })) {
      // ばんごう: 数と数のあいだは空白。もとの文の空白は「／」
      var parts = [];
      tokens.forEach(function (t) {
        if (t.num !== undefined) parts.push(String(t.num) + MARK_CHARS[t.mark || 0] + (t.small ? '小' : ''));
        else if (t.ch === ' ' || t.ch === '　') parts.push('／');
        else parts.push(t.ch);
      });
      return parts.join(' ').replace(/ ?\n ?/g, '\n');
    }
    return tokens.map(function (t) { return t.sym !== undefined ? '□' : charOf(t); }).join('');
  }

  // ---------------------------------------------------------------
  // 手で写した暗号を もどす（画面の「暗号を とく」）。え・きごう は字で入れられないので対象外
  // ---------------------------------------------------------------
  function decodeText(text, key) {
    var toks;
    if (key.method === 'num') {
      // 数字（1〜72）と、あとにつく ゛゜ を読む。ほかの字は そのまま
      toks = [];
      var s = String(text || '').replace(/\u309B/g, '\u3099').replace(/\u309C/g, '\u309A').normalize('NFKC');
      var re = /(\d+)([\u3099\u309A]?)(小?)|([\s\S])/g, m;
      while ((m = re.exec(s))) {
        if (m[1]) {
          var n = Number(m[1]);
          if (n >= 1 && n <= NK + NA) {
            var mk = m[2] === '\u3099' ? 1 : m[2] ? 2 : 0;
            toks.push({ t: n <= NK ? 'k' : 'a', i: 0, mark: mk, small: !!m[3], kata: false, up: true, num: n });
          } else toks.push({ t: 'o', ch: m[1], bad: true });
        } else if (m[4] === '／' || m[4] === '/') toks.push({ t: 'o', ch: ' ' });
        else if (m[4] === ' ' || m[4] === '　' || m[4] === '\t') { /* 数の区切り */ }
        else toks.push({ t: 'o', ch: m[4] });
      }
    } else toks = tokenize(text);
    return detokenize(decode(toks, key));
  }

  // ---------------------------------------------------------------
  // 入れた文の確かめ（画面に出すお知らせ）
  // ---------------------------------------------------------------
  function checkMessage(tokens, state, key) {
    var notes = [];
    var bad = tokens.filter(function (t) { return t.bad; }).map(function (t) { return t.ch; });
    if (bad.length) {
      var uniq = bad.filter(function (c, i) { return bad.indexOf(c) === i; }).slice(0, 8).join(' ');
      notes.push('暗号にできない字はそのまま残ります（' + uniq + '）。漢字はひらがなにしてください。');
    }
    if (state.method === 'shift' && tokens.some(function (t) { return t.t === 'a'; }) && shiftAlpha(state.key) === 0) {
      notes.push('ずらす数が 26 なので、英字は変わりません。ほかの数にしてください。');
    }
    if (state.method === 'num' && tokens.some(function (t) { return t.t === 'o' && /[0-9]/.test(t.ch); })) {
      notes.push('数字は暗号の番号とまぎらわしいので、ひらがなで書くのがおすすめです。');
    }
    if (state.method === 'tanuki' && key && !key.filler) notes.push('まぜる字が見つかりません（文に使っていない字がない）。ほかの方式にしてください。');
    if (state.method === 'tanuki' && !tokens.some(function (t) { return t.t === 'k'; })) notes.push('たぬきは、ひらがな・カタカナの文で使います。');
    return notes;
  }

  // ---------------------------------------------------------------
  // 設定（保存・共有・バックアップで同じ形）
  // ---------------------------------------------------------------
  var DEFAULTS = {
    method: 'shift', msg: '', key: 3, seed: 0, rev: false, hint: true,
    title: '', to: '', from: '', pages: { cipher: true, tool: true, answer: true }, credit: true,
  };
  function str(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }
  function normalize(o) {
    o = o && typeof o === 'object' ? o : {};
    var s = JSON.parse(JSON.stringify(DEFAULTS));
    if (METHOD_KEYS.indexOf(o.method) >= 0) s.method = o.method;
    if (typeof o.msg === 'string') s.msg = Array.from(o.msg.replace(/\r\n?/g, '\n')).slice(0, MAX_LEN).join('');
    var k = Math.floor(Number(o.key));
    if (k >= 1 && k <= KEY_MAX) s.key = k;
    var sd = Number(o.seed);
    s.seed = Number.isFinite(sd) && sd >= 0 ? Math.floor(sd) >>> 0 : 0;
    s.rev = o.rev === true;
    s.hint = o.hint !== false;
    s.title = str(o.title, 24); s.to = str(o.to, 16); s.from = str(o.from, 16);
    if (o.pages && typeof o.pages === 'object') ['cipher', 'tool', 'answer'].forEach(function (p) { if (typeof o.pages[p] === 'boolean') s.pages[p] = o.pages[p]; });
    s.credit = o.credit !== false;
    if (TANUKI_ORDER.indexOf(o.filler) >= 0) s.filler = o.filler;   // 共有リンクの たぬき の まぜる字（ふだんは持たない）
    return s;
  }

  /** 共有リンクの # 以降（"s=" は付けない）。文・だれへ・だれから は withMsg のときだけ入れる */
  function encodeShare(state, withMsg) {
    var s = normalize(state);
    var o = { m: s.method, k: s.key, sd: s.seed, r: s.rev ? 1 : 0, h: s.hint ? 1 : 0, c: s.credit ? 1 : 0 };
    if (s.method === 'tanuki') { var kf = makeKey(s, tokenize(s.msg)).filler; if (kf) o.f = kf; }
    if (withMsg) { o.msg = s.msg; if (s.title) o.ti = s.title; if (s.to) o.to = s.to; if (s.from) o.fr = s.from; }
    return C.b64uEncode(JSON.stringify(o));
  }
  /** location.hash から読む。読めなければ null。withMsg は文が入っていたか */
  function decodeShare(hash) {
    var m = /(?:^#|&)s=([A-Za-z0-9_-]+)/.exec(hash || '');
    if (!m) return null;
    var o;
    try { o = JSON.parse(C.b64uDecode(m[1])); } catch (e) { return null; }
    if (!o || typeof o !== 'object') return null;
    var withMsg = typeof o.msg === 'string';
    var s = normalize({ method: o.m, key: o.k, seed: o.sd, rev: o.r === 1, hint: o.h !== 0, credit: o.c !== 0,
      msg: withMsg ? o.msg : '', title: o.ti, to: o.to, from: o.fr, filler: o.f,
      pages: { cipher: withMsg, tool: true, answer: false } });
    return { state: s, withMsg: withMsg };
  }

  /** 画面と紙に使う一式 */
  function build(state) {
    var s = normalize(state);
    var tokens = tokenize(s.msg);
    var key = makeKey(s, tokens);
    var cipher = encode(tokens, key, s.seed);
    return { state: s, tokens: tokens, key: key, cipher: cipher, notes: checkMessage(tokens, s, key),
      hasKana: tokens.some(function (t) { return t.t === 'k'; }), hasAlpha: tokens.some(function (t) { return t.t === 'a'; }) };
  }

  var api = {
    KANA: KANA, ALPHA: ALPHA, DAKU: DAKU, HANDAKU: HANDAKU, SMALL: SMALL, METHODS: METHODS, METHOD_KEYS: METHOD_KEYS,
    MAX_LEN: MAX_LEN, KEY_MAX: KEY_MAX, SYMBOLS: SYMBOLS, SHARE_MAX: SHARE_MAX, DEFAULTS: DEFAULTS,
    tokenize: tokenize, detokenize: detokenize, charOf: charOf, smallByStyle: smallByStyle, toKata: toKata,
    makeKey: makeKey, encode: encode, decode: decode, plainOf: plainOf, decodeText: decodeText, cipherText: cipherText, numOf: numOf, shiftAlpha: shiftAlpha,
    reverseLines: reverseLines, derange: derange, checkMessage: checkMessage,
    normalize: normalize, encodeShare: encodeShare, decodeShare: decodeShare, build: build,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Angou = api;
})(this);
