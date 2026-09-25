// ===========================
// ローマ字タイピング — 画面の制御（メニュー・出題・入力・結果・記録）
// 打ち方の判定は ../romaji.js（makeTyper）、問題と記録の形は game.js。保存のキーは gakushu-print_romaji（サイト README 12）
// 入力は 1 つの入力欄で受ける（パソコンのキーボードでも、タブレット・スマホの画面のキーボードでも同じ）
// ===========================
(function () {
  'use strict';

  var G = window.RomajiGame, R = window.Romaji, C = window.Calc;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'gakushu-print_romaji';
  var HINT_AFTER = 2;     // お手本を出さないとき、同じところで 2 回まちがえたら残りを見せる

  function load() {
    try { var v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 保存できなくても遊べる */ }
  }
  var raw = load() || {};
  var data = { settings: G.normalizeSettings(raw.settings), records: G.normalizeRecords(raw.records) };

  function newSeed() {
    try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch (e) { return Math.floor(Math.random() * 4294967296); }
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function show(id) {
    ['scr-menu', 'scr-play', 'scr-result'].forEach(function (s) { $(s).hidden = s !== id; });
    document.body.classList.toggle('playing', id === 'scr-play');
    window.scrollTo(0, 0);
  }
  function sec(ms) { return (Math.floor(ms / 100) / 10).toFixed(1); }

  // --- メニュー ---
  function writeMenu() {
    var s = data.settings;
    $('level').value = s.level;
    document.querySelectorAll('input[name="sys"]').forEach(function (r) { r.checked = r.value === s.sys; });
    $('guide').checked = s.guide;
    document.querySelectorAll('input[name="count"]').forEach(function (r) { r.checked = Number(r.value) === s.count; });
    updateMenu();
  }
  function readMenu() {
    var v = function (n) { var r = document.querySelector('input[name="' + n + '"]:checked'); return r ? r.value : null; };
    data.settings = G.normalizeSettings({ level: $('level').value, sys: v('sys'), guide: $('guide').checked, count: v('count') });
    updateMenu();
    save();
  }
  function updateMenu() {
    var s = data.settings;
    var b = data.records.best[G.bestKey(s)];
    $('best-line').textContent = b ? 'この言葉・問題数のいちばん速い記録: ' + sec(b.ms) + ' びょう（まちがい ' + b.miss + '・' + b.date + '）' : 'この言葉・問題数の記録はまだありません。';
    $('to-print').href = '../#' + G.printHash(s, newSeed());
    renderRecords();
  }
  document.querySelector('.menu').addEventListener('change', readMenu);

  function renderRecords() {
    var r = data.records;
    var keys = Object.keys(r.best).sort();
    $('rec-state').textContent = r.plays ? r.plays + ' 回あそんだ' : 'まだありません';
    $('rec-table').innerHTML = keys.length ? '<tr><th>言葉</th><th>問題数</th><th>いちばん速い</th></tr>' + keys.map(function (k) {
      var p = k.split('|'), b = r.best[k];
      return '<tr><td>' + esc(G.LEVEL_NAMES[p[0]]) + '</td><td class="num">' + p[1] + '</td><td class="num">' + sec(b.ms) + ' 秒（' + G.perMinute(b.keys, b.ms) + ' 打/分）</td></tr>';
    }).join('') : '';
    var weak = G.weakList(r, 15);
    $('weak-list').innerHTML = weak.length ? weak.map(function (k) { return '<li>' + esc(k) + ' ' + esc(R.spell(k, data.settings.sys)) + '（' + r.miss[k] + '）</li>'; }).join('') : '<li>まだありません</li>';
  }

  // --- 出題 ---
  var play = null;   // { s, words, i, typer, start, keys, miss, missHere, missed[], timerId }

  function start() {
    readMenu();
    var s = data.settings;
    play = { s: s, words: G.makeQuestions(s, newSeed()), i: 0, typer: null, start: 0, keys: 0, miss: 0, missHere: 0, missed: [], timerId: 0 };
    show('scr-play');
    loadWord();
    play.start = performance.now();
    play.timerId = setInterval(function () { if (play) $('timer').textContent = sec(performance.now() - play.start); }, 100);
    $('timer').textContent = '0.0';
    $('miss-count').textContent = '0';
    $('type-box').value = '';
    $('type-box').focus();
  }
  function loadWord() {
    var w = play.words[play.i];
    play.typer = R.makeTyper(w.k, play.s.sys);
    play.missHere = 0;
    $('w-kanji').textContent = w.w;
    $('w-kana').textContent = w.w === w.k ? '' : w.k;
    $('progress').textContent = (play.i + 1) + ' / ' + play.words.length;
    renderRoma();
  }
  function renderRoma(missed) {
    var g = play.typer.guide();
    var showRest = play.s.guide || play.missHere >= HINT_AFTER;
    $('roma').innerHTML = '<span class="done">' + esc(g.typed) + '</span>' + (missed ? '<span class="miss">' + esc(missed) + '</span>' : '') +
      '<span class="rest' + (showRest ? '' : ' hide') + '">' + esc(g.rest || '') + '</span>';
    $('next-key').textContent = showRest ? (g.rest || '').charAt(0) : '?';
  }
  function typeChar(ch) {
    if (!play || !/^[a-z'\-]$/i.test(ch)) return;
    // 「ん」で終わる語を n 1 つで打ち終えたあとの、もう 1 つの n は数えない（前の語の器が受け流す）
    var prev = play.prevTyper;
    play.prevTyper = null;
    if (prev && ch.toLowerCase() === 'n' && play.typer.typed() === '' && prev.key('n').ignored) return;
    var cur = play.typer.current();
    var r = play.typer.key(ch);
    if (r.ignored) return;
    if (!r.ok) {
      play.miss++;
      play.missHere++;
      if (cur) play.missed.push(cur);
      $('miss-count').textContent = String(play.miss);
      renderRoma(ch);
      return;
    }
    play.keys++;
    play.missHere = 0;
    if (r.done) {
      play.i++;
      if (play.i >= play.words.length) return finish();
      var fin = play.typer;
      loadWord();
      play.prevTyper = fin;
      return;
    }
    renderRoma();
  }

  var composing = false;
  $('type-box').addEventListener('compositionstart', function () { composing = true; $('ime-warn').hidden = false; });
  $('type-box').addEventListener('compositionend', function () { composing = false; this.value = ''; });
  $('type-box').addEventListener('input', function (e) {
    if (composing || e.isComposing) return;
    var v = this.value;
    this.value = '';
    if (/[^\x20-\x7e]/.test(v)) { $('ime-warn').hidden = false; return; }
    $('ime-warn').hidden = true;
    Array.from(v).forEach(function (c) { typeChar(c); });
  });
  $('type-box').addEventListener('keydown', function (e) { if (e.key === 'Escape') quit(); });
  // 画面のどこかを押して入力欄から外れても、出題中は戻す
  $('scr-play').addEventListener('click', function (e) { if (!e.target.closest('button')) $('type-box').focus(); });

  function quit() { if (play) clearInterval(play.timerId); play = null; show('scr-menu'); updateMenu(); }
  $('quit').addEventListener('click', quit);

  // --- 結果 ---
  function finish() {
    clearInterval(play.timerId);
    var ms = performance.now() - play.start, p = play;
    play = null;
    var res = G.addResult(data.records, p.s, ms, p.keys, p.miss, p.missed, today());
    data.records = res.rec;
    save();
    $('r-time').textContent = sec(ms) + ' びょう';
    $('r-new').hidden = !(res.isBest && res.prev);
    $('r-sub').textContent = G.LEVEL_NAMES[p.s.level] + '・' + p.words.length + '問・' + G.perMinute(p.keys, ms) + ' 打/分・まちがい ' + p.miss + ' 回' +
      (res.prev && !res.isBest ? '・いちばん速い記録 ' + sec(res.prev.ms) + ' びょう' : '');
    var uniq = p.missed.filter(function (m, i, a) { return a.indexOf(m) === i; });
    $('r-miss').innerHTML = uniq.map(function (k) { return '<li>' + esc(k) + ' ' + esc(R.spell(k, p.s.sys)) + '</li>'; }).join('');
    $('r-print').href = '../#' + G.printHash(p.s, newSeed());
    show('scr-result');
    $('again').focus();
  }
  $('again').addEventListener('click', start);
  $('to-menu').addEventListener('click', function () { show('scr-menu'); updateMenu(); });
  $('start').addEventListener('click', start);

  // --- 書き出し・読み込み・消去（サイト README 20。ファイルは端末の中で作るだけで、送信しない） ---
  $('rec-export').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(C.buildBackup(C.TOOL, { romaji: data }), null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = C.backupFileName(C.TOOL + '-romaji');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    $('rec-msg').textContent = 'ファイルに書き出しました。新しい端末では「ファイルから読み込む」で戻せます。';
  });
  $('rec-import').addEventListener('click', function () { $('rec-file').click(); });
  $('rec-file').addEventListener('change', function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (!f) return;
    if (f.size > 1024 * 1024) { $('rec-msg').textContent = 'ファイルが大きすぎます。'; return; }
    f.text().then(function (text) {
      var r = C.parseBackup(text, C.TOOL, ['romaji']);
      if (!r.ok) { $('rec-msg').textContent = r.error; return; }
      if (!window.confirm('ファイルの内容で、いまのローマ字タイピングの記録を置き換えます。よろしいですか？')) return;
      data = { settings: G.normalizeSettings(r.data.romaji.settings), records: G.normalizeRecords(r.data.romaji.records) };
      save(); writeMenu();
      $('rec-msg').textContent = 'ファイルから読み込みました。';
    }, function () { $('rec-msg').textContent = 'ファイルを読み取れませんでした。'; });
  });
  $('rec-reset').addEventListener('click', function () {
    if (!window.confirm('ローマ字タイピングの記録を消します。よろしいですか？')) return;
    data.records = G.normalizeRecords({});
    save(); updateMenu();
    $('rec-msg').textContent = '記録を消しました。';
  });

  writeMenu();
  save();
})();
