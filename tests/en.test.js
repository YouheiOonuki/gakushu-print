// 英語ページ（/en/）のテスト: ローマ字・用紙（A4／レター）・原稿用紙・文言の表・hreflang
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../calc.js');
const S = require('../sheets.js');
const TX = require('../text.js');
const K = require('../constants.js').kanjiByGrade.value;

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const build = (o, lang) => { const s = C.normalizeState(o); const wb = C.buildWorkbook(s, K, lang); return { s, wb, r: S.render(wb, s, lang) }; };
const ALL_ROWS = ['a', 'ka', 'sa', 'ta', 'na', 'ha', 'ma', 'ya', 'ra', 'wa', 'ga', 'za', 'da', 'ba', 'pa', 'small'];

// ヘボン式（ここに独立して書き写した表。calc.js の表と突き合わせる）
const HEPBURN = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o', か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so', た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no', は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo', や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro', わ: 'wa', を: 'o', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go', ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do', ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
};

test('ローマ字: 行の字（小さい字を除く 71 字）はすべてヘボン式、カタカナも同じ、小さい字は無し', () => {
  const chars = ALL_ROWS.filter((k) => k !== 'small').flatMap((k) => Array.from(C.KANA_ROWS[k]));
  assert.equal(chars.length, 71);
  assert.deepEqual(Object.fromEntries(chars.map((c) => [c, C.romajiOf(c)])), HEPBURN);
  chars.forEach((c) => assert.equal(C.romajiOf(C.toKata(c)), HEPBURN[c], C.toKata(c)));
  Array.from(C.KANA_ROWS.small).forEach((c) => { assert.equal(C.romajiOf(c), ''); assert.equal(C.romajiOf(C.toKata(c)), ''); });
  assert.equal(C.romajiOf('ー'), '');
  // よく誤る字
  assert.deepEqual(['し', 'ち', 'つ', 'ふ', 'を', 'ん', 'ぢ', 'づ', 'ヲ', 'ン'].map(C.romajiOf), ['shi', 'chi', 'tsu', 'fu', 'o', 'n', 'ji', 'zu', 'o', 'n']);
});

test('ローマ字: お手本（1 字目）にだけ付く。行の練習だけで、言葉には付けない。日本語ページの既定は無し', () => {
  const { wb, r } = build({ type: 'kana', kana: { rows: ALL_ROWS, romaji: true } }, 'en');
  const rows = wb.pages.flatMap((p) => p.rows);
  rows.forEach((row) => {
    assert.equal(row[0].kind, 'dark');
    assert.equal(row[0].ro || '', C.romajiOf(row[0].ch));
    row.slice(1).forEach((c) => assert.equal(c.ro, undefined));
  });
  const labels = [...r.html.matchAll(/<span class="ro" lang="en">([a-z]+)<\/span>(.)/g)].map((m) => [m[2], m[1]]);
  assert.equal(labels.length, 71);
  labels.forEach(([c, ro]) => assert.equal(ro, HEPBURN[c]));
  const kata = build({ type: 'kana', kana: { script: 'kata', rows: ['sa', 'wa'], romaji: true } }, 'en').r.html;
  assert.match(kata, /<span class="ro" lang="en">shi<\/span>シ/);
  assert.match(kata, /<span class="ro" lang="en">o<\/span>ヲ/);
  assert.doesNotMatch(build({ type: 'kana', kana: { source: 'words', words: 'しお', romaji: true } }, 'en').r.html, /class="ro"/);
  assert.equal(C.normalizeState({}).kana.romaji, false);
  assert.doesNotMatch(build({ type: 'kana', kana: { rows: ALL_ROWS } }).r.html, /class="ro"/);
});

test('用紙: レターは行数を減らし、プリントにクラスが付く。A4（日本語ページ）は前のまま', () => {
  for (const size of ['L', 'M', 'S']) {
    const a4 = build({ type: 'kana', kana: { rows: ALL_ROWS, size } }, 'en').wb;
    const lt = build({ type: 'kana', common: { paper: 'letter' }, kana: { rows: ALL_ROWS, size } }, 'en').wb;
    assert.equal(a4.pages[0].rows.length, C.TRACE_SIZES[size].rows);
    assert.equal(lt.pages[0].rows.length, C.TRACE_SIZES[size].rowsLetter);
    assert.ok(C.TRACE_SIZES[size].rowsLetter * C.TRACE_SIZES[size].mm <= C.PAPERS.letter.body.h, size);
  }
  assert.match(build({ type: 'genko', common: { paper: 'letter' } }, 'en').r.html, /class="sheet sheet-genko paper-letter"/);
  assert.doesNotMatch(build({ type: 'kana' }).r.html, /paper-letter/);
  assert.equal(C.normalizeState({ common: { paper: 'legal' } }).common.paper, 'a4');
});

test('原稿用紙: 400 字詰は 20×20、練習用のマス目は選んだ mm で本文に収まる。答えのページは無い', () => {
  for (const layout of ['v', 'h']) {
    const { wb, r } = build({ type: 'genko', genko: { layout, pages: 2 } }, 'en');
    assert.equal(wb.pages.length, 2);
    assert.equal(wb.hasAnswers, false);
    assert.equal(r.total, 2);
    assert.equal(wb.pages[0].cols * wb.pages[0].rows, 400);
    // 線の数: 20 本の列（行）それぞれに、仕切り 21 本と両側 2 本
    const d = r.html.match(/class="gk-line"/g).length;
    assert.equal(d, 2);
  }
  for (const paper of ['a4', 'letter']) {
    for (const size of C.GENKO_SIZES) {
      const p = build({ type: 'genko', common: { paper }, genko: { layout: 'grid', size } }, 'en').wb.pages[0];
      assert.ok(p.cols * size <= C.PAPERS[paper].body.w && p.rows * size <= C.PAPERS[paper].body.h, paper + size);
      assert.ok((p.cols + 1) * size > C.PAPERS[paper].body.w && (p.rows + 1) * size > C.PAPERS[paper].body.h, '余りが 1 ますより小さい');
    }
  }
  const g = build({ type: 'genko', genko: { layout: 'grid', size: 20, guides: false } }, 'en').r.html;
  assert.match(g, /width="180mm" height="240mm"/);
  assert.doesNotMatch(g, /gk-guide/);
  assert.deepEqual(C.normalizeState({ genko: { layout: 'x', size: 13 } }).genko, C.defaults().genko);
});

test('英語のプリント: 見出し・名前・日付・クレジットが英語、字の部分は lang="ja"', () => {
  const { r } = build({ type: 'kana', common: { name: 'Emma' }, kana: { rows: ['a'] } }, 'en');
  assert.match(r.html, /Hiragana practice/);
  assert.match(r.html, /<span class="lbl">Name<\/span>/);
  assert.match(r.html, /<span class="lbl">Date<\/span>/);
  assert.match(r.html, /Made at yorozu-craft\.com\/gakushu-print\/print\//);
  assert.match(r.html, /<div class="tr tr-L" lang="ja"/);
  assert.doesNotMatch(r.html, /なまえ|がつ|なぞって/);
  // lang を省くと日本語（日本語ページの出力は前と同じ）
  const ja = build({ type: 'kana', kana: { rows: ['a'] } });
  assert.equal(ja.r.html, S.render(ja.wb, ja.s, 'ja').html);
  assert.match(ja.r.html, /なまえ/);
});

test('英語の読み取り・お知らせ: なぞる言葉とバックアップ', () => {
  const w = C.parseKanaWords('ねこ カタ x', 'hira', 'en');
  assert.deepEqual(w.words, ['ねこ']);
  assert.match(w.hint, /katakana/);
  assert.match(build({ type: 'kana', kana: { source: 'words', words: '' } }, 'en').wb.notes[0], /No words yet/);
  assert.match(C.parseBackup('x', 'gakushu-print', [], 'en').error, /Could not read/);
  assert.equal(C.normalizePresets([{ name: '' }], 'en')[0].name, 'Untitled');
});

test('text.js: 日本語と英語で同じ項目がそろっている', () => {
  for (const part of ['ui', 'calc', 'sheet']) {
    assert.deepEqual(Object.keys(TX[part].en).sort(), Object.keys(TX[part].ja).sort(), part);
  }
  for (const k of ['typeNames', 'kanaLabels', 'sizeNames', 'answerNames', 'paperNames']) {
    assert.deepEqual(Object.keys(TX.ui.en[k]).sort(), Object.keys(TX.ui.ja[k]).sort(), k);
  }
  assert.deepEqual(Object.keys(TX.ui.ja.typeNames).sort(), C.TYPES.slice().sort());
  assert.equal(C.CREDIT, TX.sheet.ja.credit);
});

test('使い方ページのローマ字表が calc.js の表と一致する', () => {
  const html = read('en/guide.html');
  const cells = [...html.matchAll(/<td><span lang="ja">(.) (.)<\/span> ([a-z]+)<\/td>/g)];
  assert.equal(cells.length, 71);
  cells.forEach(([, h, k, ro]) => { assert.equal(ro, HEPBURN[h]); assert.equal(k, C.toKata(h)); });
});

test('hreflang: 日本語と英語のページが両方向に結ばれ、canonical は自分、英語のフッターは英語の共通ページ', () => {
  const B = 'https://yorozu-craft.com/gakushu-print/';
  const pairs = [['index.html', 'en/index.html', '', 'en/'], ['guide.html', 'en/guide.html', 'guide.html', 'en/guide.html']];
  for (const [jf, ef, ju, eu] of pairs) {
    for (const f of [jf, ef]) {
      const h = read(f);
      assert.ok(h.includes(`hreflang="ja" href="${B}${ju}"`), f);
      assert.ok(h.includes(`hreflang="en" href="${B}${eu}"`), f);
      assert.ok(h.includes(`hreflang="x-default" href="${B}${ju}"`), f);
    }
    assert.ok(read(jf).includes(`rel="canonical" href="${B}${ju}"`));
    assert.ok(read(ef).includes(`rel="canonical" href="${B}${eu}"`));
    const e = read(ef);
    assert.match(e, /<html lang="en">/);
    assert.ok(e.includes('href="../../en/about.html"') && e.includes('href="../../en/privacy-policy.html"') && e.includes('href="../../en/"'));
    assert.ok(!/href="\.\.\/\.\.\/(about|privacy-policy)\.html"/.test(e));
  }
  const sm = read('sitemap.xml');
  assert.ok(sm.includes(`<loc>${B}en/</loc>`) && sm.includes(`<loc>${B}en/guide.html</loc>`));
});

test('英語ページで出す種類はなぞり書きと原稿用紙だけ（漢字は読みのデータが無いので出さない）', () => {
  const types = [...read('en/index.html').matchAll(/name="type" value="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(types, ['kana', 'genko']);
  const ja = [...read('index.html').matchAll(/name="type" value="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(ja, ['arith', 'kuku', 'hyaku', 'clock', 'kana', 'kanji', 'maze']);
});
