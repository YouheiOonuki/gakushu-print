// ===========================
// おでかけ冊子 — 画面の制御（設定・見本・印刷・共有・バックアップ）
// 中身と面付けは book.js、絵は pages.js。保存のキーは gakushu-print_booklet（サイト README 12）
// ===========================
(function () {
  'use strict';

  var B = window.Book, P = window.BookPages, C = window.Calc;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'gakushu-print_booklet';

  function newSeed() {
    try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch (e) { return Math.floor(Math.random() * 4294967296); }
  }
  function load() {
    try { var v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function save() {
    if (sharedMode) return;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 保存できなくても作れる */ }
  }

  var sharedMode = false;
  var state = B.decodeShare(location.hash);
  if (state) sharedMode = true;
  else {
    var saved = load();
    state = B.normalize(saved || { seed: newSeed() });
    if (!saved) state.seed = newSeed();
  }

  // --- ページの数の選択肢 ---
  var countsEl = $('counts');
  countsEl.innerHTML = B.KINDS.map(function (k) {
    var opts = '';
    for (var i = 0; i <= B.MAX_PER_KIND; i++) opts += '<option value="' + i + '">' + i + '</option>';
    return '<div class="field"><label for="cnt-' + k + '">' + B.KIND_NAMES[k] + '</label><select id="cnt-' + k + '" data-kind="' + k + '">' + opts + '</select></div>';
  }).join('');

  function writeForm() {
    document.querySelectorAll('input[name="layout"]').forEach(function (r) { r.checked = r.value === state.layout; });
    document.querySelectorAll('input[name="age"]').forEach(function (r) { r.checked = r.value === state.age; });
    $('scene').value = state.scene;
    $('name').value = state.name;
    $('title').value = state.title;
    $('title').placeholder = '例：' + B.SCENES[state.scene].title;
    $('answers').checked = state.answers;
    $('flip-long').checked = state.flip === 'long';
    $('credit').checked = state.credit;
    B.KINDS.forEach(function (k) {
      var el = $('cnt-' + k);
      el.value = String(state.counts[k]);
      el.disabled = state.layout === 'mini' || (k === 'sudoku' && state.age === 'y');
    });
    $('flip-long').closest('label').hidden = state.layout !== 'a5';
  }
  function readForm(changedCounts) {
    var v = function (n) { var r = document.querySelector('input[name="' + n + '"]:checked'); return r ? r.value : null; };
    var counts = {};
    B.KINDS.forEach(function (k) { counts[k] = Number($('cnt-' + k).value); });
    state = B.normalize({
      layout: v('layout'), age: v('age'), scene: $('scene').value, name: $('name').value, title: $('title').value,
      answers: $('answers').checked, flip: $('flip-long').checked ? 'long' : 'short', credit: $('credit').checked,
      countsAuto: changedCounts ? false : state.countsAuto, counts: counts, seed: state.seed,
    });
  }

  var PRINTER = {
    a5: 'プリンターの設定: <b>両面印刷</b>・<b>短辺とじ</b>（短い辺でとじる）・用紙 A4・倍率 100%。はじめは 1 枚目だけ試すと安心です。',
    mini: 'プリンターの設定: <b>片面</b>・用紙 A4・倍率 100%。印刷したら太い線を 1 本切って折ります。',
    cut: 'プリンターの設定: <b>片面</b>・用紙 A4・倍率 100%。まん中で切って重ね、左はしをとめます。',
  };
  var FOLD = {
    a5: ['表紙（1 ページ）がある紙がいちばん外になるように、紙を重ねる。', '上下のふちの点線のしるしで、まとめて半分に折る。', '折り目を 2 か所ホチキスでとめる（届かなければマスキングテープで）。',
      '裏が上下さかさまに出たら、プリンターの「長辺とじ」「短辺とじ」を入れかえる（選べなければ、くわしい設定の「長辺とじしか選べない」）。'],
    mini: ['印刷した面を外にして、横に半分に折る（上の段がうしろへ）。', 'ひらいて、まん中の太い線だけをはさみで切る。', 'もう一度横に半分に折り、両はしを持ってまん中へ押すと十字になる。', '表紙（1）が前にくるようにたたむ。'],
    cut: ['まん中の点線で切る。', 'ページの順に重ねて、左はしをホチキスで 2 か所とめる。'],
  };

  var book = null;
  function render() {
    book = B.buildBook(state);
    var s = book.state, n = book.pages.length;
    $('printer-set').innerHTML = PRINTER[s.layout];
    $('fold-steps').innerHTML = FOLD[s.layout].map(function (t) { return '<li>' + P.esc(t) + '</li>'; }).join('');
    var sheets = s.layout === 'a5' ? n / 4 : s.layout === 'cut' ? Math.ceil(n / 2) : 1;
    $('pv-info').textContent = B.LAYOUTS[s.layout].label + '・' + n + ' ページ・A4 ' + sheets + ' 枚' + (s.layout === 'a5' ? '（両面）' : '') + '・もんだい ばんごう ' + C.seedLabel(s.seed);
    $('pv-notes').hidden = !book.notes.length;
    $('pv-notes').textContent = book.notes.join(' ');
    var pv = $('book-pv');
    pv.classList.toggle('mini', book.mini);
    pv.innerHTML = book.pages.map(function (p) { return '<figure>' + P.pageSvg(book, p) + '<figcaption>' + p.no + '</figcaption></figure>'; }).join('');
    $('imposed-hint').textContent = s.layout === 'a5' ? '紙 1 枚ごとに おもて・うら の順。両面印刷で 1 枚の紙の表と裏になります。' :
      s.layout === 'mini' ? '上の段はさかさまに印刷されます（折るとまっすぐになります）。' : '片面で、1 枚に 2 ページずつ。';
    var html = P.sheetsHtml(book);
    $('print-sheets').innerHTML = html;
    if ($('imposed-box').open) renderImposed(html);
    else $('sheets-pv').innerHTML = '';
    $('more-state').textContent = moreState();
    $('fixbar-type').textContent = B.LAYOUTS[s.layout].label + '・' + n + ' ページ';
  }
  function renderImposed(html) {
    var box = $('sheets-pv');
    box.innerHTML = html || P.sheetsHtml(book);
    var faces = box.querySelectorAll('.bsheet');
    var s = book.state;
    faces.forEach(function (el) {
      var cap = document.createElement('p');
      cap.className = 'face-cap';
      cap.textContent = el.getAttribute('aria-label');
      el.parentNode.insertBefore(cap, el);
    });
    scaleImposed();
    void s;
  }
  function scaleImposed() {
    document.querySelectorAll('#sheets-pv .bsheet').forEach(function (el) {
      var sc = el.clientWidth / (297 * 96 / 25.4);
      el.querySelector('.bsheet-in').style.transform = 'scale(' + sc + ')';
    });
  }
  function moreState() {
    var s = state, bits = [];
    if (s.title) bits.push('題あり');
    bits.push(s.answers ? '答えあり' : '答えなし');
    if (s.layout === 'a5' && s.flip === 'long') bits.push('長辺とじ');
    if (!s.countsAuto && s.layout !== 'mini') bits.push('ページ数を変更');
    return bits.join('・');
  }

  function changed(counts) {
    readForm(counts);
    leaveShared();
    writeForm();
    render();
    save();
    barReady = true;
    updateBar();
  }
  document.querySelectorAll('input[name="layout"], input[name="age"]').forEach(function (r) { r.addEventListener('change', function () { changed(false); }); });
  ['scene', 'answers', 'flip-long', 'credit'].forEach(function (id) { $(id).addEventListener('change', function () { changed(false); }); });
  ['name', 'title'].forEach(function (id) { $(id).addEventListener('input', function () { changed(false); }); });
  B.KINDS.forEach(function (k) { $('cnt-' + k).addEventListener('change', function () { changed(true); }); });
  $('counts-reset').addEventListener('click', function () { state.countsAuto = true; state = B.normalize(state); writeForm(); render(); save(); });
  $('reseed').addEventListener('click', function () { state.seed = newSeed(); leaveShared(); render(); save(); });
  $('print').addEventListener('click', function () { render(); window.print(); });
  addEventListener('beforeprint', function () { render(); });
  $('imposed-box').addEventListener('toggle', function () { if ($('imposed-box').open) renderImposed(); });
  addEventListener('resize', scaleImposed);

  // --- 固定バー（SCREEN.md 1.2）---
  var barReady = false, printInView = true;
  function updateBar() { $('fixbar').hidden = !(barReady && !printInView); }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { printInView = es[es.length - 1].isIntersecting; updateBar(); }, { rootMargin: '-44px 0px 0px 0px' }).observe($('print-row'));
  }
  $('fixbar-print').addEventListener('click', function () { $('print').click(); });

  // --- 共有 ---
  function leaveShared() {
    if (!sharedMode) return;
    sharedMode = false;
    $('shared-banner').hidden = true;
    $('shared-keep-row').hidden = true;
    history.replaceState(null, '', location.pathname + location.search);
  }
  $('share').addEventListener('click', function () {
    var url = location.origin + location.pathname + '#s=' + B.encodeShare(state, $('share-name').checked);
    var out = $('share-url'), msg = $('share-msg');
    out.value = url; out.hidden = false;
    if (url.length > B.SHARE_MAX) { msg.textContent = 'リンクが長すぎます。バックアップのファイルで渡してください。'; return; }
    var done = function () { msg.textContent = 'コピーしました。'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { out.select(); msg.textContent = '選んだリンクをコピーしてください。'; });
    else { out.select(); msg.textContent = '選んだリンクをコピーしてください。'; }
  });
  $('shared-keep').addEventListener('click', function () {
    leaveShared();
    save();
    $('load-msg').textContent = 'この設定を保存しました。';
    $('load-msg').hidden = false;
  });

  // --- バックアップ（D31）---
  $('backup-export').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(C.buildBackup(C.TOOL, { booklet: state }), null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = C.backupFileName(C.TOOL + '-booklet');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    $('backup-msg').textContent = '書き出しました。';
  });
  $('backup-import').addEventListener('click', function () { $('backup-file').click(); });
  $('backup-file').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024) { $('backup-msg').textContent = 'ファイルが大きすぎます（1MB まで）。'; return; }
    file.text().then(function (text) {
      var r = C.parseBackup(text, C.TOOL, ['booklet']);
      if (!r.ok) { $('backup-msg').textContent = r.error; return; }
      if (!confirm('いまの設定を、ファイルの設定に置き換えますか？')) return;
      state = B.normalize(r.data.booklet);
      leaveShared();
      writeForm(); render(); save();
      $('backup-msg').textContent = '読み込みました。';
    });
  });

  // --- はじめ ---
  if (sharedMode) {
    $('shared-seed').textContent = C.seedLabel(state.seed);
    $('shared-banner').hidden = false;
    $('shared-keep-row').hidden = false;
  }
  writeForm();
  render();
  if (!sharedMode) save();
})();
