// ===========================
// 学習プリントメーカー — 画面の制御（設定の読み書き・見本・印刷・共有・保存）
// 問題づくりは calc.js、プリントの HTML は sheets.js、漢字の一覧は constants.js
// ===========================
(function () {
  'use strict';

  var C = window.Calc, S = window.Sheets;
  var KANJI = window.Constants.kanjiByGrade.value;
  var TOOL = C.TOOL;
  var $ = function (id) { return document.getElementById(id); };

  // --- ブラウザへの保存（README「ツールを追加するとき」12） ---
  // キーは必ず "gakushu-print_" で始める。全ツールが同じオリジンで localStorage を共有しているため
  var KEY_PREFIX = 'gakushu-print_';
  var store = {
    get: function (name, fallback) {
      try {
        var v = localStorage.getItem(KEY_PREFIX + name);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set: function (name, value) {
      try { localStorage.setItem(KEY_PREFIX + name, JSON.stringify(value)); } catch (e) { /* 保存できなくても続ける */ }
    },
  };

  function newSeed() {
    try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch (e) { return Math.floor(Math.random() * 4294967296); }
  }

  var TYPE_NAMES = { arith: 'たし算・ひき算', kuku: '九九', hyaku: '百ます計算', clock: '時計の読み方', kana: 'ひらがな・カタカナ', kanji: '漢字練習', maze: '迷路' };
  var KANA_LABELS = { a: 'あ行', ka: 'か行', sa: 'さ行', ta: 'た行', na: 'な行', ha: 'は行', ma: 'ま行', ya: 'や行', ra: 'ら行', wa: 'わ行', ga: 'が行', za: 'ざ行', da: 'だ行', ba: 'ば行', pa: 'ぱ行', small: '小さい字' };

  // --- 状態 ---
  var state, presets;
  var sharedMode = false;   // 共有リンクで開いた直後（自分の設定を上書きしない）

  var sharedState = C.decodeShare(location.hash);
  if (sharedState) {
    state = sharedState;
    sharedMode = true;
  } else {
    var saved = store.get('settings', null);
    state = C.normalizeState(saved);
    if (!saved || saved.seed === undefined) state.seed = newSeed();
  }
  presets = C.normalizePresets(store.get('presets', []));

  // --- 画面の部品を用意する（枚数・かなの行） ---
  document.querySelectorAll('.pages-select').forEach(function (sel) {
    var h = '';
    for (var i = 1; i <= C.MAX_PAGES; i++) h += '<option value="' + i + '">' + i + ' 枚</option>';
    sel.innerHTML = h;
  });
  $('kana-rows').innerHTML = Object.keys(C.KANA_ROWS).map(function (k) {
    return '<label><input type="checkbox" data-k="kana.rows" data-t="arr" value="' + k + '"> <span class="kana-lbl" data-row="' + k + '">' + KANA_LABELS[k] + '</span></label>';
  }).join('');

  // --- 設定 ⇄ 入力欄（data-k="種類.項目"、data-t で型） ---
  function getPath(obj, path) { return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj); }
  function setPath(obj, path, v) {
    var ks = path.split('.'), o = obj;
    for (var i = 0; i < ks.length - 1; i++) o = o[ks[i]];
    o[ks[ks.length - 1]] = v;
  }
  var controls = Array.prototype.slice.call(document.querySelectorAll('[data-k]'));

  function writeForm() {
    controls.forEach(function (el) {
      var k = el.getAttribute('data-k'), t = el.getAttribute('data-t'), v = getPath(state, k);
      if (el.type === 'radio') el.checked = String(v) === el.value;
      else if (el.type === 'checkbox') el.checked = t === 'bool' ? !!v : (v || []).map(String).indexOf(el.value) >= 0;
      else if (el.tagName === 'SELECT' && el.id === 'arith-count') {
        fillArithCounts();
        el.value = String(v);
      } else el.value = v == null ? '' : String(v);
    });
  }

  function readForm() {
    var raw = JSON.parse(JSON.stringify(state));
    var arrays = {};
    controls.forEach(function (el) {
      var k = el.getAttribute('data-k'), t = el.getAttribute('data-t');
      if (el.type === 'radio') {
        if (el.checked) setPath(raw, k, t === 'num' ? Number(el.value) : el.value);
      } else if (el.type === 'checkbox') {
        if (t === 'bool') setPath(raw, k, el.checked);
        else {
          arrays[k] = arrays[k] || [];
          if (el.checked) arrays[k].push(t === 'arr-num' ? Number(el.value) : el.value);
        }
      } else setPath(raw, k, t === 'num' ? Number(el.value) : el.value);
    });
    Object.keys(arrays).forEach(function (k) { setPath(raw, k, arrays[k]); });
    return raw;
  }

  function fillArithCounts() {
    var sel = $('arith-count');
    var style = document.querySelector('input[name="arith-style"]:checked');
    var counts = C.COUNTS[style ? style.value : state.arith.style];
    var cur = sel.value;
    sel.innerHTML = counts.map(function (n) { return '<option value="' + n + '">' + n + ' 問</option>'; }).join('');
    if (counts.indexOf(Number(cur)) >= 0) sel.value = cur;
    else sel.value = String(counts[1]);
  }

  // --- 画面の出し分け ---
  function updateVisibility() {
    document.querySelectorAll('[data-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== state.type; });
    // たし算・ひき算: 1けたどうしの「くり下がりあり」は作れない
    var withOk = C.arithPossible(state.arith.op, state.arith.level, 'with');
    $('arith-carry-with').disabled = !withOk;
    // 九九: 順番どおりのときは問題数・枚数は決まる
    $('kuku-pages-box').hidden = state.kuku.order !== 'random';
    $('kuku-count').closest('.field').hidden = state.kuku.order !== 'random';
    // かな
    $('kana-rows-box').hidden = state.kana.source !== 'rows';
    $('kana-words-box').hidden = state.kana.source !== 'words';
    document.querySelectorAll('.kana-lbl').forEach(function (s) {
      var k = s.getAttribute('data-row'), label = KANA_LABELS[k];
      s.textContent = state.kana.script === 'kata' && k !== 'small' ? C.toKata(label.replace('行', '')) + '行' : label;
    });
    // 漢字
    $('kanji-start-box').hidden = state.kanji.source !== 'order';
    $('kanji-custom-box').hidden = state.kanji.source !== 'custom';
    $('kanji-pages-box').hidden = state.kanji.source === 'custom';
    $('kanji-start').max = String(Array.from(KANJI[state.kanji.grade]).length);
    // 答えのページ（なぞり書き・漢字には答えがない）
    var hasAns = state.type !== 'kana' && state.type !== 'kanji';
    document.querySelectorAll('input[name="c-answers"]').forEach(function (r) { r.disabled = !hasAns; });
    $('answers-note').textContent = hasAns
      ? '答えは問題のあとに別のページでまとめて出ます。丸つけ用に「答えだけ」をあとから印刷することもできます（問題番号が同じなら同じ答え）。'
      : 'このプリントには答えのページはありません。';
  }

  // --- 入れたい問題・言葉・漢字の読み取り結果 ---
  function reportList(errors) {
    return '<ul>' + errors.slice(0, 10).map(function (e) {
      return '<li>' + e.line + ' 行目「' + S.esc(e.text) + '」: ' + S.esc(e.reason) + '（使いません）</li>';
    }).join('') + (errors.length > 10 ? '<li>ほか ' + (errors.length - 10) + ' 行</li>' : '') + '</ul>';
  }
  function showReports(wb) {
    ['arith', 'kuku', 'clock', 'kana', 'kanji'].forEach(function (t) { var el = $(t + '-report'); if (el && t !== wb.type) el.innerHTML = ''; });
    var r = wb.custom, el = $(wb.type + '-report');
    if (!el || !r) return;
    var h = '';
    if (wb.type === 'arith' || wb.type === 'kuku' || wb.type === 'clock') {
      if (r.items.length) h += '<p class="ok">' + r.items.length + (wb.type === 'clock' ? ' つの時刻' : ' 問') + 'を使います。</p>';
      if (r.errors.length) h += reportList(r.errors);
    } else if (wb.type === 'kana') {
      if (r.words.length) h += '<p class="ok">' + r.words.length + ' 語をなぞります。</p>';
      if (r.dropped.length) h += '<p class="warn">' + (state.kana.script === 'kata' ? 'カタカナ' : 'ひらがな') + 'でない文字は外しました：' + r.dropped.map(function (c) { return '「' + S.esc(c) + '」'; }).join('') + '</p>';
      if (r.hint) h += '<p class="warn">' + S.esc(r.hint) + '</p>';
    } else if (wb.type === 'kanji') {
      if (r.chars.length) h += '<p class="ok">' + r.chars.length + ' 字：' + S.esc(r.chars.join('')) + '</p>';
      if (r.higher.length) h += '<p class="warn">' + state.kanji.grade + ' 年生より上の学年の字は外しました：' + r.higher.map(function (x) { return S.esc(x.c) + '（' + x.g + '年）'; }).join('、') + '。学年を上げると使えます。</p>';
      if (r.outside.length) h += '<p class="warn">小学校で習う漢字（学年別漢字配当表）にない字は外しました：' + S.esc(r.outside.join('')) + '</p>';
    }
    el.innerHTML = h;
  }

  function renderKanjiPicker() {
    if (state.type !== 'kanji' || state.kanji.source !== 'custom') return;
    var chosen = {};
    Array.from(state.kanji.custom).forEach(function (c) { chosen[c] = true; });
    var list = Array.from(KANJI[state.kanji.grade]);
    var box = $('kanji-pick');
    if (box.getAttribute('data-grade') !== String(state.kanji.grade)) {
      box.innerHTML = list.map(function (c) { return '<button type="button" data-c="' + c + '" aria-pressed="false">' + c + '</button>'; }).join('');
      box.setAttribute('data-grade', String(state.kanji.grade));
    }
    box.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', chosen[b.getAttribute('data-c')] ? 'true' : 'false'); });
  }

  // --- 見本（＝印刷されるページ） ---
  var lastRender = null;
  function render() {
    var wb = C.buildWorkbook(state, KANJI);
    var r = S.render(wb, state);
    $('sheets').innerHTML = r.html;
    lastRender = r;
    fitPreview();
    var info = '問題番号 ' + C.seedLabel(state.seed) + '・';
    info += r.answers && r.questions ? '問題 ' + r.questions + ' 枚＋答え ' + r.answers + ' 枚' : r.answers ? '答え ' + r.answers + ' 枚' : r.total + ' 枚';
    info += '（A4 縦）';
    if (state.type === 'kana' || (state.type === 'kanji' && state.kanji.source !== 'random') || (state.type === 'kuku' && state.kuku.order !== 'random')) info = r.total + ' 枚（A4 縦）';
    $('pv-info').textContent = info;
    $('reseed').hidden = !(state.type === 'arith' || state.type === 'hyaku' || state.type === 'clock' || state.type === 'maze' ||
      (state.type === 'kuku' && state.kuku.order === 'random') || (state.type === 'kanji' && state.kanji.source === 'random'));
    var notes = wb.notes.slice();
    if (!r.total) notes.push('印刷するページがありません。');
    $('pv-notes').hidden = !notes.length;
    $('pv-notes').textContent = notes.join(' ');
    if (state.type === 'kanji' && state.kanji.source === 'order') {
      var all = Array.from(KANJI[state.kanji.grade]);
      var st = Math.min(state.kanji.start, all.length);
      var per = C.TRACE_SIZES[state.kanji.size].rows * state.kanji.pages;
      var end = Math.min(all.length, st + per - 1);
      $('kanji-range').textContent = st + '〜' + end + ' 番目（' + all[st - 1] + '〜' + all[end - 1] + '）を練習します。全部で ' + all.length + ' 字。';
    }
    showReports(wb);
    renderKanjiPicker();
  }

  /** 見本の縮小率（A4 の幅 210mm ≒ 794px を、見本の枠の幅に合わせる） */
  function fitPreview() {
    var box = $('sheets');
    var w = box.clientWidth;
    if (!w) return;
    box.style.setProperty('--z', String(Math.min(1, (w - 4) / 794)));
  }
  addEventListener('resize', fitPreview);

  function save() {
    if (sharedMode) return;
    store.set('settings', state);
  }

  /** 入力が変わったとき */
  function onChange(e) {
    var raw = readForm();
    if (e && e.target && e.target.name === 'arith-style') { fillArithCounts(); raw.arith.count = Number($('arith-count').value); }
    state = C.normalizeState(raw);
    leaveShared();
    updateVisibility();
    save();
    render();
  }
  var timer = null;
  document.addEventListener('change', function (e) { if (e.target.closest('[data-k]')) onChange(e); });
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!el.matches('textarea[data-k], input[type="text"][data-k], input[type="number"][data-k]')) return;
    clearTimeout(timer);
    timer = setTimeout(function () { onChange(e); }, 250);
  });

  /** 共有リンクで開いたあと、何か変えたら自分の設定として扱う（リンクの # も消す） */
  function leaveShared() {
    if (!sharedMode) return;
    sharedMode = false;
    $('shared-banner').hidden = true;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* 何もしない */ }
  }

  $('reseed').addEventListener('click', function () {
    state.seed = newSeed();
    leaveShared();
    save();
    render();
  });

  $('kuku-all').addEventListener('click', function () {
    document.querySelectorAll('input[data-k="kuku.dans"]').forEach(function (c) { c.checked = true; });
    onChange();
  });

  $('kanji-pick').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-c]');
    if (!b) return;
    var c = b.getAttribute('data-c'), ta = $('kanji-custom');
    ta.value = ta.value.indexOf(c) >= 0 ? ta.value.split(c).join('') : ta.value + c;
    onChange();
  });

  // --- 印刷（見本の HTML がそのまま印刷される。Ctrl+P でも同じ） ---
  $('print').addEventListener('click', function () { render(); window.print(); });
  addEventListener('beforeprint', function () { render(); });

  // --- 共有リンク（README「ツールを追加するとき」11。# 以降なのでサーバーには送られない） ---
  $('share').addEventListener('click', function () {
    var code = C.encodeShare(state, $('share-name').checked);
    var url = location.href.split('#')[0] + '#s=' + code;
    var out = $('share-url'), msg = $('share-msg');
    if (url.length > C.SHARE_MAX) {
      out.hidden = true;
      msg.textContent = 'リンクが長くなりすぎました（入れた問題や言葉が多いため）。「ファイルに書き出す」で作ったファイルを渡してください。';
      return;
    }
    out.value = url;
    out.hidden = false;
    var done = function () { msg.textContent = 'リンクをコピーしました。開いた人は同じ問題のプリントを印刷できます。'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { out.select(); msg.textContent = 'リンクを選びました。コピーして送ってください。'; });
    else { out.select(); msg.textContent = 'リンクを選びました。コピーして送ってください。'; }
  });

  $('shared-keep').addEventListener('click', function () {
    leaveShared();
    save();
    $('load-msg').hidden = false;
    $('load-msg').textContent = '共有されたプリントの設定を、この端末に保存しました。';
  });

  // --- よく使う設定 ---
  function renderPresets() {
    var ul = $('presets');
    ul.innerHTML = presets.map(function (p) {
      return '<li><span class="p-name">' + S.esc(p.name) + ' <span class="p-type">' + TYPE_NAMES[p.state.type] + '</span></span>' +
        '<button type="button" class="btn btn-sub btn-sm" data-act="load" data-id="' + p.id + '">呼び出す</button>' +
        '<button type="button" class="btn btn-sub btn-sm" data-act="del" data-id="' + p.id + '">削除</button></li>';
    }).join('');
  }
  $('preset-save').addEventListener('click', function () {
    var name = $('preset-name').value.trim() || (state.common.name ? state.common.name + ' ' : '') + TYPE_NAMES[state.type];
    if (presets.length >= C.MAX_PRESETS) { $('preset-msg').textContent = '保存できるのは ' + C.MAX_PRESETS + ' 件までです。使わないものを削除してください。'; return; }
    var st = JSON.parse(JSON.stringify(state));
    delete st.seed;
    presets.push({ id: 'p' + Date.now().toString(36), name: name.slice(0, 30), state: st });
    presets = C.normalizePresets(presets);
    store.set('presets', presets);
    $('preset-name').value = '';
    renderPresets();
    $('preset-msg').textContent = '「' + name.slice(0, 30) + '」を保存しました。';
  });
  $('presets').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]');
    if (!b) return;
    var p = presets.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0];
    if (!p) return;
    if (b.getAttribute('data-act') === 'load') {
      var st = JSON.parse(JSON.stringify(p.state));
      st.seed = newSeed();
      state = C.normalizeState(st);
      leaveShared();
      writeForm(); updateVisibility(); save(); render();
      $('preset-msg').textContent = '「' + p.name + '」を呼び出しました（新しい問題です）。';
      $('sec-preview').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (window.confirm('「' + p.name + '」を削除します。よろしいですか？')) {
      presets = presets.filter(function (x) { return x !== p; });
      store.set('presets', presets);
      renderPresets();
      $('preset-msg').textContent = '削除しました。';
    }
  });

  // --- ファイルへの書き出し・読み込み（youheioonuki.github.io の README「ツールを追加するとき」20。決定 D31） ---
  // data は store に保存しているものと同じ形。中身はこの端末の中で作り、どこにも送信しない
  $('backup-export').addEventListener('click', function () {
    var data = { settings: state, presets: presets };
    var blob = new Blob([JSON.stringify(C.buildBackup(TOOL, data), null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = C.backupFileName(TOOL);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    $('backup-msg').textContent = 'ファイルに書き出しました。機種変更のときは、このファイルを新しい端末に移して「ファイルから読み込む」を押してください。';
  });
  $('backup-import').addEventListener('click', function () { $('backup-file').click(); });
  $('backup-file').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024) { $('backup-msg').textContent = 'ファイルが大きすぎます。このツールで書き出したファイルを選んでください。'; return; }
    file.text().then(function (text) {
      var r = C.parseBackup(text, TOOL, ['settings', 'presets']);
      if (!r.ok) { $('backup-msg').textContent = r.error; return; }
      if (!window.confirm('ファイルの内容で、いまの設定とよく使う設定を置き換えます。よろしいですか？')) return;
      state = C.normalizeState(r.data.settings);
      presets = C.normalizePresets(r.data.presets);
      leaveShared();
      store.set('presets', presets);
      writeForm(); updateVisibility(); save(); render(); renderPresets();
      $('backup-msg').textContent = 'ファイルから読み込みました（よく使う設定 ' + presets.length + ' 件）。';
    }, function () { $('backup-msg').textContent = 'ファイルを読み取れませんでした。'; });
  });

  // --- はじめの表示 ---
  if (sharedMode) {
    $('shared-banner').hidden = false;
    $('shared-seed').textContent = C.seedLabel(state.seed);
  }
  writeForm();
  updateVisibility();
  render();
  renderPresets();
  if (!sharedMode) save();
})();
