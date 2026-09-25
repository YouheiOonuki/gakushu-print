// ===========================
// 九九ゲーム — 問題・判定・記録（画面から切り離した純粋関数）
// 問題の並びは学習プリントの九九（calc.js の genKuku）と同じ作り方（ばらばらは全部を一巡してから次、同じ問題を続けない）
// ブラウザでは window.KukuGame、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var Calc = root.Calc || (typeof require !== 'undefined' ? require('../calc.js') : null);

  var COUNTS = [10, 20, 0];          // 0 = 選んだ段の全部（段の数 × 9）
  var MAX_MISS_KEYS = 200;
  var MAX_BEST = 100;

  function uniqSorted(a) {
    return (Array.isArray(a) ? a : []).map(Number)
      .filter(function (x, i, arr) { return x >= 1 && x <= 9 && x % 1 === 0 && arr.indexOf(x) === i; })
      .sort(function (x, y) { return x - y; });
  }

  /** 設定をそろえる。dir: fwd（式→答え）／rev（答え→式）、order: seq（1 から順）／random、count: 10・20・0（全部） */
  function normalizeSettings(v) {
    var o = v && typeof v === 'object' ? v : {};
    var dans = uniqSorted(o.dans);
    var dir = o.dir === 'rev' ? 'rev' : 'fwd';
    var order = o.order === 'seq' ? 'seq' : 'random';
    if (dir === 'rev') order = 'random';     // 逆は答えの並びをばらばらにだけ出す
    var count = COUNTS.indexOf(Number(o.count)) >= 0 ? Number(o.count) : 10;
    if (order === 'seq') count = 0;           // 順番どおりは選んだ段の全部
    return { dir: dir, dans: dans.length ? dans : [2], order: order, count: count };
  }

  /** 選んだ段の答え（重なりなし、小さい順）。逆のときの問題のもと */
  function products(dans) {
    var seen = {}, out = [];
    dans.forEach(function (d) { for (var i = 1; i <= 9; i++) if (!seen[d * i]) { seen[d * i] = true; out.push(d * i); } });
    return out.sort(function (x, y) { return x - y; });
  }

  /** 1〜9 どうしで p になる式（a × b の組。6×7 と 7×6 は別に数える） */
  function pairsOf(p) {
    var out = [];
    for (var a = 1; a <= 9; a++) if (p % a === 0 && p / a >= 1 && p / a <= 9) out.push([a, p / a]);
    return out;
  }

  /** 問題の数（count が 0 のときは段の数 × 9。逆は答えの種類の数） */
  function totalOf(s) {
    if (s.count) return s.count;
    return s.dir === 'rev' ? products(s.dans).length : s.dans.length * 9;
  }

  /**
   * 問題の並びを作る。fwd は {a, b}、rev は {p}
   * @param {object} s normalizeSettings 済み
   * @param {number} seed
   */
  function makeQuestions(s, seed) {
    var n = totalOf(s);
    if (s.dir === 'fwd') {
      var list = Calc.genKuku({ dans: s.dans, order: s.order === 'seq' ? 'seq' : 'random' }, seed, n);
      return list.slice(0, n).map(function (q) { return { a: q.a, b: q.b }; });
    }
    var rng = Calc.makeRng(seed, 808);
    var pool = products(s.dans), out = [], bag = [];
    while (out.length < n) {
      if (!bag.length) bag = rng.shuffle(pool);
      var p = bag.pop();
      var prev = out[out.length - 1];
      if (prev && prev.p === p && bag.length) { bag.unshift(p); continue; }
      out.push({ p: p });
    }
    return out;
  }

  /** 問題の答えの桁数（fwd）。逆は 2（□ × □ の 2 つ） */
  function needDigits(q) { return q.p ? 2 : String(q.a * q.b).length; }

  /** 判定。digits は押した数字の文字列（'42'、逆は '67' で 6×7） */
  function judge(q, digits) {
    var d = String(digits || '');
    if (q.p) {
      if (d.length !== 2) return false;
      var x = Number(d[0]), y = Number(d[1]);
      return x >= 1 && y >= 1 && x * y === q.p;
    }
    return d !== '' && Number(d) === q.a * q.b && /^\d+$/.test(d);
  }

  /** まちがえた記録のキー（fwd は 6×7、rev は =42） */
  function missKey(q) { return q.p ? '=' + q.p : q.a + '×' + q.b; }

  /** 記録のキー（設定ごとのいちばん速い記録） */
  function bestKey(s) { return [s.dir, s.dans.join(''), s.order, s.count].join('|'); }

  /** 記録（localStorage・ファイル）をそろえる */
  function normalizeRecords(v) {
    var o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    var best = {}, miss = {};
    var b = o.best && typeof o.best === 'object' ? o.best : {};
    Object.keys(b).slice(0, MAX_BEST).forEach(function (k) {
      if (!/^(fwd|rev)\|[1-9]{1,9}\|(seq|random)\|(0|10|20)$/.test(k)) return;
      var r = b[k] || {};
      var ms = Math.round(Number(r.ms));
      if (!(ms > 0 && ms < 3600000)) return;
      best[k] = { ms: ms, date: typeof r.date === 'string' ? r.date.slice(0, 10) : '' };
    });
    var m = o.miss && typeof o.miss === 'object' ? o.miss : {};
    Object.keys(m).slice(0, MAX_MISS_KEYS).forEach(function (k) {
      if (!/^([1-9]×[1-9]|=\d{1,2})$/.test(k)) return;
      var n = Math.round(Number(m[k]));
      if (n > 0) miss[k] = Math.min(n, 9999);
    });
    var plays = Math.round(Number(o.plays));
    return { best: best, miss: miss, plays: plays > 0 ? Math.min(plays, 999999) : 0 };
  }

  /**
   * 1 回を終えたときの記録の更新（元の記録は変えずに新しいものを返す）
   * @param {object} rec normalizeRecords 済み
   * @param {object} s 設定
   * @param {number} ms かかった時間
   * @param {string[]} missed まちがえた問題のキー（重なりあり）
   * @param {string} date YYYY-MM-DD
   * @returns {{rec: object, isBest: boolean, prevMs: number|null}}
   */
  function addResult(rec, s, ms, missed, date) {
    var r = normalizeRecords(JSON.parse(JSON.stringify(rec)));
    var k = bestKey(s);
    var prev = r.best[k] ? r.best[k].ms : null;
    var isBest = prev === null || ms < prev;
    if (isBest) r.best[k] = { ms: Math.round(ms), date: date };
    missed.forEach(function (m) { r.miss[m] = (r.miss[m] || 0) + 1; });
    r.plays++;
    return { rec: normalizeRecords(r), isBest: isBest, prevMs: prev };
  }

  /** にがて（まちがえた数の多い順。同じ数は小さい順） */
  function weakList(rec, dir, limit) {
    return Object.keys(rec.miss).filter(function (k) { return dir === 'rev' ? k[0] === '=' : k[0] !== '='; })
      .sort(function (x, y) { return rec.miss[y] - rec.miss[x] || (x < y ? -1 : 1); })
      .slice(0, limit || 12);
  }

  /** 秒の表示（12.3） */
  function secText(ms) { return (Math.floor(ms / 100) / 10).toFixed(1); }

  /**
   * まちがえた九九を学習プリント（九九・入れた問題だけ）の共有リンクにする（# 以降。名前は入れない）
   * 逆の問題は、その答えになる式をすべて入れる
   */
  function printHash(missedKeys, seed) {
    var lines = [], seen = {};
    missedKeys.forEach(function (k) {
      var list = k[0] === '=' ? pairsOf(Number(k.slice(1))) : [k.split('×').map(Number)];
      list.forEach(function (ab) { var t = ab[0] + '×' + ab[1]; if (!seen[t]) { seen[t] = true; lines.push(t); } });
    });
    if (!lines.length) return '';
    var dans = uniqSorted(lines.map(function (t) { return Number(t[0]); }));
    var st = { type: 'kuku', seed: seed >>> 0, kuku: { dans: dans, order: 'random', count: 20, pages: 1, custom: lines.join('\n'), customMode: lines.length >= 10 ? 'only' : 'mix' } };
    return 's=' + Calc.encodeShare(st, false);
  }

  var api = {
    COUNTS: COUNTS, normalizeSettings: normalizeSettings, products: products, pairsOf: pairsOf, totalOf: totalOf,
    makeQuestions: makeQuestions, needDigits: needDigits, judge: judge, missKey: missKey, bestKey: bestKey,
    normalizeRecords: normalizeRecords, addResult: addResult, weakList: weakList, secText: secText, printHash: printHash,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KukuGame = api;
})(this);
