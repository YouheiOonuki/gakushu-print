// ===========================
// 時計の読み方 — 画面の制御（メニュー・針のドラッグ・えらぶ・あわせる・結果・記録・印刷）
// 針の動き・問題・判定・紙は tokei.js。保存のキーは gakushu-print_tokei（サイト README 12）
// ===========================
(function () {
  'use strict';

  var K = window.Tokei, C = window.Calc;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'gakushu-print_tokei';
  var NEXT_MS = 900;          // 正解のあと、次の問題までの時間

  function load() {
    try { var v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 保存できなくても遊べる */ }
  }
  var raw = load() || {};
  var data = { settings: K.normalizeSettings(raw.settings), records: K.normalizeRecords(raw.records) };
  var S = function () { return data.settings; };

  function newSeed() {
    try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch (e) { return Math.floor(Math.random() * 4294967296); }
  }
  function show(id) {
    ['scr-menu', 'scr-play', 'scr-result'].forEach(function (s) { $(s).hidden = s !== id; });
    document.body.classList.toggle('playing', id === 'scr-play');
    window.scrollTo(0, 0);
  }

  // --- メニュー ---
  function radio(name) { var r = document.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : null; }
  function setRadio(name, v) { document.querySelectorAll('input[name="' + name + '"]').forEach(function (r) { r.checked = r.value === v; }); }
  function writeMenu() {
    var s = S();
    setRadio('mode', s.mode); setRadio('level', s.level); setRadio('pmode', s.print.mode);
    $('guide').checked = s.guide; $('hide').checked = s.hide;
    $('p-guide').checked = s.print.guide; $('p-answers').checked = s.print.answers; $('p-credit').checked = s.print.credit;
    updateMenu();
  }
  function readMenu() {
    data.settings = K.normalizeSettings({
      mode: radio('mode'), level: radio('level'), guide: $('guide').checked, hide: $('hide').checked,
      print: { mode: radio('pmode'), guide: $('p-guide').checked, answers: $('p-answers').checked, credit: $('p-credit').checked },
    });
    updateMenu();
    save();
  }
  function updateMenu() {
    var s = S(), r = data.records;
    var best = s.mode === 'move' ? undefined : r[s.mode][s.level];
    $('best-line').textContent = best === undefined ? '' : 'いままでで いちばん: ' + best + ' / ' + K.QUESTIONS;
    var rows = '<tr><th></th>' + K.LEVELS.map(function (l) { return '<th>' + K.LEVEL_NAMES[l] + '</th>'; }).join('') + '</tr>';
    [['read', 'えらぶ'], ['set', 'あわせる']].forEach(function (m) {
      rows += '<tr><th>' + m[1] + '</th>' + K.LEVELS.map(function (l) { var v = r[m[0]][l]; return '<td class="num">' + (v === undefined ? '—' : v) + '</td>'; }).join('') + '</tr>';
    });
    $('rec-table').innerHTML = rows;
    var n = 0; ['read', 'set'].forEach(function (m) { n += Object.keys(r[m]).length; });
    $('rec-state').textContent = n ? n + ' こ' : 'まだ ありません';
    renderPrint();
  }
  document.querySelectorAll('input[name="mode"], input[name="level"], input[name="pmode"]').forEach(function (el) { el.addEventListener('change', readMenu); });
  ['guide', 'p-guide', 'p-answers', 'p-credit'].forEach(function (id) { $(id).addEventListener('change', readMenu); });

  // --- 印刷（文字盤 12 こ） ---
  var printSeed = newSeed();
  function renderPrint() {
    var s = S();
    $('sheets').innerHTML = K.printSheet({ level: s.level, mode: s.print.mode, guide: s.print.guide, answers: s.print.answers, credit: s.print.credit, seed: printSeed });
    fitPreview();
  }
  function fitPreview() {
    var box = $('sheets'), w = box.clientWidth;
    if (!w) return;
    box.style.setProperty('--z', String(Math.min(1, (w - 4) / 794)));
  }
  addEventListener('resize', fitPreview);
  $('print-box').addEventListener('toggle', function () { document.body.classList.toggle('tk-print-open', $('print-box').open); fitPreview(); });
  $('p-reseed').addEventListener('click', function () { printSeed = newSeed(); renderPrint(); });
  $('p-print').addEventListener('click', function () { renderPrint(); window.print(); });

  // --- 時計 ---
  var T = 0;                 // いまの時刻（0〜719 分）
  var level = 'half', mode = 'move', step = 5;
  var deg = function (x) { return x * Math.PI / 180; };
  function drawHands() {
    var a = C.handAngles(K.fromMin(T));
    var put = function (line, knob, ang, len) {
      var x = (Math.sin(deg(ang)) * len).toFixed(2), y = (-Math.cos(deg(ang)) * len).toFixed(2);
      $(line).setAttribute('x2', x); $(line).setAttribute('y2', y);
      $(knob).setAttribute('cx', x); $(knob).setAttribute('cy', y);
    };
    put('h-hour', 'k-hour', a.hour, 48);
    put('h-min', 'k-min', a.minute, 80);
    $('clock').setAttribute('aria-label', 'とけい ' + K.reading(T));
    if (mode === 'move') {
      $('reading').innerHTML = S().hide ? '<span class="tk-hidden">？</span>' : K.reading(T) + ' <span class="tk-digital">' + K.fromMin(T).h + ':' + String(K.fromMin(T).m).padStart(2, '0') + '</span>';
    }
  }
  function ghost(t) {
    if (t === null) { $('ghost').setAttribute('hidden', ''); return; }
    var a = C.handAngles(K.fromMin(t));
    $('g-hour').setAttribute('x2', (Math.sin(deg(a.hour)) * 48).toFixed(2)); $('g-hour').setAttribute('y2', (-Math.cos(deg(a.hour)) * 48).toFixed(2));
    $('g-min').setAttribute('x2', (Math.sin(deg(a.minute)) * 80).toFixed(2)); $('g-min').setAttribute('y2', (-Math.cos(deg(a.minute)) * 80).toFixed(2));
    $('ghost').removeAttribute('hidden');
  }
  var draggable = false;
  function setDraggable(on) {
    draggable = on;
    $('clock').classList.toggle('drag', on);
    if (on) $('clock').setAttribute('tabindex', '0'); else $('clock').removeAttribute('tabindex');
  }

  // ドラッグ（指・マウス）。つかんだ針で動かし方を変える
  var grab = null;
  function pointerAt(e) {
    var r = $('clock').getBoundingClientRect();
    var sc = 224 / r.width;
    var dx = (e.clientX - r.left - r.width / 2) * sc, dy = (e.clientY - r.top - r.height / 2) * sc;
    return { deg: K.angleOf(dx, dy), r: Math.sqrt(dx * dx + dy * dy) };
  }
  $('clock').addEventListener('pointerdown', function (e) {
    if (!draggable) return;
    var p = pointerAt(e);
    if (p.r > 112) return;
    grab = K.grabHand(T, p.deg, p.r);
    $('clock').setPointerCapture(e.pointerId);
    e.preventDefault();
    moveTo(p);
  });
  $('clock').addEventListener('pointermove', function (e) { if (grab) moveTo(pointerAt(e)); });
  ['pointerup', 'pointercancel'].forEach(function (ev) { $('clock').addEventListener(ev, function () { grab = null; }); });
  function moveTo(p) {
    var nt = grab === 'hour' ? K.dragHour(p.deg, step) : K.dragMinute(T, p.deg, step);
    if (nt !== T) { T = nt; drawHands(); clearFb(); }
  }
  $('adj').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-d]');
    if (!b) return;
    var d = Number(b.dataset.d);
    if (Math.abs(d) === 5) d = d > 0 ? step : -step;
    T = ((T + d) % K.DAY + K.DAY) % K.DAY;
    drawHands(); clearFb();
  });
  $('clock').addEventListener('keydown', function (e) {
    if (!draggable) return;
    var d = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: 60, PageDown: -60 }[e.key];
    if (!d) return;
    e.preventDefault();
    T = ((T + d) % K.DAY + K.DAY) % K.DAY; drawHands(); clearFb();
  });
  $('hide').addEventListener('change', function () { readMenu(); drawHands(); });

  // --- 遊ぶ ---
  var qs = [], qi = 0, score = 0, misses = [], tries = 0, busy = false, rng = null;
  function clearFb() { if (mode === 'set') { $('fb').textContent = ''; $('fb').className = 'fb'; } }
  function start() {
    readMenu();
    var s = S();
    mode = s.mode; level = s.level; step = K.dragStep(level);
    $('face').innerHTML = K.faceSvg(s.guide);
    $('adj-m').textContent = '−' + step + (step === 1 ? 'ぷん' : 'ふん');
    $('adj-p').textContent = '＋' + step + (step === 1 ? 'ぷん' : 'ふん');
    $('adj-m').dataset.d = String(-step); $('adj-p').dataset.d = String(step);
    $('choices').hidden = mode !== 'read';
    $('adj').hidden = mode === 'read';
    $('move-row').hidden = mode !== 'move';
    $('ok-row').hidden = mode !== 'set';
    $('reading').hidden = mode !== 'move';
    $('score').textContent = '';
    ghost(null);
    $('fb').textContent = ''; $('fb').className = 'fb';
    show('scr-play');
    if (mode === 'move') {
      var now = new Date();
      T = K.toMin({ h: now.getHours() % 12 || 12, m: Math.floor(now.getMinutes() / step) * step });
      $('progress').textContent = 'うごかして よむ';
      $('prompt').textContent = 'ながい はりを ゆびで まわしてみよう';
      setDraggable(true);
      drawHands();
      return;
    }
    var seed = newSeed();
    rng = C.makeRng(seed, 900);
    qs = K.questions(level, seed, K.QUESTIONS); qi = 0; score = 0; misses = [];
    ask();
  }
  function ask() {
    busy = false; tries = 0;
    ghost(null);
    $('fb').textContent = ''; $('fb').className = 'fb';
    $('progress').textContent = (qi + 1) + ' / ' + qs.length;
    $('score').textContent = '○ ' + score;
    var q = qs[qi];
    if (mode === 'read') {
      setDraggable(false);
      T = q; drawHands();
      $('prompt').textContent = 'なんじ なんぷん？';
      var opts = K.choices(q, level, rng);
      $('choices').innerHTML = opts.map(function (x) { return '<button type="button" data-t="' + x + '">' + K.reading(x) + '</button>'; }).join('');
    } else {
      setDraggable(true);
      // はじめの針は 12 じ（答えと同じなら 6 じ）
      T = K.isSame(q, 0) ? 360 : 0; drawHands();
      $('prompt').innerHTML = '<strong>' + K.reading(q) + '</strong> に あわせよう';
    }
  }
  $('choices').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-t]');
    if (!b || busy) return;
    var q = qs[qi], ok = K.isSame(Number(b.dataset.t), q);
    if (ok) {
      busy = true;
      if (tries === 0) score++;
      b.classList.add('ok');
      $('fb').textContent = 'せいかい！'; $('fb').className = 'fb ok';
      setTimeout(nextQ, NEXT_MS);
    } else {
      tries++;
      b.classList.add('ng'); b.disabled = true;
      if (tries === 1) misses.push(q);
      $('fb').textContent = 'ちがうよ。みじかい はりと ながい はりを よく みてね'; $('fb').className = 'fb ng';
    }
  });
  $('ok').addEventListener('click', function () {
    if (busy || mode !== 'set') return;
    var q = qs[qi];
    if (K.isSame(T, q)) {
      busy = true;
      if (tries === 0) score++;
      $('fb').textContent = 'せいかい！'; $('fb').className = 'fb ok';
      setTimeout(nextQ, NEXT_MS);
      return;
    }
    tries++;
    if (tries === 1) misses.push(q);
    if (tries >= 2) {
      // 2 回ちがったら、うすい針で答えを見せる
      ghost(q);
      $('fb').textContent = 'うすい はりが こたえ。あわせてから「できた」'; $('fb').className = 'fb ng';
    } else {
      $('fb').textContent = 'ちがうよ。いまは ' + K.reading(T) + '。もう いちど'; $('fb').className = 'fb ng';
    }
  });
  function nextQ() {
    qi++;
    if (qi < qs.length) { ask(); return; }
    var rr = K.recordScore(data.records, mode, level, score);
    data.records = rr.records; save();
    $('r-score').textContent = qs.length + ' もん中 ' + score + ' もん せいかい';
    $('r-new').hidden = !(rr.best && rr.prev !== undefined);
    $('r-sub').textContent = (mode === 'read' ? 'よみを えらぶ' : 'はりを あわせる') + '・' + K.LEVEL_NAMES[level] + (misses.length ? '。まちがえた じこく:' : '');
    $('r-miss').innerHTML = misses.map(function (x) { return '<li>' + K.reading(x) + '</li>'; }).join('');
    updateMenu();
    show('scr-result');
  }
  $('start').addEventListener('click', start);
  $('again').addEventListener('click', start);
  $('to-menu').addEventListener('click', function () { show('scr-menu'); });
  $('quit').addEventListener('click', function () { setDraggable(false); show('scr-menu'); });

  // --- 記録の書き出し・読み込み ---
  $('rec-export').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(C.buildBackup(C.TOOL, { tokei: data }), null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = C.backupFileName(C.TOOL + '-tokei');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    $('rec-msg').textContent = '書き出しました。';
  });
  $('rec-import').addEventListener('click', function () { $('rec-file').click(); });
  $('rec-file').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024) { $('rec-msg').textContent = 'ファイルが大きすぎます（1MB まで）。'; return; }
    file.text().then(function (text) {
      var r = C.parseBackup(text, C.TOOL, ['tokei']);
      if (!r.ok) { $('rec-msg').textContent = r.error; return; }
      if (!confirm('いまの記録と設定を、ファイルの内容に置き換えますか？')) return;
      data = { settings: K.normalizeSettings(r.data.tokei.settings), records: K.normalizeRecords(r.data.tokei.records) };
      save(); writeMenu();
      $('rec-msg').textContent = '読み込みました。';
    });
  });

  // --- はじめ ---
  writeMenu();
})();
