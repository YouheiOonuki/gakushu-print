// ローマ字（つづり・タイピングの判定・言葉の一覧・プリント・ゲームの記録）のテスト: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../romaji.js');
const W = require('../romaji-words.js');
const K = require('../constants.js');
const C = require('../calc.js');
const S = require('../sheets.js');
const G = require('../romaji/game.js');

const typeAll = (kana, keys, sys) => {
  const t = R.makeTyper(kana, sys || 'hep');
  let miss = 0;
  for (const c of keys) if (!t.key(c).ok) miss++;
  return { done: t.isDone(), miss };
};

test('本表（令和7年内閣告示第4号）のつづり: 対照表で本表と第1表がちがう字', () => {
  // 告示の「（付）対照表」の行: シ shi/si、チ chi/ti、ツ tsu/tu、フ fu/hu、ヲ o、ジ ji/zi、ヂ ji/zi、ヅ zu/zu、シャ sha/sya、チャ cha/tya、ジャ ja/zya、ヂャ ja/zya
  const rows = [['し', 'shi', 'si'], ['ち', 'chi', 'ti'], ['つ', 'tsu', 'tu'], ['ふ', 'fu', 'hu'], ['を', 'o', 'o'], ['じ', 'ji', 'zi'], ['ぢ', 'ji', 'zi'], ['づ', 'zu', 'zu'],
    ['しゃ', 'sha', 'sya'], ['しゅ', 'shu', 'syu'], ['しょ', 'sho', 'syo'], ['ちゃ', 'cha', 'tya'], ['ちゅ', 'chu', 'tyu'], ['ちょ', 'cho', 'tyo'],
    ['じゃ', 'ja', 'zya'], ['じゅ', 'ju', 'zyu'], ['じょ', 'jo', 'zyo'], ['ぢゃ', 'ja', 'zya'], ['ぢゅ', 'ju', 'zyu'], ['ぢょ', 'jo', 'zyo']];
  for (const [k, hep, kun] of rows) {
    assert.equal(R.spell(k, 'hep'), hep, k);
    assert.equal(R.spell(k, 'kun'), kun, k);
  }
  // 本表でほかの字は同じ（か ka、きゃ kya、ん n …）
  assert.equal(R.spell('かきくけこ', 'kun'), 'kakikukeko');
  assert.equal(R.spell('きゃりょびゅ', 'hep'), 'kyaryobyu');
});

test('添え書きの例: ん n・n\'、っ は子音字を重ねる（ch は c）、長音は母音字を並べる', () => {
  assert.equal(R.spell('あんまん', 'hep'), 'anman');
  assert.equal(R.spell('かんぱい', 'hep'), 'kanpai');
  assert.equal(R.spell('しんぶん', 'hep'), 'shinbun');     // 新聞（m にしない）
  assert.equal(R.spell('ざっし', 'hep'), 'zasshi');
  assert.equal(R.spell('てっぱん', 'hep'), 'teppan');
  assert.equal(R.spell('にっちょく', 'hep'), 'nicchoku');
  assert.equal(R.spell('やっきょく', 'hep'), 'yakkyoku');
  assert.equal(R.spell('たんい', 'hep'), "tan'i");
  assert.equal(R.spell('せんいん', 'hep'), "sen'in");
  assert.equal(R.spell('とんや', 'hep'), "ton'ya");
  assert.equal(R.spell('かあさん', 'hep'), 'kaasan');
  assert.equal(R.spell('とうきょう', 'hep'), 'toukyou');   // (2) 母音字を並べる: Toukyou
  assert.equal(R.spell('じゅうごや', 'hep'), 'juugoya');
  assert.equal(R.spell('まっちゃ', 'hep'), 'maccha');      // 8 の例: matcha → maccha
  assert.equal(R.spell('にっちょく', 'kun'), 'nittyoku');
});

test('タイピング: ヘボン式・訓令式・IME の打ち方のどれでも正解', () => {
  const ok = [
    ['しんぶん', 'shinbun'], ['しんぶん', 'sinbun'], ['しんぶん', 'cinbun'],
    ['つくえ', 'tsukue'], ['つくえ', 'tukue'], ['ふじ', 'fuji'], ['ふじ', 'huzi'],
    ['ちきゅう', 'chikyuu'], ['ちきゅう', 'tikyuu'], ['ちゃ', 'cha'], ['ちゃ', 'tya'], ['ちゃ', 'cya'], ['ちゃ', 'chixya'], ['じゃ', 'ja'], ['じゃ', 'zya'], ['じゃ', 'jya'],
    ['はなぢ', 'hanaji'], ['はなぢ', 'hanazi'], ['はなぢ', 'hanadi'],
    ['ほっかいどう', 'hokkaidou'], ['にっきちょう', 'nikkichou'], ['にっきちょう', 'nikkityou'], ['にっきちょう', 'nixtukichou'], ['まっちゃ', 'maccha'], ['まっちゃ', 'mattya'], ['まっちゃ', 'matcha'],
    ['せんえん', 'sennen'], ['せんえん', "sen'en"], ['きんようび', 'kinnyoubi'], ['みんな', 'minnna'],
    ['ほん', 'hon'], ['ほん', 'honn'], ['さんすう', 'sansuu'], ['さんすう', 'sannsuu'],
  ];
  for (const [k, s] of ok) assert.deepEqual(typeAll(k, s), { done: true, miss: 0 }, k + ' ' + s);
  // 大文字（CapsLock）でも
  assert.deepEqual(typeAll('やま', 'YAMA'), { done: true, miss: 0 });
});

test('タイピング: まちがいは数え、進まない。IME で読みが変わる打ち方はまちがい', () => {
  assert.deepEqual(typeAll('やま', 'yqama'), { done: true, miss: 1 });
  // せんえん を senen と打つと IME では せねん になる → n の次の e はまちがい
  const t = typeAll('せんえん', 'senen');
  assert.equal(t.done, false);
  assert.ok(t.miss >= 1);
  // きんようび を kinyoubi → きにょうび
  assert.equal(typeAll('きんようび', 'kinyoubi').done, false);
});

test('タイピング: お手本（残りの打ち方）は選んだつづり、打ち始めた形に合わせる', () => {
  const t = R.makeTyper('しゃしん', 'hep');
  assert.deepEqual(t.guide(), { typed: '', rest: 'shashin' });
  t.key('s'); t.key('y');
  assert.equal(t.guide().rest.slice(0, 1), 'a');
  assert.deepEqual(R.makeTyper('しゃしん', 'kun').guide(), { typed: '', rest: 'syasin' });
  assert.equal(R.typingOf('せんえん', 'hep'), 'sennen');     // キーボードでは nn
  assert.equal(R.typingOf('ほん', 'hep'), 'hon');
  assert.equal(R.makeTyper('しゃしん', 'hep').current(), 'しゃ');
});

test('ん で終わる語: n 1 つで打ち終わり、続けて押した n は数えない', () => {
  const t = R.makeTyper('ほん', 'hep');
  for (const c of 'hon') t.key(c);
  assert.equal(t.isDone(), true);
  assert.equal(t.key('n').ignored, true);
  assert.equal(t.key('n').ok, false);        // 2 つ目からは受け流さない
});

test('言葉の一覧: 学年ごとに、その学年までの配当表の漢字だけ・その学年の字を 1 字以上。よみはすべてローマ字にできる', () => {
  const byGrade = K.kanjiByGrade.value;
  const g = {};
  for (const k in byGrade) for (const c of byGrade[k]) g[c] = Number(k);
  const seen = new Set();
  for (let gr = 1; gr <= 6; gr++) {
    assert.ok(W[gr].length >= 30, gr + ' 年: ' + W[gr].length + ' 語');
    for (const x of W[gr]) {
      const kanji = [...x.w].filter((c) => /[一-鿿]/.test(c));
      assert.ok(kanji.length > 0, x.w);
      for (const c of kanji) assert.ok(g[c] && g[c] <= gr, `${gr} 年「${x.w}」の ${c}（${g[c] || '配当表外'}）`);
      assert.ok(kanji.some((c) => g[c] === gr), `${gr} 年「${x.w}」に ${gr} 年の字がない`);
      assert.match(x.k, /^[ぁ-ゖ]+$/, x.w);
      assert.ok(R.chunks(x.k), x.k);
      assert.ok(R.spell(x.k, 'hep') && R.spell(x.k, 'kun'), x.k);
      // お手本の打ち方で、そのまま打ち終われる（両方のつづり）
      for (const sys of ['hep', 'kun']) assert.deepEqual(typeAll(x.k, R.typingOf(x.k, sys), sys), { done: true, miss: 0 }, x.k + ' ' + sys);
      assert.ok(!seen.has(x.w), '重複 ' + x.w);
      seen.add(x.w);
    }
  }
});

test('ローマ字表: 清音 11 行・濁音 5 行・拗音 11 行。表の字は全部ローマ字にできる', () => {
  assert.equal(R.TABLE.seion.length, 11);
  assert.equal(R.TABLE.dakuon.length, 5);
  assert.equal(R.TABLE.yoon.length, 11);
  assert.deepEqual(R.tableRow('や・ゆ・よ'), ['や', '', 'ゆ', '', 'よ']);
  assert.deepEqual(R.tableRow('きゃきゅきょ'), ['きゃ', 'きゅ', 'きょ']);
  const pool = G.kanaPool();
  assert.equal(pool.length, 46 + 25 + 33);
  for (const x of pool) assert.ok(R.spell(x.k, 'hep'), x.k);
});

test('プリント: ローマ字の言葉は 1 枚 10 語、答えは「自分で書く」だけ。表は 1 枚で答えなし', () => {
  const Kv = K.kanjiByGrade.value;
  const build = (o) => { const s = C.normalizeState(o); const wb = C.buildWorkbook(s, Kv); return { s, wb, r: S.render(wb, s) }; };
  const a = build({ type: 'romaji', seed: 3, romaji: { source: 'words', grade: 4, mode: 'trace', pages: 2 } });
  assert.equal(a.wb.pages.length, 2);
  assert.equal(a.wb.pages[0].items.length, 10);
  assert.equal(a.wb.hasAnswers, false);
  assert.equal(a.r.total, 2);
  assert.ok(a.wb.pages.flatMap((p) => p.items).every((it) => W[4].some((x) => x.w === it.w)));
  // 固有名詞は頭が大文字
  const fuku = a.wb.pages.flatMap((p) => p.items).find((it) => it.k === 'ふくい');
  if (fuku) assert.equal(fuku.r, 'Fukui');
  const b = build({ type: 'romaji', seed: 3, romaji: { source: 'words', grade: 2, sys: 'kun', mode: 'write' }, common: { answers: 'qa' } });
  assert.equal(b.wb.hasAnswers, true);
  assert.equal(b.r.questions, 1);
  assert.equal(b.r.answers, 1);
  assert.match(b.r.html, /訓令式/);
  const t = build({ type: 'romaji', romaji: { source: 'table', sys: 'hep' } });
  assert.equal(t.wb.pages.length, 1);
  assert.equal(t.wb.hasAnswers, false);
  assert.match(t.r.html, />shi</);
  assert.match(t.r.html, />tsu</);
  const tk = build({ type: 'romaji', romaji: { source: 'table', sys: 'kun' } });
  assert.match(tk.r.html, />si</);
  assert.doesNotMatch(tk.r.html, />shi</);
  // 同じ種なら同じ（共有リンク）
  const again = build({ type: 'romaji', seed: 3, romaji: { source: 'words', grade: 4, mode: 'trace', pages: 2 } });
  assert.equal(again.r.html, a.r.html);
  const back = C.decodeShare('#s=' + C.encodeShare(a.s));
  assert.deepEqual(back.romaji, a.s.romaji);
});

test('ゲーム: 設定・問題の並び・記録の正規化', () => {
  assert.deepEqual(G.normalizeSettings({}), { level: '3', sys: 'hep', guide: true, count: 10 });
  assert.deepEqual(G.normalizeSettings({ level: 'x', sys: 'kun', guide: false, count: 99 }), { level: '3', sys: 'kun', guide: false, count: 10 });
  const s = G.normalizeSettings({ level: '1', count: 20 });
  const qs = G.makeQuestions(s, 42);
  assert.equal(qs.length, 20);
  assert.equal(new Set(qs.map((q) => q.w)).size, 20);    // 一覧が 20 語以上なら重ならない
  assert.deepEqual(G.makeQuestions(s, 42), qs);
  const r0 = G.normalizeRecords(null);
  const r1 = G.addResult(r0, s, 30000, 50, 2, ['し', 'し', 'ちゃ'], '2026-09-25');
  assert.equal(r1.isBest, true);
  assert.equal(r1.rec.miss['し'], 2);
  assert.equal(G.perMinute(50, 30000), 100);
  const r2 = G.addResult(r1.rec, s, 40000, 50, 0, [], '2026-09-26');
  assert.equal(r2.isBest, false);
  assert.equal(r2.rec.best['1|20'].ms, 30000);
  assert.equal(r2.rec.plays, 2);
  // 壊れた記録は捨てる
  const bad = G.normalizeRecords({ best: { '9|10': { ms: 1 }, '1|10': { ms: -5 }, '2|20': { ms: 12345, miss: 3, keys: 40 } }, miss: { 'x': 3, 'し': 'a', 'ちゃ': 2 } });
  assert.deepEqual(Object.keys(bad.best), ['2|20']);
  assert.deepEqual(bad.miss, { 'ちゃ': 2 });
  // プリントへのリンク
  const h = G.printHash(G.normalizeSettings({ level: '5', sys: 'kun' }), 9);
  const st = C.decodeShare('#' + h);
  assert.equal(st.type, 'romaji');
  assert.equal(st.romaji.grade, 5);
  assert.equal(st.romaji.sys, 'kun');
});

test('constants.js: つづりの出典と確認日', () => {
  const r = K.romajiRule;
  assert.match(r.source, /令和7年12月22日内閣告示第4号/);
  assert.match(r.url, /^https:\/\/www\.bunka\.go\.jp\//);
  assert.match(r.checked, /^\d{4}-\d{2}-\d{2}$/);
});
