// 暗号メーカー（angou/）のテスト: 字の分け方（濁点・半濁点・小さい字・長音）・各方式の往復・共有・紙: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calc.js');
const A = require('../angou/cipher.js');
const S = require('../angou/sheets.js');

const SEEDS = Array.from({ length: 25 }, (_, i) => (i * 2654435761) >>> 0);
// すべてのかな（清音・濁音・半濁音・小さい字）とカタカナ・英字・記号・改行
const ALL_HIRA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん' +
  'がぎぐげござじずぜぞだぢづでどばびぶべぼゔぱぴぷぺぽぁぃぅぇぉっゃゅょゎ';
const ALL_KATA = Array.from(ALL_HIRA).map(A.toKata).join('');
const CORPUS = [
  'たからは つくえの したに あるよ！',
  'おたんじょうび おめでとう\nパーティーは 3じから',
  'きゃっきゃ ぎゅうにゅう ぴょんぴょん ヴァイオリン',
  'Happy Birthday, KENTA',
  ALL_HIRA, ALL_KATA, ALL_HIRA + '\n' + ALL_KATA + '\nABCxyz',
  'ーーー、。？！',
  '',
];

function roundTrip(state) {
  const b = A.build(state);
  const back = A.decode(b.cipher, b.key);
  return { b, back: A.detokenize(back), plain: A.detokenize(b.tokens) };
}

test('tokenize: 濁点・半濁点・小さい字は「もとの字＋しるし」に分ける', () => {
  const [ga, pa, tsu, kya, v] = A.tokenize('がぱっゃゔ');
  assert.deepEqual([ga.i, ga.mark, ga.small], [A.KANA.indexOf('か'), 1, false]);
  assert.deepEqual([pa.i, pa.mark], [A.KANA.indexOf('は'), 2]);
  assert.deepEqual([tsu.i, tsu.small], [A.KANA.indexOf('つ'), true]);
  assert.deepEqual([kya.i, kya.small], [A.KANA.indexOf('や'), true]);
  assert.deepEqual([v.i, v.mark], [A.KANA.indexOf('う'), 1]);
  // 長音・句読点・数字・空白・改行は そのまま（暗号にしない）
  A.tokenize('ー、。1 \n').forEach((t) => { assert.equal(t.t, 'o'); assert.ok(!t.bad); });
  // 漢字・ゐ は暗号にできない（お知らせを出す）
  assert.ok(A.tokenize('漢')[0].bad);
  assert.ok(A.tokenize('ゐ')[0].bad);
  assert.equal(A.checkMessage(A.tokenize('お誕生日'), A.normalize({}), null).length, 1);
});

test('tokenize: カタカナ・半角カナ・全角英字・はなれた ゛ も読める', () => {
  const k = A.tokenize('パーティー');
  assert.ok(k.filter((t) => t.t === 'k').every((t) => t.kata));
  assert.equal(A.detokenize(A.tokenize('ﾊﾟｰﾃｨｰ')), 'パーティー');       // 半角カナ → 全角
  assert.equal(A.detokenize(A.tokenize('ＡＢｃ')), 'ABc');
  assert.equal(A.detokenize(A.tokenize('か゛は゜')), 'がぱ');            // はなれた ゛゜（U+309B/309C）
  assert.equal(A.detokenize(A.tokenize('が')), 'が');              // 結合文字
  const na = A.tokenize('な゛');                                          // 濁点がつかない字にも しるしとして持つ
  assert.equal(na.length, 1); assert.equal(na[0].mark, 1);
  assert.equal(A.charOf(na[0]), 'な゛');
});

test('tokenize → detokenize: かな・英字・記号の文は そのまま もどる', () => {
  for (const m of CORPUS) assert.equal(A.detokenize(A.tokenize(m)), m.normalize('NFKC'));
});

test('ずらし: 決まった値（あ+3=え、ん+1=あ、が+1=ぎ、ぽ+1=ま゜、Z+1=A、っ+1 は小さい て）', () => {
  const enc = (msg, key) => A.build({ method: 'shift', msg, key }).cipher;
  assert.equal(A.cipherText(enc('あ', 3)), 'え');
  assert.equal(A.cipherText(enc('ん', 1)), 'あ');
  assert.equal(A.cipherText(enc('が', 1)), 'ぎ');
  assert.equal(A.cipherText(enc('ぽ', 1)), 'ま゜');
  assert.equal(A.cipherText(enc('ガ', 1)), 'ギ');
  assert.equal(A.cipherText(enc('Zz', 1)), 'Aa');
  assert.equal(A.cipherText(enc('ABC', 27)), 'BCD');            // 英字は 26 で ひとまわり
  const t = enc('っ', 1)[0];
  assert.equal(A.charOf(t), 'て'); assert.ok(A.smallByStyle(t));  // 小さい て は無いので、紙では小さく描く
  assert.equal(A.cipherText(enc('ゃ', 1)), 'ゆ'.replace('ゆ', 'ゅ'));
  assert.equal(A.cipherText(enc('ー', 5)), 'ー');
});

test('往復: どの方式・種・ずらす数でも、暗号からもとの文が 1 字もちがわずに もどる', () => {
  for (const method of A.METHOD_KEYS) for (const msg of CORPUS) for (const seed of SEEDS.slice(0, 10)) for (const rev of [false, true]) {
    const key = 1 + (seed % A.KEY_MAX);
    const r = roundTrip({ method, msg, seed, key, rev });
    assert.equal(r.back, r.plain, `${method} seed=${seed} key=${key} rev=${rev} ${msg.slice(0, 10)}`);
  }
  for (let key = 1; key <= A.KEY_MAX; key++) {
    const r = roundTrip({ method: 'shift', msg: CORPUS[6], key });
    assert.equal(r.back, r.plain, `key=${key}`);
  }
});

test('往復（手で写した字から）: ずらし・いれかえ・たぬき・さかさ・ばんごう は cipherText → decodeText で もどる', () => {
  const msgs = ['たからは つくえの したに あるよ！', 'がっこう ぱん きゃべつ\nおおきな ー', 'Hello World', 'ぼくの なまえは けんた です'];
  for (const method of ['shift', 'subst', 'tanuki', 'rev', 'num']) for (const msg of msgs) for (const seed of SEEDS.slice(0, 8)) {
    const b = A.build({ method, msg, seed, key: 1 + (seed % 45) });
    if (b.cipher.some(A.smallByStyle)) continue;   // 小さくできない字（小さい て など）は字では写せない。紙のます目で小さく描く
    let want = A.detokenize(b.tokens);
    if (method === 'num') want = want.toUpperCase();   // ばんごうは 英字の大小を持たない
    assert.equal(A.decodeText(A.cipherText(b.cipher), b.key), want, `${method} ${seed} ${msg}`);
  }
});

test('ばんごう: あ＝1、ん＝46、A＝47、Z＝72。濁点は数のあと', () => {
  const b = A.build({ method: 'num', msg: 'あんAZが' });
  assert.deepEqual(b.cipher.map((t) => t.num), [1, 46, 47, 72, 6]);
  assert.equal(A.cipherText(b.cipher), '1 46 47 72 6゛');
  assert.equal(A.decodeText('1 46 ／ 6゛ 18小', b.key), 'あん がっ');
});

test('いれかえ表: 46 字・26 字の並べかえで、自分と同じ字にならない。種で決まる', () => {
  for (const seed of SEEDS) {
    const k = A.makeKey(A.normalize({ method: 'subst', seed }), []);
    assert.deepEqual([...k.kana].sort((a, b) => a - b), A.KANA.map((_, i) => i));
    assert.deepEqual([...k.alpha].sort((a, b) => a - b), A.ALPHA.map((_, i) => i));
    k.kana.forEach((v, i) => assert.notEqual(v, i));
    k.alpha.forEach((v, i) => assert.notEqual(v, i));
    assert.deepEqual(A.makeKey(A.normalize({ method: 'subst', seed }), []).kana, k.kana);
  }
  assert.notDeepEqual(A.makeKey(A.normalize({ method: 'subst', seed: 1 }), []).kana, A.makeKey(A.normalize({ method: 'subst', seed: 2 }), []).kana);
});

test('え・きごう: 72 個のマークはどれも ちがう絵で、かな・英字に重ならずに割り当てる', () => {
  const svgs = Array.from({ length: A.SYMBOLS }, (_, i) => S.symbolInner(i));
  assert.equal(new Set(svgs).size, A.SYMBOLS);
  svgs.forEach((s) => assert.ok(!/NaN|undefined/.test(s)));
  for (const seed of SEEDS) {
    const k = A.makeKey(A.normalize({ method: 'pict', seed }), []);
    assert.equal(new Set([...k.kana, ...k.alpha]).size, 72);
  }
});

test('たぬき: まぜる字は文に使っていない字（た が先）。ぬけば もどる。共有の かぎ だけでも同じ字', () => {
  assert.equal(A.build({ method: 'tanuki', msg: 'ありがとう' }).key.filler, 'た');
  const b = A.build({ method: 'tanuki', msg: 'だいすき', seed: 9 });   // だ（た＋゛）があるので た は使わない
  assert.notEqual(b.key.filler, 'た');
  const used = new Set(b.tokens.filter((t) => t.t === 'k').map((t) => t.i));
  assert.ok(!used.has(A.KANA.indexOf(b.key.filler)));
  assert.ok(b.cipher.length > b.tokens.length);
  const sh = A.decodeShare('#s=' + A.encodeShare(b.state, false));
  const kb = A.build(sh.state);
  assert.equal(kb.key.filler, b.key.filler);
  assert.equal(A.decodeText(A.cipherText(b.cipher), kb.key), 'だいすき');
});

test('さかさ: 行ごとに うしろから（改行の位置は同じ）', () => {
  const b = A.build({ method: 'rev', msg: 'あいう\nかき' });
  assert.equal(A.cipherText(b.cipher), 'ういあ\nきか');
});

test('共有リンク: 既定では文・だれへ・だれから・題を入れない。入れたときは往復する', () => {
  const s = A.normalize({ method: 'subst', msg: 'ひみつの ことば', to: 'はなこ', from: 'パパ', title: 'たから', seed: 777, hint: false });
  const raw = JSON.parse(C.b64uDecode(A.encodeShare(s, false)));
  assert.equal(raw.msg, undefined); assert.equal(raw.to, undefined); assert.equal(raw.fr, undefined); assert.equal(raw.ti, undefined);
  const k = A.decodeShare('#s=' + A.encodeShare(s, false));
  assert.equal(k.withMsg, false); assert.equal(k.state.msg, ''); assert.equal(k.state.seed, 777); assert.equal(k.state.hint, false);
  assert.deepEqual(A.build(k.state).key.kana, A.build(s).key.kana);          // 同じ いれかえ表
  const w = A.decodeShare('#s=' + A.encodeShare(s, true));
  assert.equal(w.withMsg, true); assert.equal(w.state.msg, s.msg); assert.equal(w.state.to, 'はなこ');
  assert.equal(w.state.pages.answer, false);                                   // 開いた人には 答えを出さない（選べば出る）
  assert.equal(A.decodeShare('#s=!!!'), null);
  assert.equal(A.decodeShare('#x=1'), null);
});

test('normalize: 既定値・範囲外・長さ', () => {
  const d = A.normalize(null);
  assert.equal(d.method, 'shift'); assert.equal(d.key, 3); assert.ok(d.pages.cipher && d.pages.tool && d.pages.answer);
  const s = A.normalize({ method: 'x', key: 99, seed: -1, msg: 'あ'.repeat(500), title: 'a'.repeat(99) });
  assert.equal(s.method, 'shift'); assert.equal(s.key, 3); assert.equal(s.seed, 0);
  assert.equal(Array.from(s.msg).length, A.MAX_LEN); assert.equal(s.title.length, 24);
  assert.equal(A.normalize({ key: 45 }).key, 45);
  assert.equal(A.normalize({ key: 0 }).key, 3);
});

test('紙: 方式ごとの枚数（ずらしは かな・英字で円盤 1 枚ずつ）、NaN なし、名前のエスケープ', () => {
  const count = (st) => S.sheetsHtml(A.build(st)).length;
  assert.equal(count({ method: 'shift', msg: 'あいう' }), 3);
  assert.equal(count({ method: 'shift', msg: 'あいう abc' }), 4);
  assert.equal(count({ method: 'shift', msg: 'abc' }), 3);
  for (const m of ['subst', 'pict', 'num', 'tanuki', 'rev']) assert.equal(count({ method: m, msg: 'あいう abc' }), 3);
  assert.equal(count({ method: 'subst', msg: '' }), 1);                       // 文がないときは 解読シートだけ
  assert.equal(count({ method: 'subst', msg: 'あ', pages: { cipher: false, tool: true, answer: false } }), 1);
  for (const method of A.METHOD_KEYS) {
    const html = S.sheetsHtml(A.build({ method, msg: CORPUS[2] + '\nABC', to: '<b>x', seed: 3 })).join('');
    assert.ok(!/NaN|undefined/.test(html), method);
    assert.ok(!html.includes('<b>x'), method);
  }
});

test('紙: 暗号文のページに答え（もとの文）は出ない。答えのページには出る', () => {
  const b = A.build({ method: 'subst', msg: 'ひみつきち', seed: 42 });
  const ciph = S.cipherSheet(b, false), ans = S.cipherSheet(b, true);
  assert.ok(!ciph.includes('ひみつきち'));
  assert.ok(!ciph.includes('class="af"'));
  assert.ok(ans.includes('ひみつきち'));
  assert.equal((ans.match(/class="af"/g) || []).length, 5);
});

test('紙: 200 字でも ます目が A4 に入る。円盤は 46 字・26 字', () => {
  const long = 'あいうえおかきくけこ'.repeat(20);
  const fit = S.fitSize(A.tokenize(long), 212);
  assert.ok(fit.rows * (fit.w * 2 + 3.2) <= 212);
  assert.ok(S.fitSize(A.tokenize('あいう'), 212).w === S.SIZES[0]);
  const wheels = S.toolSheets(A.build({ method: 'shift', msg: 'あ a', key: 5 }));
  assert.equal((wheels[0].match(/class="wt[ "]/g) || []).length, 46 * 2);
  assert.equal((wheels[1].match(/class="wt[ "]/g) || []).length, 26 * 2);
  assert.ok(wheels[0].includes('うちがわの「か」を、そとがわの「あ」に あわせる'));   // ずらし 5: あ→か
});
