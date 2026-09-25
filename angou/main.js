// ===========================
// 暗号メーカー — 画面の制御（設定・見本・印刷・暗号を とく・共有・バックアップ）
// 暗号のロジックは cipher.js、紙は sheets.js。保存のキーは gakushu-print_angou（サイト README 12）
// ===========================
(function () {
  'use strict';

  var A = window.Angou, S = window.AngouSheets, C = window.Calc;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'gakushu-print_angou';

  function newSeed() {
    try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch (e) { return Math.floor(Math.random() * 4294967296); }
  }
  function load() {
    try { var v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function save() {
    if (shared) return;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 保存できなくても作れる */ }
  }

  // shared: null（自分の設定）／ { withMsg } 共有リンクで開いた
  var shared = null, msgHidden = false;
  var fromHash = A.decodeShare(location.hash), state;
  if (fromHash) { shared = { withMsg: fromHash.withMsg }; state = fromHash.state; msgHidden = fromHash.withMsg; }
  else {
    var saved = load();
    state = A.normalize(saved || {});
    if (!saved) state.seed = newSeed();
  }

  // ずらす数の選択肢
  $('key').innerHTML = Array.from({ length: A.KEY_MAX }, function (_, i) {
    var k = i + 1;
    return '<option value="' + k + '">' + k + '（あ→' + A.KANA[k] + '）</option>';
  }).join('');

  function writeForm() {
    document.querySelectorAll('input[name="method"]').forEach(function (r) { r.checked = r.value === state.method; });
    $('msg').value = state.msg;
    $('key').value = String(state.key);
    $('title').value = state.title; $('to').value = state.to; $('from').value = state.from;
    $('pg-cipher').checked = state.pages.cipher; $('pg-tool').checked = state.pages.tool; $('pg-answer').checked = state.pages.answer;
    $('hint').checked = state.hint; $('rev').checked = state.rev; $('credit').checked = state.credit;
    $('key-field').hidden = state.method !== 'shift';
    $('rev-row').hidden = state.method === 'rev';
    $('msg-field').hidden = msgHidden;
    $('msg-hidden').hidden = !msgHidden;
  }
  function readForm() {
    var r = document.querySelector('input[name="method"]:checked');
    state = A.normalize({
      method: r ? r.value : 'shift', msg: msgHidden ? state.msg : $('msg').value, key: $('key').value, seed: state.seed,
      rev: $('rev').checked, hint: $('hint').checked, title: $('title').value, to: $('to').value, from: $('from').value,
      pages: { cipher: $('pg-cipher').checked, tool: $('pg-tool').checked, answer: $('pg-answer').checked }, credit: $('credit').checked,
      filler: state.filler,
    });
  }

  var built = null;
  function render() {
    built = A.build(state);
    var b = built, s = b.state;
    var n = Array.from(s.msg).length;
    $('msg-count').textContent = n + ' / ' + A.MAX_LEN + ' 字';
    $('key-ex').textContent = b.hasAlpha ? '英字は ' + A.shiftAlpha(s.key) + ' ずらす' : '';
    var line = $('cipher-line');
    if (!b.cipher.length) line.innerHTML = '<span class="lbl">暗号</span>（文を入れると、ここに暗号が出ます）';
    else if (s.method === 'pict') line.innerHTML = '<span class="lbl">暗号</span>マークは 下の見本と 印刷で 見てください。';
    else line.innerHTML = '<span class="lbl">暗号</span>' + S.esc(A.cipherText(b.cipher));
    $('pv-notes').hidden = !b.notes.length;
    $('pv-notes').textContent = b.notes.join(' ');
    var sheets = S.sheetsHtml(b);
    $('sheets').innerHTML = sheets.length ? sheets.join('') : '<p class="small">印刷する紙を「くわしい設定」で選んでください。</p>';
    var kinds = [];
    if (s.pages.cipher && b.cipher.length) kinds.push('暗号文');
    if (s.pages.tool) kinds.push('解読シート');
    if (s.pages.answer && b.cipher.length) kinds.push('答え');
    $('pv-info').textContent = 'A4 たて ' + sheets.length + ' 枚（' + kinds.join('・') + '）・あんごう ばんごう ' + C.seedLabel(s.seed);
    $('more-state').textContent = moreState();
    $('fixbar-type').textContent = A.METHODS[s.method].label + '・A4 ' + sheets.length + ' 枚';
    $('decode-hint').textContent = s.method === 'pict' ? 'え・きごう は字で入れられないので、解読シートの表で といてください。' : 'いまの しかた（' + S.keyText(b) + '）で もどします。';
    $('decode-in').disabled = s.method === 'pict';
    runDecode();
    fitPreview();
  }
  function moreState() {
    var s = state, bits = [];
    if (s.title) bits.push('題あり');
    if (s.to || s.from) bits.push('だれへ・だれから');
    bits.push(s.hint ? 'ヒントあり' : 'ヒントなし');
    if (s.rev && s.method !== 'rev') bits.push('さかさ');
    if (!s.pages.answer) bits.push('答えなし');
    return bits.join('・');
  }
  function fitPreview() {
    var box = $('sheets'), w = box.clientWidth;
    if (!w) return;
    box.style.setProperty('--z', String(Math.min(1, (w - 4) / 794)));
    box.style.setProperty('--zs', String(Math.min(1, (w - 4) / 794) * 0.3));
  }
  addEventListener('resize', fitPreview);

  function runDecode() {
    var t = $('decode-in').value;
    $('decode-out').textContent = t && built && state.method !== 'pict' ? A.decodeText(t, built.key) : '';
  }

  function changed() {
    readForm();
    leaveShared();
    writeForm();
    render();
    save();
    barReady = true;
    updateBar();
  }
  document.querySelectorAll('input[name="method"]').forEach(function (r) { r.addEventListener('change', changed); });
  ['key', 'pg-cipher', 'pg-tool', 'pg-answer', 'hint', 'rev', 'credit'].forEach(function (id) { $(id).addEventListener('change', changed); });
  ['msg', 'title', 'to', 'from'].forEach(function (id) { $(id).addEventListener('input', changed); });
  $('decode-in').addEventListener('input', runDecode);
  $('reseed').addEventListener('click', function () {
    state.seed = newSeed();
    if (state.method === 'shift') state.key = 1 + (state.seed % A.KEY_MAX);
    leaveShared(); writeForm(); render(); save();
  });
  $('print').addEventListener('click', function () { render(); window.print(); });
  addEventListener('beforeprint', function () { render(); });
  $('msg-show').addEventListener('click', function () { msgHidden = false; leaveShared(); writeForm(); render(); save(); $('msg').focus(); });

  // --- 固定バー（SCREEN.md 1.2）---
  var barReady = false, printInView = true;
  function updateBar() { $('fixbar').hidden = !(barReady && !printInView); }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { printInView = es[es.length - 1].isIntersecting; updateBar(); }, { rootMargin: '-44px 0px 0px 0px' }).observe($('print-row'));
  }
  $('fixbar-print').addEventListener('click', function () { $('print').click(); });

  // --- 共有 ---
  function leaveShared() {
    if (!shared) return;
    shared = null;
    msgHidden = false;
    delete state.filler;
    $('shared-banner').hidden = true;
    $('shared-keep-row').hidden = true;
    history.replaceState(null, '', location.pathname + location.search);
  }
  $('share').addEventListener('click', function () {
    var url = location.origin + location.pathname + '#s=' + A.encodeShare(state, $('share-msg').checked);
    var out = $('share-url'), msg = $('share-msg-out');
    out.value = url; out.hidden = false;
    if (url.length > A.SHARE_MAX) { msg.textContent = 'リンクが長すぎます。バックアップのファイルで渡してください。'; return; }
    var done = function () { msg.textContent = 'コピーしました。'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { out.select(); msg.textContent = '選んだリンクをコピーしてください。'; });
    else { out.select(); msg.textContent = '選んだリンクをコピーしてください。'; }
  });
  $('shared-keep').addEventListener('click', function () {
    leaveShared();
    writeForm(); render(); save();
    $('load-msg').textContent = 'この設定を保存しました。';
    $('load-msg').hidden = false;
  });

  // --- バックアップ（D31）---
  $('backup-export').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(C.buildBackup(C.TOOL, { angou: state }), null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = C.backupFileName(C.TOOL + '-angou');
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
      var r = C.parseBackup(text, C.TOOL, ['angou']);
      if (!r.ok) { $('backup-msg').textContent = r.error; return; }
      if (!confirm('いまの設定を、ファイルの設定に置き換えますか？')) return;
      leaveShared();
      state = A.normalize(r.data.angou);
      writeForm(); render(); save();
      $('backup-msg').textContent = '読み込みました。';
    });
  });

  // --- はじめ ---
  if (shared) {
    var b0 = A.build(state);
    $('shared-banner').textContent = shared.withMsg
      ? '共有された暗号です（' + S.keyText(b0) + '）。印刷すると暗号文と解読シートが出ます（答えは「くわしい設定」で）。何か変えるまで、あなたの保存した設定は上書きしません。'
      : '共有された かぎ です（' + S.keyText(b0) + '）。解読シートを印刷するか、「暗号を とく」に字を入れてください。何か変えるまで、あなたの保存した設定は上書きしません。';
    $('shared-banner').hidden = false;
    $('shared-keep-row').hidden = false;
    if (!shared.withMsg) $('sec-decode').open = true;
  }
  writeForm();
  render();
  if (!shared) save();
})();
