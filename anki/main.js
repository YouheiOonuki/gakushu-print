// ===========================
// 暗記カード — 画面の制御（入力・見本・印刷・画面でめくる・保存）
// 読み取り・面付け・紙の HTML は anki.js。保存のキーは gakushu-print_anki（サイト README 12）
// ===========================
(function () {
  'use strict';

  var A = window.Anki, C = window.Calc;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'gakushu-print_anki';

  function load() {
    try { var v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 保存できなくても使える */ }
  }
  var state = A.normalize(load());
  var parsed = A.parseCards(state.text);

  // --- 画面 ⇄ 設定 ---
  function radio(name) { var r = document.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : null; }
  function setRadio(name, v) { document.querySelectorAll('input[name="' + name + '"]').forEach(function (r) { r.checked = r.value === v; }); }
  function writeForm() {
    $('cards').value = state.text;
    setRadio('layout', state.layout);
    setRadio('sides', state.sides);
    setRadio('binding', state.binding);
    $('red').checked = state.red;
    $('cut').checked = state.cut;
    $('num').checked = state.num;
    $('credit').checked = state.credit;
    $('title').value = state.title;
  }
  function readForm() {
    state = A.normalize({
      text: $('cards').value, layout: radio('layout'), sides: radio('sides'), binding: radio('binding'),
      red: $('red').checked, cut: $('cut').checked, num: $('num').checked, credit: $('credit').checked,
      title: $('title').value, order: state.order, start: state.start,
    });
  }

  function moreState() {
    var bits = [];
    if (state.red) bits.push('赤シート用（片面）');
    else {
      bits.push({ both: '両面', front: '表だけ', back: '裏だけ' }[state.sides]);
      if (state.sides !== 'front') bits.push(state.binding === 'short' ? '短辺とじ' : '長辺とじ');
    }
    bits.push(state.cut ? '切る線あり' : '切る線なし');
    return bits.join('・');
  }

  function report() {
    var n = parsed.cards.length, h = '';
    if (n) h += '<p class="ok">' + n + ' 枚のカードです。</p>';
    if (parsed.notes.length) h += '<ul>' + parsed.notes.map(function (t) { return '<li>' + A.esc(t) + '</li>'; }).join('') + '</ul>';
    $('report').innerHTML = h;
  }

  function render() {
    parsed = A.parseCards(state.text);
    report();
    var n = parsed.cards.length;
    var r = A.render(parsed.cards, state, C.CREDIT);
    $('sheets').innerHTML = n ? r.html : '<p class="ak-empty">カードを入れると、ここに印刷の見本が出ます。</p>';
    var L = A.LAYOUTS[state.layout];
    $('pv-info').textContent = n
      ? L.label + '・紙 ' + r.sheets + ' 枚（' + r.pages + ' ページ' + (!state.red && state.sides === 'both' ? '。表と裏が交互' : '') + '）'
      : '';
    $('print').disabled = !n;
    $('flip').disabled = !n;
    $('sides-box').hidden = state.red;
    $('binding-box').hidden = state.red || state.sides === 'front';
    $('more-state').textContent = moreState();
    $('fixbar-type').textContent = n ? n + ' 枚・紙 ' + r.sheets + ' 枚' : '';
    fitPreview();
  }

  function fitPreview() {
    var box = $('sheets'), w = box.clientWidth;
    if (!w) return;
    box.style.setProperty('--z', String(Math.min(1, (w - 4) / 794)));
    box.style.setProperty('--zs', String(Math.min(1, (w - 4) / 794) * 0.3));
  }
  addEventListener('resize', fitPreview);

  var saveTimer = null;
  function changed() {
    readForm();
    render();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 300);
    barReady = true;
    updateBar();
  }
  ['layout', 'sides', 'binding'].forEach(function (n) {
    document.querySelectorAll('input[name="' + n + '"]').forEach(function (r) { r.addEventListener('change', changed); });
  });
  ['red', 'cut', 'num', 'credit'].forEach(function (id) { $(id).addEventListener('change', changed); });
  ['cards', 'title'].forEach(function (id) { $(id).addEventListener('input', changed); });
  addEventListener('pagehide', function () { clearTimeout(saveTimer); save(); });

  // 1 枚ずつ足す
  function addOne() {
    var f = $('add-f').value.trim(), b = $('add-b').value.trim();
    if (!f && !b) { $('add-f').focus(); return; }
    var t = $('cards').value.replace(/\s+$/, '');
    var line = A.lineOf(f, b, A.detectDelim(t));
    $('cards').value = (t ? t + '\n' : '') + line;
    $('add-f').value = ''; $('add-b').value = '';
    changed();
    $('add-f').focus();
  }
  $('add').addEventListener('click', addOne);
  $('add-f').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); $('add-b').focus(); } });
  $('add-b').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addOne(); } });

  // --- 印刷 ---
  $('print').addEventListener('click', function () { render(); window.print(); });
  addEventListener('beforeprint', function () { if (!document.body.classList.contains('playing')) render(); });

  // --- 固定バー（SCREEN.md 1.2）---
  var barReady = false, printInView = true;
  function updateBar() { $('fixbar').hidden = !(barReady && !printInView && parsed.cards.length > 0 && !document.body.classList.contains('playing')); }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { printInView = es[es.length - 1].isIntersecting; updateBar(); }, { rootMargin: '-44px 0px 0px 0px' }).observe($('print-row'));
  }
  $('fixbar-print').addEventListener('click', function () { $('print').click(); });

  // --- 画面でめくる ---
  var deck = [], pos = 0, flipped = false, sheetOn = true, later = [], known = 0;
  function rnd() {
    try { return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296; } catch (e) { return Math.random(); }
  }
  function showScreen(id) {
    var playing = id !== null;
    document.body.classList.toggle('playing', playing);
    document.body.classList.toggle('ak-playing', playing);
    $('scr-play').hidden = id !== 'scr-play';
    $('scr-done').hidden = id !== 'scr-done';
    updateBar();
    window.scrollTo(0, 0);
  }
  function startPlay(indexes) {
    deck = indexes; pos = 0; later = []; known = 0;
    showScreen('scr-play');
    showCard();
    $('card').focus();
  }
  function optLabels() {
    $('opt-order').textContent = state.order === 'random' ? 'ばらばら' : '入れた順';
    $('opt-order').setAttribute('aria-pressed', String(state.order === 'random'));
    $('opt-start').textContent = state.start === 'b' ? '裏から' : '表から';
    $('opt-start').setAttribute('aria-pressed', String(state.start === 'b'));
  }
  function showCard() {
    optLabels();
    var c = parsed.cards[deck[pos]];
    if (!c) return;
    flipped = false; sheetOn = true;
    $('progress').textContent = (pos + 1) + ' / ' + deck.length;
    paint(c);
  }
  function paint(c) {
    var first = state.start === 'b' ? c.b : c.f, second = state.start === 'b' ? c.f : c.b;
    var firstName = state.start === 'b' ? '裏' : '表', secondName = state.start === 'b' ? '表' : '裏';
    if (state.red) {
      // 赤シート: 問いと赤字の答えを同時に出し、赤いシートで答えをかくす（タップでシートを外す）
      $('face-label').textContent = sheetOn ? firstName + '（赤シートあり）' : firstName + '・' + secondName;
      $('card-text').textContent = first;
      $('card-ans').textContent = second;
      $('card-ans').hidden = false;
      $('red-sheet').hidden = !sheetOn;
      $('card').classList.add('red');
      $('tap-hint').textContent = sheetOn ? 'タップで赤シートを外す' : 'タップで赤シートをもどす';
    } else {
      $('face-label').textContent = flipped ? secondName : firstName;
      $('card-text').textContent = flipped ? second : first;
      $('card-ans').hidden = true;
      $('red-sheet').hidden = true;
      $('card').classList.remove('red');
      $('card').classList.toggle('back', flipped);
      $('tap-hint').textContent = 'タップでめくる';
    }
    var len = Math.max(first.length, state.red ? second.length : 0);
    $('card').dataset.len = len > 60 ? 'l' : len > 20 ? 'm' : 's';
  }
  $('card').addEventListener('click', function () {
    var c = parsed.cards[deck[pos]];
    if (!c) return;
    if (state.red) sheetOn = !sheetOn; else flipped = !flipped;
    paint(c);
  });
  function next(ok) {
    if (ok) known++; else later.push(deck[pos]);
    pos++;
    if (pos < deck.length) { showCard(); return; }
    showScreen('scr-done');
    $('done-sub').textContent = 'おぼえた ' + known + ' 枚・まだ ' + later.length + ' 枚';
    $('done-again').hidden = later.length === 0;
  }
  $('know').addEventListener('click', function () { next(true); });
  $('again').addEventListener('click', function () { next(false); });
  document.addEventListener('keydown', function (e) {
    if ($('scr-play').hidden || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === ' ' || e.key === 'Enter') { if (e.target.id !== 'card' && e.target.tagName === 'BUTTON') return; e.preventDefault(); $('card').click(); }
    else if (e.key === 'ArrowRight') next(true);
    else if (e.key === 'ArrowLeft') next(false);
  });
  function allIndexes() { return A.playOrder(parsed.cards.length, state.order, rnd); }
  $('flip').addEventListener('click', function () { readForm(); render(); if (parsed.cards.length) startPlay(allIndexes()); });
  $('opt-order').addEventListener('click', function () {
    state.order = state.order === 'random' ? 'seq' : 'random'; save();
    // いま見ているカードから先を並べなおす
    var rest = deck.slice(pos + 1);
    if (state.order === 'random') rest = A.playOrder(rest.length, 'random', rnd).map(function (k) { return rest[k]; });
    else rest.sort(function (x, y) { return x - y; });
    deck = deck.slice(0, pos + 1).concat(rest);
    optLabels();
  });
  $('opt-start').addEventListener('click', function () {
    state.start = state.start === 'b' ? 'f' : 'b'; save();
    showCard();
  });
  $('quit').addEventListener('click', function () { showScreen(null); $('flip').focus(); });
  $('done-again').addEventListener('click', function () {
    var l = later.slice();
    if (state.order === 'random') l = A.playOrder(l.length, 'random', rnd).map(function (k) { return later[k]; });
    startPlay(l);
  });
  $('done-all').addEventListener('click', function () { startPlay(allIndexes()); });
  $('done-back').addEventListener('click', function () { showScreen(null); });

  // --- 書き出し・読み込み ---
  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function ymd() {
    var d = new Date();
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  }
  $('csv-export').addEventListener('click', function () {
    if (!parsed.cards.length) { $('backup-msg').textContent = 'カードがありません。'; return; }
    download(new Blob(['﻿' + A.toCsv(parsed.cards)], { type: 'text/csv' }), C.TOOL + '-anki-' + ymd() + '.csv');
    $('backup-msg').textContent = 'CSV に書き出しました（Excel で開けます）。';
  });
  $('backup-export').addEventListener('click', function () {
    download(new Blob([JSON.stringify(C.buildBackup(C.TOOL, { anki: state }), null, 2)], { type: 'application/json' }), C.backupFileName(C.TOOL + '-anki'));
    $('backup-msg').textContent = '書き出しました。';
  });
  $('backup-import').addEventListener('click', function () { $('backup-file').click(); });
  $('backup-file').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024) { $('backup-msg').textContent = 'ファイルが大きすぎます（1MB まで）。'; return; }
    file.text().then(function (text) {
      // CSV ならカードとして読む（いまのカードを置きかえる）
      if (/\.csv$/i.test(file.name) || !/^\s*\{/.test(text)) {
        var p = A.parseCards(text);
        if (!p.cards.length) { $('backup-msg').textContent = 'カードとして読める行がありません。'; return; }
        if (parsed.cards.length && !confirm('いまのカードを、ファイルの ' + p.cards.length + ' 枚に置き換えますか？')) return;
        state.text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').slice(0, A.MAX_TEXT);
      } else {
        var r = C.parseBackup(text, C.TOOL, ['anki']);
        if (!r.ok) { $('backup-msg').textContent = r.error; return; }
        if (!confirm('いまのカードと設定を、ファイルの内容に置き換えますか？')) return;
        state = A.normalize(r.data.anki);
      }
      writeForm(); render(); save();
      $('backup-msg').textContent = '読み込みました。';
    });
  });

  // --- はじめ ---
  writeForm();
  render();
})();
