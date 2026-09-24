// ===========================
// 学習プリントメーカー — 画面の制御（設定の読み書き・見本・印刷・共有・保存）
// 問題づくりは calc.js、プリントの HTML は sheets.js、漢字の一覧は constants.js、文言は text.js
// 日本語ページ（/）と英語ページ（/en/）の両方がこのファイルを使う。言語は <html lang>、
// 出す種類はページにある「種類」のラジオ、用紙はページにある用紙の選択肢で決まる（無ければ A4 だけ）
// ===========================
(function () {
  'use strict';

  var C = window.Calc, S = window.Sheets;
  var KANJI = window.Constants.kanjiByGrade.value;
  var TOOL = C.TOOL;
  var $ = function (id) { return document.getElementById(id); };
  var LANG = document.documentElement.lang === 'en' ? 'en' : 'ja';
  var T = window.TEXT.ui[LANG];
  function hide(id, v) { var e = $(id); if (e) e.hidden = v; }
  function on(id, ev, fn) { var e = $(id); if (e) e.addEventListener(ev, fn); }
  // このページで選べる種類・用紙（英語ページはなぞり書き・漢字・原稿用紙だけ、日本語ページは A4 だけ）
  var PAGE_TYPES = Array.prototype.map.call(document.querySelectorAll('input[name="type"]'), function (r) { return r.value; });
  var PAGE_PAPERS = Array.prototype.map.call(document.querySelectorAll('input[data-k="common.paper"]'), function (r) { return r.value; });
  if (!PAGE_PAPERS.length) PAGE_PAPERS = ['a4'];
  function fitPage(st) {
    if (PAGE_TYPES.indexOf(st.type) < 0) st.type = PAGE_TYPES[0];
    if (PAGE_PAPERS.indexOf(st.common.paper) < 0) st.common.paper = PAGE_PAPERS[0];
    return st;
  }

  // --- ブラウザへの保存（README「ツールを追加するとき」12） ---
  // キーは必ず "gakushu-print_" で始める。全ツールが同じオリジンで localStorage を共有しているため
  // 英語ページは別のキー（gakushu-print_en_…）。選べる種類が違うので、日本語ページの設定と混ぜない
  var KEY_PREFIX = 'gakushu-print_' + (LANG === 'en' ? 'en_' : '');
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

  var TYPE_NAMES = T.typeNames;
  var KANA_LABELS = T.kanaLabels;

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
    if (!saved && LANG === 'en') {
      // 英語ページのはじめ: ローマ字あり。用紙は米国・カナダの英語ならレター
      state.kana.romaji = true;
      if (/^en-(US|CA)$/i.test(navigator.language || '')) state.common.paper = 'letter';
    }
  }
  fitPage(state);
  presets = C.normalizePresets(store.get('presets', []), LANG);

  // --- 画面の部品を用意する（枚数・かなの行） ---
  document.querySelectorAll('.pages-select').forEach(function (sel) {
    var h = '';
    for (var i = 1; i <= C.MAX_PAGES; i++) h += '<option value="' + i + '">' + T.pages(i) + '</option>';
    sel.innerHTML = h;
  });
  if ($('kana-rows')) $('kana-rows').innerHTML = Object.keys(C.KANA_ROWS).map(function (k) {
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
    if (!sel) return;
    var style = document.querySelector('input[name="arith-style"]:checked');
    var counts = C.COUNTS[style ? style.value : state.arith.style];
    var cur = sel.value;
    sel.innerHTML = counts.map(function (n) { return '<option value="' + n + '">' + T.count(n) + '</option>'; }).join('');
    if (counts.indexOf(Number(cur)) >= 0) sel.value = cur;
    else sel.value = String(counts[1]);
  }

  // --- 画面の出し分け ---
  function updateVisibility() {
    document.querySelectorAll('[data-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== state.type; });
    // たし算・ひき算: 1けたどうしの「くり下がりあり」は作れない
    var withOk = C.arithPossible(state.arith.op, state.arith.level, 'with');
    if ($('arith-carry-with')) $('arith-carry-with').disabled = !withOk;
    // 九九: 順番どおりのときは問題数・枚数は決まる
    hide('kuku-pages-box', state.kuku.order !== 'random');
    if ($('kuku-count')) $('kuku-count').closest('.field').hidden = state.kuku.order !== 'random';
    // かな（ローマ字は 1 字ずつの行の練習だけ）
    hide('kana-rows-box', state.kana.source !== 'rows');
    hide('kana-words-box', state.kana.source !== 'words');
    hide('kana-romaji-box', state.kana.source !== 'rows');
    document.querySelectorAll('.kana-lbl').forEach(function (s) {
      var k = s.getAttribute('data-row'), label = KANA_LABELS[k];
      if (LANG === 'en') {
        var first = Array.from(C.KANA_ROWS[k])[k === 'small' ? 6 : 0];
        s.innerHTML = '<span lang="ja">' + (state.kana.script === 'kata' ? C.toKata(first) : first) + '</span> ' + label;
      } else s.textContent = state.kana.script === 'kata' && k !== 'small' ? C.toKata(label.replace('行', '')) + '行' : label;
    });
    // 原稿用紙（ますの大きさ・十字の線は練習用のマス目だけ）
    hide('genko-grid-box', state.genko.layout !== 'grid');
    // 漢字
    hide('kanji-start-box', state.kanji.source !== 'order');
    hide('kanji-custom-box', state.kanji.source !== 'custom');
    hide('kanji-pages-box', state.kanji.source === 'custom');
    if ($('kanji-start')) $('kanji-start').max = String(Array.from(KANJI[state.kanji.grade]).length);
    // 答えのページ（なぞり書き・漢字・原稿用紙には答えがない）
    var hasAns = state.type !== 'kana' && state.type !== 'kanji' && state.type !== 'genko';
    document.querySelectorAll('input[name="c-answers"]').forEach(function (r) { r.disabled = !hasAns; });
    if ($('answers-note')) $('answers-note').textContent = hasAns ? T.answersNote : T.answersNone;
    // 用紙: 印刷の用紙の大きさ（@page）をプリントに合わせる。A4 は style.css のまま
    pageStyle.textContent = state.common.paper === 'letter' ? '@page { size: letter portrait; margin: 0; }' : '';
    updateSummaries(hasAns);
  }

  // --- 折りたたみの summary に今の設定を出す（SCREEN.md 1.2 の 6。開いた状態は保存しない） ---
  var pageStyle = document.createElement('style');
  document.head.appendChild(pageStyle);
  function setText(id, t) { var e = $(id); if (e && e.textContent !== t) e.textContent = t; }
  function updateSummaries(hasAns) {
    setText('more-arith', T.moreArith(state.arith.style === 'tate', state.arith.pages));
    setText('more-clock', T.moreClock(state.clock.guide));
    setText('more-kanji', T.moreSize(state.kanji.size));
    setText('more-kana', T.moreKana(state.kana.size));
    setText('more-hyaku', T.moreHand(state.hyaku.hand));
    setText('common-state', T.commonState(state.common, hasAns, T.paperNames[state.common.paper]));
    setText('fixbar-type', TYPE_NAMES[state.type]);
  }

  // --- 固定バー（SCREEN.md 1.2・D59）: 種類や設定を選んだあと、印刷ボタンが画面の外にあるときだけ上端に「印刷する」 ---
  // 読み込み時は hidden（位置は fixed なのでレイアウトはずれない）。スクリーンリーダーには最初に出たときの 1 回だけ読ませる
  var barReady = false, printInView = true, barAnnounced = false;
  function updateBar() {
    var show = barReady && !printInView;
    if (show && !barAnnounced) {
      barAnnounced = true;
      setTimeout(function () { $('fixbar').setAttribute('aria-live', 'off'); }, 1000);
    }
    $('fixbar').hidden = !show;
  }
  if ('IntersectionObserver' in window) {
    // バーの高さ（44px）の分だけ上を狭めて、バーに隠れている印刷ボタンは「画面の外」とみなす
    new IntersectionObserver(function (es) {
      printInView = es[es.length - 1].isIntersecting;
      updateBar();
    }, { rootMargin: '-44px 0px 0px 0px' }).observe($('print-row'));
  }
  on('fixbar-print', 'click', function () { $('print').click(); });

  // --- 入れたい問題・言葉・漢字の読み取り結果 ---
  function reportList(errors) {
    return '<ul>' + errors.slice(0, 10).map(function (e) {
      return '<li>' + T.reportLine(e.line, S.esc(e.text), S.esc(e.reason)) + '</li>';
    }).join('') + (errors.length > 10 ? '<li>' + T.reportMore(errors.length - 10) + '</li>' : '') + '</ul>';
  }
  function showReports(wb) {
    ['arith', 'kuku', 'clock', 'kana', 'kanji'].forEach(function (t) { var el = $(t + '-report'); if (el && t !== wb.type) el.innerHTML = ''; });
    var r = wb.custom, el = $(wb.type + '-report');
    if (!el || !r) return;
    var h = '';
    if (wb.type === 'arith' || wb.type === 'kuku' || wb.type === 'clock') {
      if (r.items.length) h += '<p class="ok">' + T.useItems(r.items.length, wb.type === 'clock') + '</p>';
      if (r.errors.length) h += reportList(r.errors);
    } else if (wb.type === 'kana') {
      if (r.words.length) h += '<p class="ok">' + T.useWords(r.words.length) + '</p>';
      if (r.dropped.length) h += '<p class="warn">' + T.dropped(state.kana.script === 'kata', r.dropped.map(S.esc)) + '</p>';
      if (r.hint) h += '<p class="warn">' + S.esc(r.hint) + '</p>';
    } else if (wb.type === 'kanji') {
      if (r.chars.length) h += '<p class="ok">' + T.kanjiChars(r.chars.length, S.esc(r.chars.join(''))) + '</p>';
      if (r.higher.length) h += '<p class="warn">' + T.kanjiHigher(state.kanji.grade, r.higher.map(function (x) { return T.kanjiHigherItem(S.esc(x.c), x.g); }).join(T.listSep)) + '</p>';
      if (r.outside.length) h += '<p class="warn">' + T.kanjiOutside(S.esc(r.outside.join(''))) + '</p>';
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
    var wb = C.buildWorkbook(state, KANJI, LANG);
    var r = S.render(wb, state, LANG);
    $('sheets').innerHTML = r.html;
    lastRender = r;
    fitPreview();
    var paperInfo = T.paperInfo(T.paperNames[state.common.paper]);
    var info = T.seedInfo(C.seedLabel(state.seed));
    info += r.answers && r.questions ? T.sheetsQA(r.questions, r.answers) : r.answers ? T.sheetsA(r.answers) : T.sheetsN(r.total);
    info += paperInfo;
    if (state.type === 'kana' || state.type === 'genko' || (state.type === 'kanji' && state.kanji.source !== 'random') || (state.type === 'kuku' && state.kuku.order !== 'random')) info = T.sheetsN(r.total) + paperInfo;
    $('pv-info').textContent = info;
    $('reseed').hidden = !(state.type === 'arith' || state.type === 'hyaku' || state.type === 'clock' || state.type === 'maze' ||
      (state.type === 'kuku' && state.kuku.order === 'random') || (state.type === 'kanji' && state.kanji.source === 'random'));
    var notes = wb.notes.slice();
    if (!r.total) notes.push(T.noPages);
    $('pv-notes').hidden = !notes.length;
    $('pv-notes').textContent = notes.join(' ');
    if (state.type === 'kanji' && state.kanji.source === 'order') {
      var all = Array.from(KANJI[state.kanji.grade]);
      var st = Math.min(state.kanji.start, all.length);
      var per = C.traceRowsPerPage(state.kanji.size, state.common.paper) * state.kanji.pages;
      var end = Math.min(all.length, st + per - 1);
      $('kanji-range').textContent = T.kanjiRange(st, end, all[st - 1], all[end - 1], all.length);
    }
    showReports(wb);
    renderKanjiPicker();
  }

  /** 見本の縮小率（用紙の幅 A4 210mm ≒ 794px・レター 215.9mm ≒ 816px を、見本の枠の幅に合わせる） */
  function fitPreview() {
    var box = $('sheets');
    var w = box.clientWidth;
    if (!w) return;
    var pw = state.common.paper === 'letter' ? 816 : 794;
    box.style.setProperty('--z', String(Math.min(1, (w - 4) / pw)));
    box.style.setProperty('--zs', String(Math.min(1, (w - 4) / pw) * 0.3));   // 2 枚目からの小さい見本
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
    state = fitPage(C.normalizeState(raw));
    leaveShared();
    updateVisibility();
    save();
    render();
    barReady = true;
    updateBar();
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
    $('shared-keep-row').hidden = true;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* 何もしない */ }
  }

  on('reseed', 'click', function () {
    state.seed = newSeed();
    leaveShared();
    save();
    render();
  });

  on('kuku-all', 'click', function () {
    document.querySelectorAll('input[data-k="kuku.dans"]').forEach(function (c) { c.checked = true; });
    onChange();
  });

  on('kanji-pick', 'click', function (e) {
    var b = e.target.closest('button[data-c]');
    if (!b) return;
    var c = b.getAttribute('data-c'), ta = $('kanji-custom');
    ta.value = ta.value.indexOf(c) >= 0 ? ta.value.split(c).join('') : ta.value + c;
    onChange();
  });

  // --- 印刷（見本の HTML がそのまま印刷される。Ctrl+P でも同じ） ---
  // なぞり書きのフォント（fonts/）を読み終えてから印刷する。読めなくても 3 秒で印刷に進む
  $('print').addEventListener('click', function () {
    render();
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    Promise.race([ready, new Promise(function (r) { setTimeout(r, 3000); })]).then(function () { window.print(); });
  });
  addEventListener('beforeprint', function () { render(); });

  // --- 共有リンク（README「ツールを追加するとき」11。# 以降なのでサーバーには送られない） ---
  $('share').addEventListener('click', function () {
    var code = C.encodeShare(state, $('share-name').checked);
    var url = location.href.split('#')[0] + '#s=' + code;
    var out = $('share-url'), msg = $('share-msg');
    if (url.length > C.SHARE_MAX) {
      out.hidden = true;
      msg.textContent = T.shareTooLong;
      return;
    }
    out.value = url;
    out.hidden = false;
    var done = function () { msg.textContent = T.shareCopied; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { out.select(); msg.textContent = T.shareSelected; });
    else { out.select(); msg.textContent = T.shareSelected; }
  });

  $('shared-keep').addEventListener('click', function () {
    leaveShared();
    save();
    $('load-msg').hidden = false;
    $('load-msg').textContent = T.sharedKept;
  });

  // --- よく使う設定 ---
  function renderPresets() {
    var ul = $('presets');
    ul.innerHTML = presets.map(function (p) {
      return '<li><span class="p-name">' + S.esc(p.name) + ' <span class="p-type">' + TYPE_NAMES[p.state.type] + '</span></span>' +
        '<button type="button" class="btn btn-sub btn-sm" data-act="load" data-id="' + p.id + '">' + T.presetLoad + '</button>' +
        '<button type="button" class="btn btn-sub btn-sm" data-act="del" data-id="' + p.id + '">' + T.presetDelete + '</button></li>';
    }).join('');
  }
  $('preset-save').addEventListener('click', function () {
    var name = $('preset-name').value.trim() || T.presetDefaultName(state.common.name, TYPE_NAMES[state.type]);
    if (presets.length >= C.MAX_PRESETS) { $('preset-msg').textContent = T.presetLimit(C.MAX_PRESETS); return; }
    var st = JSON.parse(JSON.stringify(state));
    delete st.seed;
    presets.push({ id: 'p' + Date.now().toString(36), name: name.slice(0, 30), state: st });
    presets = C.normalizePresets(presets, LANG);
    store.set('presets', presets);
    $('preset-name').value = '';
    renderPresets();
    $('preset-msg').textContent = T.presetSaved(name.slice(0, 30));
  });
  $('presets').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]');
    if (!b) return;
    var p = presets.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0];
    if (!p) return;
    if (b.getAttribute('data-act') === 'load') {
      var st = JSON.parse(JSON.stringify(p.state));
      st.seed = newSeed();
      state = fitPage(C.normalizeState(st));
      leaveShared();
      writeForm(); updateVisibility(); save(); render();
      $('preset-msg').textContent = T.presetLoaded(p.name);
      $('sec-preview').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (window.confirm(T.presetConfirmDelete(p.name))) {
      presets = presets.filter(function (x) { return x !== p; });
      store.set('presets', presets);
      renderPresets();
      $('preset-msg').textContent = T.presetDeleted;
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
    $('backup-msg').textContent = T.backupExported;
  });
  $('backup-import').addEventListener('click', function () { $('backup-file').click(); });
  $('backup-file').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024) { $('backup-msg').textContent = T.backupTooBig; return; }
    file.text().then(function (text) {
      var r = C.parseBackup(text, TOOL, ['settings', 'presets'], LANG);
      if (!r.ok) { $('backup-msg').textContent = r.error; return; }
      if (!window.confirm(T.backupConfirm)) return;
      state = fitPage(C.normalizeState(r.data.settings));
      presets = C.normalizePresets(r.data.presets, LANG);
      leaveShared();
      store.set('presets', presets);
      writeForm(); updateVisibility(); save(); render(); renderPresets();
      $('backup-msg').textContent = T.backupImported(presets.length);
    }, function () { $('backup-msg').textContent = T.backupUnreadable; });
  });

  // 開いたままのタブに別の共有リンクを貼ったときは、読み直してそのプリントを出す
  addEventListener('hashchange', function () { if (C.decodeShare(location.hash)) location.reload(); });

  // --- はじめの表示 ---
  if (sharedMode) {
    $('shared-banner').innerHTML = T.sharedBanner;   // 共有リンクで開いたときだけの文なので、ページには書かずここで入れる
    $('shared-banner').hidden = false;
    $('shared-keep-row').hidden = false;
    $('shared-seed').textContent = C.seedLabel(state.seed);
  }
  writeForm();
  updateVisibility();
  render();
  renderPresets();
  if (!sharedMode) save();
})();
