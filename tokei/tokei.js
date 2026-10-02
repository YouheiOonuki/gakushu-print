// ===========================
// 時計の読み方 — 針の動き・問題・えらぶ答え・判定・記録・印刷の紙（画面から切り離した純粋関数）
// 時刻の作り方・読み方（ふん／ぷん）・針の角度は学習プリントの時計（calc.js の genClock・clockText・funPun・handAngles）と同じ
// ブラウザでは window.Tokei、Node（テスト）では module.exports で使う。企画は yorozu-plans の docs/54_暗記カードと時計.md（ROADMAP K35）
// ===========================
(function (root) {
  'use strict';

  var Calc = root.Calc || (typeof require !== 'undefined' ? require('../calc.js') : null);
  var Sheets = root.Sheets || (typeof require !== 'undefined' ? require('../sheets.js') : null);

  var LEVELS = Calc.CLOCK_LEVELS;          // hour（なんじ）・half（なんじはん）・five（5 ふん）・min（1 ぷん）
  var LEVEL_NAMES = { hour: 'なんじ', half: 'なんじはん', five: '5ふん きざみ', min: '1ぷん きざみ' };
  var MODES = ['move', 'read', 'set'];       // うごかして よむ／よみを えらぶ／はりを あわせる
  var QUESTIONS = 10;                        // 1 回の問題の数（えらぶ・あわせる）
  var DAY = 720;                             // 12 時間＝720 分（時計の 1 周）

  function mod(a, n) { return ((a % n) + n) % n; }
  /** 時刻 {h: 1〜12, m: 0〜59} ⇄ 0 時からの分（0〜719。12 時ちょうどが 0） */
  function toMin(t) { return mod((t.h % 12) * 60 + t.m, DAY); }
  function fromMin(T) { T = mod(Math.round(T), DAY); return { h: Math.floor(T / 60) || 12, m: T % 60 }; }

  /** 針を動かすときの きざみ（分）。なんじ・なんじはん・5 ふん は 5 分、1 ぷん は 1 分 */
  function dragStep(level) { return level === 'min' ? 1 : 5; }

  /** 時計のまん中から見た向き（12 の方向が 0 度、時計回り。0〜360） */
  function angleOf(dx, dy) { return mod(Math.atan2(dx, -dy) * 180 / Math.PI, 360); }

  /**
   * 長い針を deg に動かしたときの時刻。12 をこえて回すと短い針も 1 時間すすむ（もどすと 1 時間もどる）
   * @param {number} T いまの時刻（分）
   */
  function dragMinute(T, deg, step) {
    T = mod(T, DAY);
    var m = mod(Math.round(deg / 6 / step) * step, 60);
    var prev = T % 60, hour = Math.floor(T / 60);
    if (m - prev < -30) hour++;              // 12 を右回りにこえた
    else if (m - prev > 30) hour--;          // 12 を左回りにこえた
    return mod(hour * 60 + m, DAY);
  }
  /** 短い針を deg に動かしたときの時刻（短い針は 1 周で 12 時間。長い針もいっしょに回る） */
  function dragHour(deg, step) {
    return mod(Math.round(deg * 2 / step) * step, DAY);
  }
  /**
   * どちらの針をつかんだか。短い針の近く（まん中から 60 まで、向きのずれが長い針より小さい）なら hour
   * @param {number} r まん中からの距離（文字盤の半径 88 の単位）
   */
  function grabHand(T, deg, r) {
    var a = Calc.handAngles(fromMin(T));
    var d = function (x) { var v = Math.abs(mod(deg - x, 360)); return Math.min(v, 360 - v); };
    return r <= 60 && d(a.hour) < d(a.minute) ? 'hour' : 'minute';
  }

  /** 画面に出す読み方（3じ、3じ30ぷん）。calc.js と同じ */
  function reading(T) { return Calc.clockText(fromMin(T)); }

  /** 問題の時刻（学習プリントと同じ作り方。組み合わせを一巡するまで重ならない） */
  function questions(level, seed, n) {
    return Calc.genClock({ level: level }, seed, n || QUESTIONS).map(toMin);
  }

  /**
   * えらぶ答え（4 つ。正しい読み＋まちがえやすい読み）。まちがえやすい読みは
   * ①短い針が次の数字に近いので 1 時間すすめて読む ②1 時間もどす ③長い針と短い針を取りちがえる ④長い針の数字をそのまま分と読む
   * それでも足りなければ、同じきざみの近い時刻から足す。順は rng で並べかえる
   * @returns {number[]} 時刻（分）の配列。正しい時刻を 1 つだけ含む
   */
  function choices(T, level, rng) {
    T = mod(T, DAY);
    var t = fromMin(T), out = [T], fits = function (x) { return Calc.clockFits(level, fromMin(x).m); };
    var add = function (x) { x = mod(x, DAY); if (out.indexOf(x) < 0 && fits(x) && out.length < 4) out.push(x); };
    if (t.m >= 30) add(T + 60);
    add(T - 60);
    if (t.m % 5 === 0) add(toMin({ h: (t.m / 5) || 12, m: (t.h % 12) * 5 }));       // 針の取りちがえ
    if (t.m % 5 === 0 && t.m > 0 && t.m / 5 !== t.m) add(toMin({ h: t.h, m: t.m / 5 }));  // 15 分を「3 ぷん」
    add(T + 60);
    var step = level === 'hour' ? 60 : level === 'half' ? 30 : level === 'five' ? 5 : 1;
    for (var k = 1; out.length < 4 && k < 12; k++) {
      var sgn = rng.next() < 0.5 ? 1 : -1;
      add(T + sgn * k * step);
      add(T - sgn * k * step);
    }
    return rng.shuffle(out);
  }

  /** あわせた時刻があっているか（短い針は長い針といっしょに動くので、分が同じなら合っている） */
  function isSame(a, b) { return mod(a, DAY) === mod(b, DAY); }

  // ---------------------------------------------------------------
  // 記録（gakushu-print_tokei）
  // ---------------------------------------------------------------
  function defaults() { return { mode: 'move', level: 'half', guide: true, hide: false, print: { mode: 'read', guide: true, answers: true, credit: true } }; }
  function oneOf(v, list, d) { return list.indexOf(v) >= 0 ? v : d; }
  function normalizeSettings(v) {
    var o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}, d = defaults();
    var p = o.print && typeof o.print === 'object' ? o.print : {};
    return {
      mode: oneOf(o.mode, MODES, d.mode), level: oneOf(o.level, LEVELS, d.level),
      guide: o.guide === undefined ? d.guide : !!o.guide, hide: !!o.hide,
      print: {
        mode: oneOf(p.mode, ['read', 'draw'], d.print.mode), guide: p.guide === undefined ? true : !!p.guide,
        answers: p.answers === undefined ? true : !!p.answers, credit: p.credit === undefined ? true : !!p.credit,
      },
    };
  }
  /** いちばんよい点（えらぶ・あわせる × きざみ。0〜10） */
  function normalizeRecords(v) {
    var o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}, out = {};
    ['read', 'set'].forEach(function (m) {
      out[m] = {};
      LEVELS.forEach(function (l) {
        var x = o[m] && typeof o[m] === 'object' ? o[m][l] : undefined;
        if (typeof x === 'number' && x >= 0 && x <= QUESTIONS && x % 1 === 0) out[m][l] = x;
      });
    });
    return out;
  }
  function recordScore(rec, mode, level, score) {
    var r = normalizeRecords(rec), prev = r[mode][level];
    var best = prev === undefined || score > prev;
    if (best) r[mode][level] = score;
    return { records: r, best: best, prev: prev };
  }

  // ---------------------------------------------------------------
  // 画面の時計（SVG。viewBox -110..110。針は id で動かす）
  // ---------------------------------------------------------------
  function faceSvg(guide) {
    var s = '<circle r="92" class="tk-face"/>';
    for (var i = 0; i < 60; i++) {
      var a = i * 6 * Math.PI / 180, big = i % 5 === 0, r1 = 90, r2 = big ? 79 : 85;
      s += '<line x1="' + (Math.sin(a) * r1).toFixed(2) + '" y1="' + (-Math.cos(a) * r1).toFixed(2) + '" x2="' + (Math.sin(a) * r2).toFixed(2) + '" y2="' + (-Math.cos(a) * r2).toFixed(2) + '" class="' + (big ? 'tk-tb' : 'tk-t') + '"/>';
    }
    for (var h = 1; h <= 12; h++) {
      var b = h * 30 * Math.PI / 180;
      s += '<text x="' + (Math.sin(b) * 64).toFixed(2) + '" y="' + (-Math.cos(b) * 64 + 8).toFixed(2) + '" class="tk-num">' + h + '</text>';
      if (guide) s += '<text x="' + (Math.sin(b) * 102).toFixed(2) + '" y="' + (-Math.cos(b) * 102 + 3.5).toFixed(2) + '" class="tk-gnum">' + (h * 5 % 60 || 60) + '</text>';
    }
    return s;
  }

  // ---------------------------------------------------------------
  // 印刷（A4 1 枚に文字盤 12 こ。下に きりとる こたえ）
  // ---------------------------------------------------------------
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var PRINT_COUNT = 12;
  /**
   * @param {object} o { level, mode: read|draw, guide, answers, credit, seed }
   * @returns {string} <section class="sheet ...">
   */
  function printSheet(o) {
    var items = Calc.genClock({ level: o.level }, o.seed, PRINT_COUNT);
    var read = o.mode !== 'draw';
    var h = '<section class="sheet sheet-clock tk-sheet" data-kind="tokei">';
    h += '<header class="sh-head"><div class="sh-title"><h3>' + (read ? 'とけいの よみかた' : 'とけいの はりを かこう') + '</h3>' +
      '<p class="sh-sub">' + esc(LEVEL_NAMES[o.level]) + '</p></div>' +
      '<div class="sh-fields"><span class="f f-name"><span class="lbl">なまえ</span><span class="box name"></span></span>' +
      '<span class="f f-date"><span class="box xs"></span>がつ<span class="box xs"></span>にち</span>' +
      '<span class="f f-score"><span class="lbl">せいかい</span><span class="box sm"></span>／' + PRINT_COUNT + '</span></div></header>';
    h += '<p class="sh-inst">' + (read ? 'なんじ なんぷん ですか。' : 'とけいに ながい はりと みじかい はりを かきましょう。') + '</p>';
    h += '<div class="sh-body"><ol class="ck ck-c12 tk-ck">';
    items.forEach(function (t, i) {
      var label = read ? (o.level === 'hour' ? '（　　　）じ' : '（　　　）じ（　　　）ふん') : Calc.clockText(t);
      h += '<li><span class="no">(' + (i + 1) + ')</span>' + Sheets.clockSvg(t, read, o.guide, false) + '<span class="ck-label">' + label + '</span></li>';
    });
    h += '</ol></div>';
    if (o.answers) {
      h += '<div class="tk-ans"><p class="tk-cut">✂ きりとり せん（こたえ）</p><ol class="tk-ans-list' + (read ? '' : ' tk-ans-draw') + '">';
      items.forEach(function (t, i) {
        h += '<li><span class="no">(' + (i + 1) + ')</span>' + (read ? '<span class="ans-fill">' + Calc.clockText(t) + '</span>' : Sheets.clockSvg(t, true, false, true)) + '</li>';
      });
      h += '</ol></div>';
    }
    h += '<footer class="sh-foot"><span>もんだい ばんごう ' + Calc.seedLabel(o.seed) + '</span>' +
      (o.credit ? '<span class="credit">' + esc(Calc.CREDIT) + '</span>' : '<span></span>') + '</footer>';
    return h + '</section>';
  }

  var api = {
    LEVELS: LEVELS, LEVEL_NAMES: LEVEL_NAMES, MODES: MODES, QUESTIONS: QUESTIONS, DAY: DAY, PRINT_COUNT: PRINT_COUNT,
    toMin: toMin, fromMin: fromMin, dragStep: dragStep, angleOf: angleOf, dragMinute: dragMinute, dragHour: dragHour, grabHand: grabHand,
    reading: reading, questions: questions, choices: choices, isSame: isSame,
    defaults: defaults, normalizeSettings: normalizeSettings, normalizeRecords: normalizeRecords, recordScore: recordScore,
    faceSvg: faceSvg, printSheet: printSheet,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Tokei = api;
})(this);
