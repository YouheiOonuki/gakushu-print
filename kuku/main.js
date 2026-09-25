// ===========================
// 九九ゲーム — 画面の制御（メニュー・出題・テンキー・結果・記録）
// 問題と判定と記録の形は game.js。保存のキーは gakushu-print_kuku（サイト README 12）
// ===========================
(function () {
  'use strict';

  var G = window.KukuGame, C = window.Calc;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'gakushu-print_kuku';
  var FEEDBACK_MS = 1100;      // まちがえたとき、答えを見せる時間

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
  function show(id) {
    ['scr-menu', 'scr-play', 'scr-result'].forEach(function (s) { $(s).hidden = s !== id; });
    document.body.classList.toggle('playing', id === 'scr-play');
    window.scrollTo(0, 0);
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function keyLabel(k) { return k[0] === '=' ? '□×□＝' + k.slice(1) : k.replace('×', '×'); }
  function settingsLabel(s) {
    return (s.dir === 'rev' ? '逆・' : '') + (s.dans.length === 9 ? 'ぜんぶの段' : s.dans.join('・') + 'の段') + '・' +
      (s.order === 'seq' ? '1 から順' : 'ばらばら') + '・' + G.totalOf(s) + '問';
  }

  // --- メニュー ⇄ 設定 ---
  function writeMenu() {
    var s = data.settings;
    document.querySelectorAll('input[name="dir"]').forEach(function (r) { r.checked = r.value === s.dir; });
    document.querySelectorAll('input[name="dan"]').forEach(function (c) { c.checked = s.dans.indexOf(Number(c.value)) >= 0; });
    document.querySelectorAll('input[name="order"]').forEach(function (r) { r.checked = r.value === s.order; });
    document.querySelectorAll('input[name="count"]').forEach(function (r) { r.checked = Number(r.value) === s.count; });
    updateMenu();
  }
  function readMenu() {
    var v = function (n) { var r = document.querySelector('input[name="' + n + '"]:checked'); return r ? r.value : null; };
    var dans = Array.prototype.filter.call(document.querySelectorAll('input[name="dan"]'), function (c) { return c.checked; }).map(function (c) { return Number(c.value); });
    data.settings = G.normalizeSettings({ dir: v('dir'), dans: dans, order: v('order'), count: v('count') });
    // 段を全部外したときは、正規化で 2 の段になるので画面もそろえる
    if (!dans.length) writeMenu();
    updateMenu();
    save();
  }
  function updateMenu() {
    var s = data.settings;
    $('order-row').hidden = s.dir === 'rev';
    $('count-row').hidden = s.order === 'seq';
    var all = G.totalOf({ dir: s.dir, dans: s.dans, order: s.order, count: 0 });
    $('count-all').textContent = 'ぜんぶ（' + all + '）';
    var b = data.records.best[G.bestKey(s)];
    $('best-line').textContent = b ? 'この出し方のいちばん速い記録: ' + G.secText(b.ms) + ' びょう（' + b.date + '）' : 'この出し方の記録はまだありません。';
    renderRecords();
  }
  document.querySelector('.menu').addEventListener('change', readMenu);
  $('dan-all').addEventListener('click', function () {
    document.querySelectorAll('input[name="dan"]').forEach(function (c) { c.checked = true; });
    readMenu();
  });

  // --- 記録（メニューの折りたたみ） ---
  function renderRecords() {
    var r = data.records;
    var keys = Object.keys(r.best).sort(function (a, b) { return r.best[a].ms - r.best[b].ms; }).slice(0, 10);
    $('rec-state').textContent = r.plays ? r.plays + ' 回あそんだ' : 'まだありません';
    $('rec-table').innerHTML = keys.length ? '<tr><th>出し方</th><th>いちばん速い</th></tr>' + keys.map(function (k) {
      var p = k.split('|');
      var s = G.normalizeSettings({ dir: p[0], dans: p[1].split('').map(Number), order: p[2], count: Number(p[3]) });
      return '<tr><td>' + esc(settingsLabel(s)) + '</td><td class="num">' + G.secText(r.best[k].ms) + ' 秒</td></tr>';
    }).join('') : '';
    var weak = G.weakList(r, 'fwd', 12).concat(G.weakList(r, 'rev', 6));
    $('weak-list').innerHTML = weak.length ? weak.map(function (k) { return '<li>' + esc(keyLabel(k)) + '（' + r.miss[k] + '）</li>'; }).join('') : '<li>まだありません</li>';
    var h = G.printHash(weak, newSeed());
    $('weak-print').hidden = !h;
    if (h) $('weak-print').href = '../#' + h;
  }

  // --- 出題 ---
  var play = null;   // { s, queue, i, done, total, start, digits, missed[], locked, timerId }

  function start(settings, questions) {
    var s = settings;
    var qs = questions || G.makeQuestions(s, newSeed());
    play = { s: s, queue: qs.slice(), total: qs.length, done: 0, start: 0, digits: '', missed: [], locked: false, timerId: 0, onlyMissed: !!questions };
    show('scr-play');
    renderQuestion();
    play.start = performance.now();
    play.timerId = setInterval(tick, 100);
    tick();
  }
  function tick() {
    if (!play) return;
    $('timer').textContent = G.secText(performance.now() - play.start);
  }
  function renderQuestion(state) {
    var q = play.queue[0];
    var d = play.digits;
    var cls = state === 'ok' ? ' ok' : state === 'ng' ? ' ng' : '';
    $('question').className = 'question' + cls;
    if (q.p) {
      var x = d[0] || '', y = d[1] || '';
      $('question').innerHTML = '<span class="slot">' + (x || '&nbsp;') + '</span> × <span class="slot">' + (y || '&nbsp;') + '</span> ＝ ' + q.p;
      $('question').setAttribute('aria-label', 'なに かける なに が ' + q.p);
    } else {
      $('question').innerHTML = q.a + ' × ' + q.b + ' ＝ <span class="slot wide">' + (d || '&nbsp;') + '</span>';
      $('question').setAttribute('aria-label', q.a + ' かける ' + q.b + ' は');
    }
    $('progress').textContent = Math.min(play.done + 1, play.total) + ' / ' + play.total;
  }
  function press(d) {
    if (!play || play.locked) return;
    var q = play.queue[0];
    if (d === 'back') { play.digits = play.digits.slice(0, -1); renderQuestion(); return; }
    if (q.p && d === '0') return;                  // 逆は 1〜9 だけ
    if (play.digits.length >= G.needDigits(q)) return;
    play.digits += d;
    renderQuestion();
    if (play.digits.length < G.needDigits(q)) return;
    if (G.judge(q, play.digits)) {
      $('fb').className = 'fb ok';
      $('fb').textContent = q.p ? 'せいかい　' + G.pairsOf(q.p).map(function (ab) { return ab[0] + '×' + ab[1]; }).join('・') : 'せいかい';
      renderQuestion('ok');
      play.locked = true;
      setTimeout(function () { next(true); }, q.p ? 450 : 180);
    } else {
      play.missed.push(G.missKey(q));
      $('fb').className = 'fb ng';
      $('fb').textContent = q.p ? 'こたえ: ' + G.pairsOf(q.p).map(function (ab) { return ab[0] + '×' + ab[1]; }).join('・') : 'こたえ: ' + q.a + '×' + q.b + '＝' + q.a * q.b;
      renderQuestion('ng');
      play.locked = true;
      setTimeout(function () { next(false); }, FEEDBACK_MS);
    }
  }
  function next(ok) {
    var q = play.queue.shift();
    if (ok) play.done++;
    else play.queue.push(q);              // まちがえた問題は、最後にもう一度
    play.digits = '';
    play.locked = false;
    $('fb').textContent = '';
    if (!play.queue.length) return finish();
    renderQuestion();
  }
  function stopTimer() { if (play) clearInterval(play.timerId); }

  $('pad').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-d]');
    if (b) press(b.getAttribute('data-d'));
  });
  // パソコンのキーボードでも
  document.addEventListener('keydown', function (e) {
    if ($('scr-play').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key)) { press(e.key); e.preventDefault(); }
    else if (e.key === 'Backspace') { press('back'); e.preventDefault(); }
    else if (e.key === 'Escape') { quit(); }
  });
  function quit() { stopTimer(); play = null; show('scr-menu'); updateMenu(); }
  $('quit').addEventListener('click', quit);

  // --- 結果 ---
  var last = null;
  function finish() {
    stopTimer();
    var ms = performance.now() - play.start;
    var p = play;
    play = null;
    var res = p.onlyMissed ? null : G.addResult(data.records, p.s, ms, p.missed, today());
    if (res) data.records = res.rec;
    else p.missed.forEach(function (m) { data.records.miss[m] = (data.records.miss[m] || 0) + 1; });
    save();
    last = p;
    $('r-time').textContent = G.secText(ms) + ' びょう';
    $('r-new').hidden = !(res && res.isBest && res.prevMs !== null);
    var uniq = p.missed.filter(function (m, i, a) { return a.indexOf(m) === i; });
    $('r-sub').textContent = settingsLabel(p.s) + (p.onlyMissed ? '（まちがえた問題だけ）' : '') + '・まちがい ' + p.missed.length + ' 回' +
      (res && res.prevMs !== null && !res.isBest ? '・いちばん速い記録 ' + G.secText(res.prevMs) + ' びょう' : '');
    $('r-miss').innerHTML = uniq.map(function (k) { return '<li>' + esc(keyLabel(k)) + '</li>'; }).join('');
    $('r-weak').hidden = !uniq.length;
    var h = G.printHash(uniq, newSeed());
    $('r-print').hidden = !h;
    if (h) $('r-print').href = '../#' + h;
    show('scr-result');
    $('again').focus();
  }
  $('again').addEventListener('click', function () { start(last ? last.s : data.settings); });
  $('r-weak').addEventListener('click', function () {
    var uniq = last.missed.filter(function (m, i, a) { return a.indexOf(m) === i; });
    var qs = uniq.map(function (k) { return k[0] === '=' ? { p: Number(k.slice(1)) } : { a: Number(k[0]), b: Number(k[2]) }; });
    start(last.s, qs);
  });
  $('to-menu').addEventListener('click', function () { show('scr-menu'); updateMenu(); });
  $('start').addEventListener('click', function () { readMenu(); start(data.settings); });

  // --- 書き出し・読み込み・消去（サイト README 20。ファイルは端末の中で作るだけで、送信しない） ---
  $('rec-export').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(C.buildBackup(C.TOOL, { kuku: data }), null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = C.backupFileName(C.TOOL + '-kuku');
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
      var r = C.parseBackup(text, C.TOOL, ['kuku']);
      if (!r.ok) { $('rec-msg').textContent = r.error; return; }
      if (!window.confirm('ファイルの内容で、いまの九九ゲームの記録を置き換えます。よろしいですか？')) return;
      data = { settings: G.normalizeSettings(r.data.kuku.settings), records: G.normalizeRecords(r.data.kuku.records) };
      save(); writeMenu();
      $('rec-msg').textContent = 'ファイルから読み込みました。';
    }, function () { $('rec-msg').textContent = 'ファイルを読み取れませんでした。'; });
  });
  // 記録を消すのは全ツール共通の「保存した内容をすべて消す」ボタン（../reset-storage.js）

  writeMenu();
  save();
})();
