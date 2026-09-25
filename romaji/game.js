// ===========================
// ローマ字タイピング — 問題・記録（画面から切り離した純粋関数）
// 打ち方の判定は ../romaji.js、言葉の一覧は ../romaji-words.js
// ブラウザでは window.RomajiGame、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var R = root.Romaji || (typeof require !== 'undefined' ? require('../romaji.js') : null);
  var WORDS = root.RomajiWords || (typeof require !== 'undefined' ? require('../romaji-words.js') : null);
  var Calc = root.Calc || (typeof require !== 'undefined' ? require('../calc.js') : null);

  var LEVELS = ['kana', '1', '2', '3', '4', '5', '6'];    // kana = 1 字ずつ（ローマ字表の字）
  var COUNTS = [10, 20];
  var LEVEL_NAMES = { kana: '1 字ずつ（ローマ字表）', 1: '1 年生の漢字の言葉', 2: '2 年生の漢字の言葉', 3: '3 年生の漢字の言葉', 4: '4 年生の漢字の言葉（都道府県）', 5: '5 年生の漢字の言葉', 6: '6 年生の漢字の言葉' };

  function normalizeSettings(v) {
    var o = v && typeof v === 'object' ? v : {};
    return {
      level: LEVELS.indexOf(String(o.level)) >= 0 ? String(o.level) : '3',
      sys: o.sys === 'kun' ? 'kun' : 'hep',
      guide: o.guide === undefined ? true : !!o.guide,
      count: COUNTS.indexOf(Number(o.count)) >= 0 ? Number(o.count) : 10,
    };
  }

  /** ローマ字表の字（清音・ん・濁音・半濁音・拗音）。1 字ずつのレベルの問題 */
  function kanaPool() {
    var out = [];
    ['seion', 'dakuon', 'yoon'].forEach(function (k) {
      R.TABLE[k].forEach(function (row) { R.tableRow(row).forEach(function (c) { if (c) out.push({ w: c, k: c }); }); });
    });
    return out;
  }

  /** 問題の並び（重ならないように混ぜる。一覧が足りないときは一巡してから次） */
  function makeQuestions(s, seed) {
    var pool = s.level === 'kana' ? kanaPool() : WORDS[s.level];
    var rng = Calc.makeRng(seed, 909);
    var out = [], bag = [];
    while (out.length < s.count) {
      if (!bag.length) bag = rng.shuffle(pool);
      var w = bag.pop();
      if (out.length && out[out.length - 1].k === w.k && bag.length) { bag.unshift(w); continue; }
      out.push(w);
    }
    return out;
  }

  /** 書くときのローマ字（固有名詞は頭を大文字） */
  function writeForm(word, sys) {
    var r = R.spell(word.k, sys);
    return word.p ? r.charAt(0).toUpperCase() + r.slice(1) : r;
  }

  function bestKey(s) { return s.level + '|' + s.count; }

  /** 記録をそろえる。best: レベルと問題数ごとのいちばん速い記録、miss: まちがえたかな（かたまり）ごとの数 */
  function normalizeRecords(v) {
    var o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    var best = {}, miss = {};
    var b = o.best && typeof o.best === 'object' ? o.best : {};
    Object.keys(b).forEach(function (k) {
      if (!/^(kana|[1-6])\|(10|20)$/.test(k)) return;
      var r = b[k] || {};
      var ms = Math.round(Number(r.ms)), miss2 = Math.round(Number(r.miss)), keys = Math.round(Number(r.keys));
      if (!(ms > 0 && ms < 3600000)) return;
      best[k] = { ms: ms, miss: miss2 >= 0 ? Math.min(miss2, 9999) : 0, keys: keys > 0 ? Math.min(keys, 99999) : 0, date: typeof r.date === 'string' ? r.date.slice(0, 10) : '' };
    });
    var m = o.miss && typeof o.miss === 'object' ? o.miss : {};
    Object.keys(m).slice(0, 300).forEach(function (k) {
      if (!/^[ぁ-ゖ]{1,2}$/.test(k)) return;
      var n = Math.round(Number(m[k]));
      if (n > 0) miss[k] = Math.min(n, 9999);
    });
    var plays = Math.round(Number(o.plays));
    return { best: best, miss: miss, plays: plays > 0 ? Math.min(plays, 999999) : 0 };
  }

  /** 1 分あたりの打った文字数（正しく打った文字だけ） */
  function perMinute(keys, ms) { return ms > 0 ? Math.round(keys * 60000 / ms) : 0; }

  /**
   * 1 回を終えたときの記録の更新。速さは「時間」で比べる（同じレベル・同じ問題数）
   * @param {string[]} missedKana まちがえたときのかな（かたまり）
   */
  function addResult(rec, s, ms, keys, missCount, missedKana, date) {
    var r = normalizeRecords(JSON.parse(JSON.stringify(rec)));
    var k = bestKey(s);
    var prev = r.best[k] || null;
    var isBest = !prev || ms < prev.ms;
    if (isBest) r.best[k] = { ms: Math.round(ms), miss: missCount, keys: keys, date: date };
    missedKana.forEach(function (c) { r.miss[c] = (r.miss[c] || 0) + 1; });
    r.plays++;
    return { rec: normalizeRecords(r), isBest: isBest, prev: prev };
  }

  function weakList(rec, limit) {
    return Object.keys(rec.miss).sort(function (x, y) { return rec.miss[y] - rec.miss[x] || (x < y ? -1 : 1); }).slice(0, limit || 12);
  }

  /** 学習プリント（ローマ字）の共有リンク（# 以降）。同じ学年の言葉・同じつづり */
  function printHash(s, seed) {
    var st = { type: 'romaji', seed: seed >>> 0, romaji: { source: s.level === 'kana' ? 'table' : 'words', grade: s.level === 'kana' ? 3 : Number(s.level), sys: s.sys, mode: 'trace', pages: 1 } };
    return 's=' + Calc.encodeShare(st, false);
  }

  var api = { LEVELS: LEVELS, COUNTS: COUNTS, LEVEL_NAMES: LEVEL_NAMES, normalizeSettings: normalizeSettings, kanaPool: kanaPool, makeQuestions: makeQuestions,
    writeForm: writeForm, bestKey: bestKey, normalizeRecords: normalizeRecords, perMinute: perMinute, addResult: addResult, weakList: weakList, printHash: printHash };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RomajiGame = api;
})(this);
