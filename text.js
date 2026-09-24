// ===========================
// 学習プリントメーカー — 画面・プリント・読み取りの文言（日本語 ja ／英語 en）
// 日本語ページ（/gakushu-print/）と英語ページ（/gakushu-print/en/）が同じ calc.js・sheets.js・main.js を使い、
// 文言だけをここから <html lang> で選ぶ。ページに直接書いた文言（見出し・ラベル）は各 HTML にある
// 英語で出るのは英語ページで選べる種類（なぞり書き・漢字・原稿用紙）の文言。ほかの種類の en は、共有リンクなどで
// 迷い込んだときのための最低限
// ブラウザでは window.TEXT、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var ui = {
    ja: {
      typeNames: { arith: 'たし算・ひき算', kuku: '九九', hyaku: '百ます計算', clock: '時計の読み方', kana: 'ひらがな・カタカナ', kanji: '漢字練習', maze: '迷路', genko: '原稿用紙' },
      kanaLabels: { a: 'あ行', ka: 'か行', sa: 'さ行', ta: 'た行', na: 'な行', ha: 'は行', ma: 'ま行', ya: 'や行', ra: 'ら行', wa: 'わ行', ga: 'が行', za: 'ざ行', da: 'だ行', ba: 'ば行', pa: 'ぱ行', small: '小さい字' },
      pages: function (n) { return n + ' 枚'; },
      count: function (n) { return n + ' 問'; },
      sizeNames: { L: '大', M: '中', S: '小' },
      answerNames: { q: '問題だけ', qa: '問題と答え', a: '答えだけ' },
      moreArith: function (tate, pages) { return ': ' + (tate ? 'たて（筆算）' : 'よこ') + '・' + pages + ' 枚'; },
      moreClock: function (guide) { return ': 分の数字' + (guide ? 'あり' : 'なし'); },
      moreSize: function (size) { return ': ますの大きさ ' + ui.ja.sizeNames[size]; },
      moreKana: function (size) { return ': ますの大きさ ' + ui.ja.sizeNames[size]; },
      moreHand: function (hand) { return ': ' + (hand === 'left' ? '左利き' : '右利き'); },
      commonState: function (c, hasAns, paperName) {
        return (c.showName ? 'なまえの欄あり' : 'なまえの欄なし') + '・' + (hasAns ? ui.ja.answerNames[c.answers] : '答えのページなし') + '・' + paperName;
      },
      paperNames: { a4: 'A4 縦', letter: 'レター 縦' },
      answersNote: '答えは問題のあとに別のページでまとめて出ます。丸つけ用に「答えだけ」をあとから印刷することもできます（問題番号が同じなら同じ答え）。',
      answersNone: 'このプリントには答えのページはありません。',
      reportLine: function (line, text, reason) { return line + ' 行目「' + text + '」: ' + reason + '（使いません）'; },
      reportMore: function (n) { return 'ほか ' + n + ' 行'; },
      useItems: function (n, clock) { return n + (clock ? ' つの時刻' : ' 問') + 'を使います。'; },
      useWords: function (n) { return n + ' 語をなぞります。'; },
      dropped: function (kata, list) { return (kata ? 'カタカナ' : 'ひらがな') + 'でない文字は外しました：' + list.map(function (c) { return '「' + c + '」'; }).join(''); },
      kanjiChars: function (n, s) { return n + ' 字：' + s; },
      kanjiHigher: function (grade, list) { return grade + ' 年生より上の学年の字は外しました：' + list + '。学年を上げると使えます。'; },
      kanjiHigherItem: function (c, g) { return c + '（' + g + '年）'; },
      listSep: '、',
      kanjiOutside: function (s) { return '小学校で習う漢字（学年別漢字配当表）にない字は外しました：' + s; },
      kanjiRange: function (st, end, a, b, all) { return st + '〜' + end + ' 番目（' + a + '〜' + b + '）を練習します。全部で ' + all + ' 字。'; },
      seedInfo: function (seed) { return '問題番号 ' + seed + '・'; },
      sheetsQA: function (q, a) { return '問題 ' + q + ' 枚＋答え ' + a + ' 枚'; },
      sheetsA: function (a) { return '答え ' + a + ' 枚'; },
      sheetsN: function (n) { return n + ' 枚'; },
      paperInfo: function (paperName) { return '（' + paperName + '）'; },
      noPages: '印刷するページがありません。',
      sharedBanner: '<p><strong>共有されたプリントです</strong>（問題番号 <span id="shared-seed"></span>）。このまま印刷すると、送った人と同じ問題になります。</p>' +
        '<div class="btn-row"><a href="./" id="shared-new" class="btn btn-sub">自分のプリントを作る</a></div>' +
        '<p class="small">ひらがな・漢字・計算・時計・迷路のプリントを、登録なしで作れます。</p>',
      shareTooLong: 'リンクが長くなりすぎました（入れた問題や言葉が多いため）。「ファイルに書き出す」で作ったファイルを渡してください。',
      shareCopied: 'リンクをコピーしました。開いた人は同じ問題のプリントを印刷できます。',
      shareSelected: 'リンクを選びました。コピーして送ってください。',
      sharedKept: '共有されたプリントの設定を、この端末に保存しました。',
      presetLoad: '呼び出す',
      presetDelete: '削除',
      presetLimit: function (n) { return '保存できるのは ' + n + ' 件までです。使わないものを削除してください。'; },
      presetSaved: function (name) { return '「' + name + '」を保存しました。'; },
      presetLoaded: function (name) { return '「' + name + '」を呼び出しました（新しい問題です）。'; },
      presetConfirmDelete: function (name) { return '「' + name + '」を削除します。よろしいですか？'; },
      presetDeleted: '削除しました。',
      presetDefaultName: function (childName, typeName) { return (childName ? childName + ' ' : '') + typeName; },
      backupExported: 'ファイルに書き出しました。機種変更のときは、このファイルを新しい端末に移して「ファイルから読み込む」を押してください。',
      backupTooBig: 'ファイルが大きすぎます。このツールで書き出したファイルを選んでください。',
      backupConfirm: 'ファイルの内容で、いまの設定とよく使う設定を置き換えます。よろしいですか？',
      backupImported: function (n) { return 'ファイルから読み込みました（よく使う設定 ' + n + ' 件）。'; },
      backupUnreadable: 'ファイルを読み取れませんでした。',
    },
    en: {
      typeNames: { arith: 'Addition and subtraction', kuku: 'Times tables', hyaku: '100-square math', clock: 'Telling time', kana: 'Kana tracing', kanji: 'Kanji practice', maze: 'Maze', genko: 'Genkouyoushi / grid' },
      kanaLabels: { a: 'a', ka: 'ka', sa: 'sa', ta: 'ta', na: 'na', ha: 'ha', ma: 'ma', ya: 'ya', ra: 'ra', wa: 'wa', ga: 'ga', za: 'za', da: 'da', ba: 'ba', pa: 'pa', small: 'small' },
      pages: function (n) { return n + (n === 1 ? ' page' : ' pages'); },
      count: function (n) { return n + ' problems'; },
      sizeNames: { L: 'large', M: 'medium', S: 'small' },
      answerNames: { q: 'questions only', qa: 'questions and answers', a: 'answers only' },
      moreArith: function (tate, pages) { return ': ' + (tate ? 'vertical' : 'horizontal') + ', ' + ui.en.pages(pages); },
      moreClock: function (guide) { return ': minute numbers ' + (guide ? 'on' : 'off'); },
      moreSize: function (size) { return ': ' + ui.en.sizeNames[size] + ' squares'; },
      moreKana: function (size) { return ': ' + ui.en.sizeNames[size] + ' squares'; },
      moreHand: function (hand) { return ': ' + (hand === 'left' ? 'left-handed' : 'right-handed'); },
      commonState: function (c, hasAns, paperName) {
        return (c.showName ? 'name line' : 'no name line') + ', ' + (hasAns ? ui.en.answerNames[c.answers] : 'no answer pages') + ', ' + paperName;
      },
      paperNames: { a4: 'A4', letter: 'US Letter' },
      answersNote: 'Answer pages follow the questions.',
      answersNone: 'These sheets have no answer pages.',
      reportLine: function (line, text, reason) { return 'Line ' + line + ' "' + text + '": ' + reason + ' (skipped)'; },
      reportMore: function (n) { return n + ' more lines'; },
      useItems: function (n, clock) { return n + (clock ? ' times' : ' problems') + ' added.'; },
      useWords: function (n) { return n + (n === 1 ? ' word' : ' words') + ' to trace.'; },
      dropped: function (kata, list) { return 'Removed (not ' + (kata ? 'katakana' : 'hiragana') + '): ' + list.join(' '); },
      kanjiChars: function (n, s) { return n + ' kanji: ' + s; },
      kanjiHigher: function (grade, list) { return 'Removed (taught after grade ' + grade + '): ' + list; },
      kanjiHigherItem: function (c, g) { return c + ' (grade ' + g + ')'; },
      listSep: ', ',
      kanjiOutside: function (s) { return 'Removed (not in the grade 1–6 lists): ' + s; },
      kanjiRange: function (st, end, a, b, all) { return 'Kanji ' + st + '–' + end + ' (' + a + '–' + b + ') of ' + all + '.'; },
      seedInfo: function (seed) { return 'Sheet number ' + seed + ', '; },
      sheetsQA: function (q, a) { return q + ' question + ' + a + ' answer pages'; },
      sheetsA: function (a) { return ui.en.pages(a) + ' of answers'; },
      sheetsN: function (n) { return ui.en.pages(n); },
      paperInfo: function (paperName) { return ' (' + paperName + ', portrait)'; },
      noPages: 'Nothing to print yet.',
      sharedBanner: '<p><strong>Someone shared these sheets with you.</strong> Print them as they are, or change anything to make your own.</p>' +
        '<div class="btn-row"><a href="./" id="shared-new" class="btn btn-sub">Make my own sheets</a></div><span id="shared-seed" hidden></span>',
      shareTooLong: 'The link is too long (too many words). Use "Save to a file" and send the file instead.',
      shareCopied: 'Link copied. Anyone who opens it can print the same sheets.',
      shareSelected: 'Link selected. Copy it and send it.',
      sharedKept: 'Saved these settings in this browser.',
      presetLoad: 'Load',
      presetDelete: 'Delete',
      presetLimit: function (n) { return 'You can save up to ' + n + '. Delete one first.'; },
      presetSaved: function (name) { return 'Saved "' + name + '".'; },
      presetLoaded: function (name) { return 'Loaded "' + name + '".'; },
      presetConfirmDelete: function (name) { return 'Delete "' + name + '"?'; },
      presetDeleted: 'Deleted.',
      presetDefaultName: function (childName, typeName) { return (childName ? childName + ' ' : '') + typeName; },
      backupExported: 'Saved to a file. On a new device, open this page and choose "Load from a file".',
      backupTooBig: 'This file is too large. Choose a file saved by this tool.',
      backupConfirm: 'Replace your current and saved settings with the ones in this file?',
      backupImported: function (n) { return 'Loaded from the file (' + n + ' saved settings).'; },
      backupUnreadable: 'Could not read the file.',
    },
  };

  // calc.js の読み取り・お知らせ（英語ページで出るものだけ en を持つ。計算・時計の読み取りの理由は日本語ページ専用）
  var calc = {
    ja: {
      kanaHintKata: 'ひらがなが入っています。ひらがなのプリントに切り替えると使えます。',
      kanaHintHira: 'カタカナが入っています。カタカナのプリントに切り替えると使えます。',
      noWords: 'なぞる言葉が入っていません。言葉を入れるか、「行を選ぶ」に切り替えてください。',
      noKanji: '練習する漢字がまだありません。一覧から選ぶか、漢字を入れてください。',
      kanjiEnd: function (grade, n) { return grade + '年生の漢字は ' + n + ' 字です。最後の字で終わります。'; },
      backupBad: 'ファイルを読み取れませんでした。このツールの「ファイルに書き出す」で作った .json ファイルを選んでください。',
      backupOther: function (tool) { return 'ほかのツール（' + tool + '）のファイルです。このツールで書き出したファイルを選んでください。'; },
      backupNewer: '新しい版のツールで書き出したファイルのため読み込めません。ページを再読み込みしてから、もう一度お試しください。',
      backupFormat: 'ファイルの形式が正しくないため読み込めません。',
      backupMissing: 'ファイルの中身が足りないため読み込めません。',
      presetNoName: '名前なし',
    },
    en: {
      kanaHintKata: 'Your text has hiragana. Switch to Hiragana to use it.',
      kanaHintHira: 'Your text has katakana. Switch to Katakana to use it.',
      noWords: 'No words yet. Type some kana, or switch to "Kana rows".',
      noKanji: 'No kanji chosen yet.',
      kanjiEnd: function (grade, n) { return 'Grade ' + grade + ' has ' + n + ' kanji. The sheet ends at the last one.'; },
      backupBad: 'Could not read this file. Choose a .json file made with "Save to a file" in this tool.',
      backupOther: function (tool) { return 'This file is from another tool (' + tool + '). Choose a file saved by this tool.'; },
      backupNewer: 'This file was saved by a newer version. Reload the page and try again.',
      backupFormat: 'This file is not in the right format.',
      backupMissing: 'This file is incomplete.',
      presetNoName: 'Untitled',
    },
  };

  // プリント（紙）に入る文言。日本語は子ども向けのひらがな（元のまま）
  var sheet = {
    ja: {
      name: 'なまえ', month: 'がつ', day: 'にち', date: '',
      credit: 'yorozu-craft.com/gakushu-print/print/ で作成',
      kanaTitle: function (kata) { return (kata ? 'カタカナ' : 'ひらがな') + ' れんしゅう'; },
      traceInst: 'うすい 字を なぞってから、じぶんで かきましょう。',
      genkoTitle: function () { return 'げんこうようし'; },
      gridTitle: function () { return 'れんしゅう ようし'; },
      genkoSub: function (layout, mm) { return layout === 'v' ? '400字（たて書き）' : layout === 'h' ? '400字（よこ書き）' : mm + 'mm'; },
      kanjiTitle: function () { return 'かん字 れんしゅう'; },
      kanjiSub: function (grade) { return grade + 'ねんせい'; },
      seedNo: 'もんだい ばんごう ',
    },
    en: {
      name: 'Name', month: '', day: '', date: 'Date',
      credit: 'Made at yorozu-craft.com/gakushu-print/print/',
      kanaTitle: function (kata) { return kata ? 'Katakana practice カタカナ' : 'Hiragana practice ひらがな'; },
      traceInst: 'Trace the gray characters, then write your own in the empty squares.',
      genkoTitle: function () { return 'Genkouyoushi 原稿用紙'; },
      gridTitle: function () { return 'Handwriting practice grid'; },
      genkoSub: function (layout, mm) { return layout === 'v' ? '400 squares (20 × 20), vertical writing' : layout === 'h' ? '400 squares (20 × 20), horizontal writing' : mm + ' mm squares'; },
      kanjiTitle: function () { return 'Kanji practice 漢字'; },
      kanjiSub: function (grade) { return 'Grade ' + grade + ' (Japanese elementary school)'; },
      seedNo: 'Sheet number ',
    },
  };

  var api = { ui: ui, calc: calc, sheet: sheet };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TEXT = api;
})(this);
