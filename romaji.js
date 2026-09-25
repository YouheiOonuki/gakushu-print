// ===========================
// ローマ字 — かなをローマ字にする（プリント）・キーボードの入力を判定する（タイピング）
// DOM に触らない純粋関数。ブラウザでは window.Romaji、Node（テスト）では module.exports で使う
//
// つづりの根拠（出典と確認日は constants.js の romajiRule）:
// - 'hep': 「ローマ字のつづり方」（令和7年12月22日 内閣告示第4号）の本表。し shi・ち chi・つ tsu・ふ fu・じ／ぢ ji・ず／づ zu・を o・しゃ sha…
// - 'kun': 同じ告示の「（付）対照表」にある、昭和29年内閣告示第1号の第1表のつづり（いわゆる訓令式）。
//          し si・ち ti・つ tu・ふ hu・じ／ぢ zi・づ zu・しゃ sya・ちゃ tya・じゃ zya…
// - 長音は、添え書き 3 (2) の「母音字を並べる」書き方（現代仮名遣いと同様のつづり。おかあさん okaasan、とうきょう toukyou）。
//   符号（ō）を付ける書き方は、かなだけでは長音かどうか決められないので出さない
// - 撥音「ん」は n。次が母音字か y のときは n'（添え書き 1・4）。促音「っ」は次の子音字を重ねる（ch は c を重ねる。添え書き 2）
//
// キーボードの入力（タイピング）は、上の 2 つのつづりのどちらでも、ふつうのローマ字入力（IME）の打ち方でも正解にする
// （si・shi・ci、tu・tsu、nn、xtu・ltu など）。ん は IME と同じく、次が あ行・や行・な行 のときは nn か n' が要る
// ===========================
(function (root) {
  'use strict';

  // 1 字のかな → つづりの候補。[0] が本表（ヘボン式）、kun があればそれが訓令式（第1表）。残りはキーボードで通る打ち方
  var K1 = {
    'あ': ['a'], 'い': ['i', 'yi'], 'う': ['u', 'wu', 'whu'], 'え': ['e'], 'お': ['o'],
    'か': ['ka', 'ca'], 'き': ['ki'], 'く': ['ku', 'cu', 'qu'], 'け': ['ke'], 'こ': ['ko', 'co'],
    'さ': ['sa'], 'し': ['shi', 'si', 'ci'], 'す': ['su'], 'せ': ['se', 'ce'], 'そ': ['so'],
    'た': ['ta'], 'ち': ['chi', 'ti'], 'つ': ['tsu', 'tu'], 'て': ['te'], 'と': ['to'],
    'な': ['na'], 'に': ['ni'], 'ぬ': ['nu'], 'ね': ['ne'], 'の': ['no'],
    'は': ['ha'], 'ひ': ['hi'], 'ふ': ['fu', 'hu'], 'へ': ['he'], 'ほ': ['ho'],
    'ま': ['ma'], 'み': ['mi'], 'む': ['mu'], 'め': ['me'], 'も': ['mo'],
    'や': ['ya'], 'ゆ': ['yu'], 'よ': ['yo'],
    'ら': ['ra'], 'り': ['ri'], 'る': ['ru'], 'れ': ['re'], 'ろ': ['ro'],
    'わ': ['wa'], 'を': ['o', 'wo'],
    'が': ['ga'], 'ぎ': ['gi'], 'ぐ': ['gu'], 'げ': ['ge'], 'ご': ['go'],
    'ざ': ['za'], 'じ': ['ji', 'zi'], 'ず': ['zu'], 'ぜ': ['ze'], 'ぞ': ['zo'],
    'だ': ['da'], 'ぢ': ['ji', 'zi', 'di'], 'づ': ['zu', 'du'], 'で': ['de'], 'ど': ['do'],
    'ば': ['ba'], 'び': ['bi'], 'ぶ': ['bu'], 'べ': ['be'], 'ぼ': ['bo'],
    'ぱ': ['pa'], 'ぴ': ['pi'], 'ぷ': ['pu'], 'ぺ': ['pe'], 'ぽ': ['po'],
    // 小さい字（1 字だけで打つとき）
    'ぁ': ['xa', 'la'], 'ぃ': ['xi', 'li'], 'ぅ': ['xu', 'lu'], 'ぇ': ['xe', 'le'], 'ぉ': ['xo', 'lo'],
    'ゃ': ['xya', 'lya'], 'ゅ': ['xyu', 'lyu'], 'ょ': ['xyo', 'lyo'], 'ゎ': ['xwa', 'lwa'],
  };
  // 訓令式（昭和29年告示 第1表）で本表とちがうもの。対照表のとおり
  var KUN1 = { 'し': 'si', 'ち': 'ti', 'つ': 'tu', 'ふ': 'hu', 'じ': 'zi', 'ぢ': 'zi' };

  // 拗音（2 字）。[0] が本表、kun は第1表
  var YOON = {};
  var YOON_KUN = {};
  (function () {
    var small = { 'ゃ': 'a', 'ゅ': 'u', 'ょ': 'o' };
    var plain = { 'き': 'ky', 'に': 'ny', 'ひ': 'hy', 'み': 'my', 'り': 'ry', 'ぎ': 'gy', 'び': 'by', 'ぴ': 'py' };
    Object.keys(plain).forEach(function (k) {
      Object.keys(small).forEach(function (s) { YOON[k + s] = [plain[k] + small[s]]; });
    });
    Object.keys(small).forEach(function (s) {
      var v = small[s];
      YOON['し' + s] = ['sh' + v, 'sy' + v];            YOON_KUN['し' + s] = 'sy' + v;
      YOON['ち' + s] = ['ch' + v, 'ty' + v, 'cy' + v];  YOON_KUN['ち' + s] = 'ty' + v;
      YOON['じ' + s] = ['j' + v, 'zy' + v, 'jy' + v];   YOON_KUN['じ' + s] = 'zy' + v;
      YOON['ぢ' + s] = ['j' + v, 'zy' + v, 'dy' + v];   YOON_KUN['ぢ' + s] = 'zy' + v;
    });
  })();

  var SMALL_TSU = ['xtu', 'ltu', 'xtsu', 'ltsu'];
  var VOWEL_Y = /^[aiueoy]/;

  function toHira(s) {
    return String(s).replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); });
  }

  /** かなを「かたまり」（1 字か拗音の 2 字）に分ける。持っていない字があれば null */
  function chunks(kana) {
    var a = Array.from(toHira(kana)), out = [];
    for (var i = 0; i < a.length; i++) {
      var two = a[i] + (a[i + 1] || '');
      if (YOON[two]) { out.push(two); i++; continue; }
      if (a[i] === 'っ' || a[i] === 'ん' || K1[a[i]]) { out.push(a[i]); continue; }
      return null;
    }
    return out;
  }

  /** そのかたまりの代表のつづり（sys: 'hep' 本表 ／ 'kun' 第1表） */
  function mainSpell(ch, sys) {
    if (YOON[ch]) return sys === 'kun' && YOON_KUN[ch] ? YOON_KUN[ch] : YOON[ch][0];
    if (sys === 'kun' && KUN1[ch]) return KUN1[ch];
    return K1[ch][0];
  }

  /**
   * 書くときのローマ字（プリント・お手本）。小文字。固有名詞は呼ぶ側で頭を大文字にする
   * @param {string} kana ひらがな（カタカナも可）
   * @param {'hep'|'kun'} sys
   */
  function spell(kana, sys) {
    var cs = chunks(kana);
    if (!cs) return '';
    var out = '';
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (c === 'ん') {
        var nx = cs[i + 1] && cs[i + 1] !== 'っ' && cs[i + 1] !== 'ん' ? mainSpell(cs[i + 1], sys) : '';
        out += VOWEL_Y.test(nx) ? "n'" : 'n';
      } else if (c === 'っ') {
        var nx2 = cs[i + 1] && cs[i + 1] !== 'っ' && cs[i + 1] !== 'ん' ? mainSpell(cs[i + 1], sys) : '';
        out += /^[bcdfghjkmpqrstvwxz]/.test(nx2) ? nx2[0] : 'xtu';   // ch は c を重ねる（matcha → maccha）
      } else out += mainSpell(c, sys);
    }
    return out;
  }

  // ---------------------------------------------------------------
  // タイピングの判定
  // ---------------------------------------------------------------

  /** 位置 i のかたまりの候補（打ち方の文字列と、進むかたまりの数）。sys の代表を先頭に */
  function candidates(cs, i, sys) {
    var c = cs[i];
    if (c === undefined) return [];
    var list = [];
    var add = function (s, n) { if (!list.some(function (x) { return x.s === s && x.n === n; })) list.push({ s: s, n: n }); };
    if (c === 'ん') {
      var next = candidates(cs, i + 1, sys);
      // 1 つの n で打てるのは、次が子音字（n・y 以外）で始まるとき、または語の終わり（IME と同じ）
      var single = !next.length || next.every(function (x) { return /^[bcdfghjkmpqrstvwxz]/.test(x.s); });
      if (single) add('n', 1);
      add('nn', 1); add("n'", 1); add('xn', 1);
      return list;
    }
    if (c === 'っ') {
      var nx = candidates(cs, i + 1, sys);
      nx.forEach(function (x) {
        if (!/^[bcdfghjkmpqrstvwxz]/.test(x.s) || /^x|^l/.test(x.s)) return;
        add(x.s[0] + x.s, 1 + x.n);
        if (x.s.slice(0, 2) === 'ch') add('t' + x.s, 1 + x.n);   // っち は tchi でも（cchi が本表）
      });
      SMALL_TSU.forEach(function (s) { add(s, 1); });
      return list;
    }
    if (YOON[c]) {
      add(mainSpell(c, sys), 1);
      YOON[c].forEach(function (s) { add(s, 1); });
      // 2 字を別々に（き＋ゃ → ki xya）
      var a = c[0], b = c[1];
      [mainSpell(a, sys)].concat(K1[a]).forEach(function (s1) { K1[b].forEach(function (s2) { add(s1 + s2, 1); }); });
      return list;
    }
    add(mainSpell(c, sys), 1);
    K1[c].forEach(function (s) { add(s, 1); });
    return list;
  }

  /**
   * 1 語の打ち方を判定する器を作る。いくつもの打ち方を同時に追いかける（si も shi も、みんな は minnna も）
   * @param {string} kana
   * @param {'hep'|'kun'} sys お手本に出すつづり
   */
  function makeTyper(kana, sys) {
    var cs = chunks(kana) || [];
    var states = [{ pos: 0, buf: '' }];
    var typed = '';
    var done = !cs.length;
    var endsWithN = cs[cs.length - 1] === 'ん';
    var swallowN = false;

    function step(sts, ch) {
      var out = [], seen = {};
      sts.forEach(function (st) {
        var t = st.buf + ch;
        candidates(cs, st.pos, sys).forEach(function (cd) {
          var ns = null;
          if (cd.s === t) ns = { pos: st.pos + cd.n, buf: '' };
          else if (cd.s.indexOf(t) === 0) ns = { pos: st.pos, buf: t };
          if (ns && !seen[ns.pos + '|' + ns.buf]) { seen[ns.pos + '|' + ns.buf] = true; out.push(ns); }
        });
      });
      return out;
    }

    /** 1 文字を打つ。ok: 正しい打ち方の続きか。done: 語を打ち終えたか */
    function key(ch) {
      ch = String(ch).toLowerCase();
      if (done) {
        // 「ん」で終わる語を n 1 つで打ち終えたあとの、もう 1 つの n は数えない
        if (swallowN && ch === 'n') { swallowN = false; return { ok: true, done: true, ignored: true }; }
        return { ok: false, done: true };
      }
      var next = step(states, ch);
      if (!next.length) return { ok: false, done: false };
      states = next;
      typed += ch;
      if (states.some(function (s) { return s.pos === cs.length && !s.buf; })) {
        done = true;
        swallowN = endsWithN && /n$/.test(typed) && !/nn$|n'$/.test(typed);
      }
      return { ok: true, done: done };
    }

    /** お手本: 打った分と、残りの打ち方（いまの打ち方に合わせる） */
    function guide() {
      if (done) return { typed: typed, rest: '' };
      // いちばん進んでいる打ち方を選ぶ
      var best = states.slice().sort(function (a, b) { return b.pos - a.pos || b.buf.length - a.buf.length; })[0];
      var rest = '';
      var cands = candidates(cs, best.pos, sys).filter(function (c) { return c.s.indexOf(best.buf) === 0; });
      var cur = cands[0];
      if (cur) {
        rest = cur.s.slice(best.buf.length);
        rest += typingSpell(cs, best.pos + cur.n, sys);
      }
      return { typed: typed, rest: rest };
    }

    /** いま打っているかな（かたまり）。まちがえた字の記録に使う */
    function current() {
      if (done) return '';
      var best = states.slice().sort(function (a, b) { return b.pos - a.pos; })[0];
      return cs[best.pos] || '';
    }

    return { key: key, guide: guide, current: current, isDone: function () { return done; }, typed: function () { return typed; }, chunks: cs };
  }

  /** キーボードで打つときの代表の打ち方（位置 from から終わりまで）。ん は IME の打ち方（n か nn） */
  function typingSpell(cs, from, sys) {
    var out = '';
    for (var i = from || 0; i < cs.length;) {
      var cd = candidates(cs, i, sys)[0];
      if (cs[i] === 'ん') cd = candidates(cs, i, sys).filter(function (x) { return x.s === 'n' || x.s === 'nn'; })[0];
      out += cd.s;
      i += cd.n;
    }
    return out;
  }

  /** 語をキーボードで打つときの代表の打ち方（テスト・画面用） */
  function typingOf(kana, sys) {
    var cs = chunks(kana);
    return cs ? typingSpell(cs, 0, sys) : '';
  }

  /** ローマ字表に出すかな（行ごと）。プリントのローマ字表と使い方ページの表が使う */
  var TABLE = {
    seion: ['あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの', 'はひふへほ', 'まみむめも', 'や・ゆ・よ', 'らりるれろ', 'わ・・・を', 'ん'],
    dakuon: ['がぎぐげご', 'ざじずぜぞ', 'だぢづでど', 'ばびぶべぼ', 'ぱぴぷぺぽ'],
    yoon: ['きゃきゅきょ', 'しゃしゅしょ', 'ちゃちゅちょ', 'にゃにゅにょ', 'ひゃひゅひょ', 'みゃみゅみょ', 'りゃりゅりょ', 'ぎゃぎゅぎょ', 'じゃじゅじょ', 'びゃびゅびょ', 'ぴゃぴゅぴょ'],
  };
  /** 表の 1 行をマスに分ける（'・' は空きのマス） */
  function tableRow(row) {
    var a = Array.from(row), out = [];
    for (var i = 0; i < a.length; i++) {
      if (a[i + 1] && /[ゃゅょ]/.test(a[i + 1])) { out.push(a[i] + a[i + 1]); i++; } else out.push(a[i] === '・' ? '' : a[i]);
    }
    return out;
  }

  var api = { K1: K1, KUN1: KUN1, YOON: YOON, YOON_KUN: YOON_KUN, TABLE: TABLE, toHira: toHira, chunks: chunks, mainSpell: mainSpell, spell: spell,
    candidates: candidates, makeTyper: makeTyper, typingOf: typingOf, tableRow: tableRow };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Romaji = api;
})(this);
