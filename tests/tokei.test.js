// 時計の読み方（tokei/tokei.js。yorozu-plans 企画書 54・ROADMAP K35・ACCEPTANCE 3 章）のテスト
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../tokei/tokei.js');
const C = require('../calc.js');

test('時刻 ⇄ 分（12 時ちょうど＝0、1 周 720 分）', () => {
  assert.equal(K.toMin({ h: 12, m: 0 }), 0);
  assert.equal(K.toMin({ h: 3, m: 30 }), 210);
  assert.deepEqual(K.fromMin(0), { h: 12, m: 0 });
  assert.deepEqual(K.fromMin(719), { h: 11, m: 59 });
  assert.deepEqual(K.fromMin(-1), { h: 11, m: 59 });
  for (let T = 0; T < 720; T++) assert.equal(K.toMin(K.fromMin(T)), T);
});

test('読み方は学習プリントと同じ（ふん／ぷん）', () => {
  assert.equal(K.reading(K.toMin({ h: 3, m: 0 })), '3じ');
  assert.equal(K.reading(K.toMin({ h: 3, m: 1 })), '3じ1ぷん');
  assert.equal(K.reading(K.toMin({ h: 3, m: 2 })), '3じ2ふん');
  assert.equal(K.reading(K.toMin({ h: 3, m: 15 })), '3じ15ふん');
  assert.equal(K.reading(K.toMin({ h: 10, m: 30 })), '10じ30ぷん');
  assert.equal(K.reading(K.toMin({ h: 8, m: 46 })), '8じ46ぷん');
});

test('向き: 12 が 0 度、3 が 90 度（時計回り）', () => {
  assert.equal(K.angleOf(0, -1), 0);
  assert.equal(K.angleOf(1, 0), 90);
  assert.equal(K.angleOf(0, 1), 180);
  assert.equal(K.angleOf(-1, 0), 270);
});

test('長い針を回すと、12 をこえたところで短い針も 1 時間すすむ・もどる', () => {
  const t = (h, m) => K.toMin({ h, m });
  assert.equal(K.dragMinute(t(3, 50), 90, 5), t(3, 15) + 60);   // 3:50 → 3 の向き（15 分）へ右回り＝4:15
  assert.equal(K.dragMinute(t(3, 10), 330, 5), t(2, 55));        // 3:10 → 55 分へ左回り＝2:55
  assert.equal(K.dragMinute(t(3, 10), 120, 5), t(3, 20));        // 12 をこえない
  assert.equal(K.dragMinute(t(11, 55), 6, 1), t(12, 1));         // 11:55 → 12:01
  assert.equal(K.dragMinute(t(12, 2), 354, 1), t(11, 59));       // 12:02 → 11:59
  // きざみ: 5 分なら 5 の倍数、1 ぷんなら 1 分
  assert.equal(K.dragMinute(0, 14, 5) % 5, 0);
  assert.equal(K.dragMinute(0, 14, 1), 2);
  // 1 周回すと 1 時間すすむ（6 度ずつ右回り）
  let T = t(3, 0);
  for (let d = 6; d <= 360; d += 6) T = K.dragMinute(T, d % 360, 1);
  assert.equal(T, t(4, 0));
});

test('短い針を動かすと、長い針もいっしょに回る（短い針 30 度＝1 時間）', () => {
  assert.equal(K.dragHour(90, 5), K.toMin({ h: 3, m: 0 }));
  assert.equal(K.dragHour(105, 5), K.toMin({ h: 3, m: 30 }));
  assert.equal(K.dragHour(359.9, 5), 0);
  for (let deg = 0; deg < 360; deg += 7) {
    const T = K.dragHour(deg, 1), a = C.handAngles(K.fromMin(T));
    assert.ok(Math.abs(((a.hour - deg + 540) % 360) - 180) <= 0.5);
  }
});

test('どちらの針をつかんだか', () => {
  const T = K.toMin({ h: 3, m: 0 });         // 短い針 90 度・長い針 0 度
  assert.equal(K.grabHand(T, 92, 40), 'hour');
  assert.equal(K.grabHand(T, 92, 80), 'minute');   // 外がわは長い針
  assert.equal(K.grabHand(T, 5, 40), 'minute');
});

test('問題: きざみに合う時刻を 10 問（学習プリントと同じ作り方）', () => {
  for (const level of K.LEVELS) {
    for (let seed = 1; seed <= 20; seed++) {
      const qs = K.questions(level, seed);
      assert.equal(qs.length, K.QUESTIONS);
      qs.forEach((T) => assert.ok(C.clockFits(level, K.fromMin(T).m), `${level} ${T}`));
      const plain = C.genClock({ level }, seed, K.QUESTIONS).map(K.toMin);
      assert.deepEqual(qs, plain);
    }
  }
  // なんじ（12 通り）は 10 問で重ならない
  assert.equal(new Set(K.questions('hour', 7)).size, 10);
});

test('えらぶ答え: 4 つ、正しいのは 1 つ、重ならない、どれもきざみに合う', () => {
  for (const level of K.LEVELS) {
    for (let seed = 1; seed <= 30; seed++) {
      const rng = C.makeRng(seed, 900);
      for (const T of K.questions(level, seed)) {
        const ch = K.choices(T, level, rng);
        assert.equal(ch.length, 4, `${level} ${T}`);
        assert.equal(ch.filter((x) => K.isSame(x, T)).length, 1);
        assert.equal(new Set(ch).size, 4);
        ch.forEach((x) => assert.ok(C.clockFits(level, K.fromMin(x).m)));
        // 読みも 4 つちがう
        assert.equal(new Set(ch.map(K.reading)).size, 4);
      }
    }
  }
});

test('えらぶ答え: まちがえやすい読みが入る', () => {
  const rng = C.makeRng(1, 900);
  const T = K.toMin({ h: 2, m: 50 });
  const ch = K.choices(T, 'five', rng).map(K.reading);
  assert.ok(ch.includes('3じ50ぷん'));    // 短い針が 3 に近いので 1 時間すすめて読む
  const T2 = K.toMin({ h: 4, m: 15 });
  const ch2 = K.choices(T2, 'min', C.makeRng(2, 900)).map(K.reading);
  assert.ok(ch2.includes('3じ20ぷん'));   // 長い針と短い針の取りちがえ（短い針 4・長い針 3）
});

test('記録: いちばんよい点だけ残す。こわれた値は捨てる', () => {
  let r = K.normalizeRecords({ read: { half: 7, five: 99, min: 'x' }, set: null, zzz: 1 });
  assert.deepEqual(r, { read: { half: 7 }, set: {} });
  let x = K.recordScore(r, 'read', 'half', 6);
  assert.equal(x.best, false); assert.equal(x.records.read.half, 7);
  x = K.recordScore(r, 'read', 'half', 9);
  assert.equal(x.best, true); assert.equal(x.records.read.half, 9); assert.equal(x.prev, 7);
  x = K.recordScore(r, 'set', 'hour', 0);
  assert.equal(x.best, true); assert.equal(x.records.set.hour, 0);
  const s = K.normalizeSettings({ mode: 'zz', level: 'min', print: { mode: 'draw', answers: false } });
  assert.equal(s.mode, 'move'); assert.equal(s.level, 'min'); assert.equal(s.print.mode, 'draw'); assert.equal(s.print.answers, false); assert.equal(s.print.guide, true);
});

test('印刷: 1 枚に文字盤 12 こと、こたえ 12 こ（読む・針をかく）', () => {
  for (const mode of ['read', 'draw']) {
    for (const level of K.LEVELS) {
      const h = K.printSheet({ level, mode, guide: true, answers: true, credit: true, seed: 12345 });
      assert.equal((h.match(/<section /g) || []).length, 1);
      const [body, ans] = h.split('class="tk-ans"');
      assert.equal((body.match(/<svg class="clk"/g) || []).length, 12, `${mode} ${level}`);
      // 読む: 文字盤に針がある（12 こ×2 本）。針をかく: 文字盤に針がない
      assert.equal((body.match(/class="hand-[hm]"/g) || []).length, mode === 'read' ? 24 : 0);
      const items = C.genClock({ level }, 12345, 12);
      if (mode === 'read') items.forEach((t) => assert.ok(ans.includes('<span class="ans-fill">' + C.clockText(t) + '</span>')));
      else assert.equal((ans.match(/class="hand-[hm] hand-ans"/g) || []).length, 24);
      assert.ok(h.includes(C.CREDIT));
    }
  }
  const noAns = K.printSheet({ level: 'half', mode: 'read', guide: false, answers: false, credit: false, seed: 1 });
  assert.ok(!noAns.includes('tk-ans'));
  assert.ok(!noAns.includes(C.CREDIT));
  assert.ok(!noAns.includes('class="gnum"'));
});

// 遊ぶ画面（anki/・tokei/）: AdSense は meta だけ（script なし）、外部リンクなし（REVIEW C7 R7）、使い方ページの確認日は constants.js と同じ
const fs = require('node:fs');
const path = require('node:path');
const K2 = require('../constants.js');
for (const dir of ['anki', 'tokei']) {
  test(`${dir}/index.html: 広告の script なし・外部リンクなし`, () => {
    const html = fs.readFileSync(path.join(__dirname, '..', dir, 'index.html'), 'utf8');
    assert.ok(html.includes('<meta name="google-adsense-account"'));
    assert.ok(!/adsbygoogle\.js/.test(html));
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    const ext = hrefs.filter((h) => /^(https?:)?\/\//.test(h) && !h.startsWith('https://yorozu-craft.com/'));
    assert.deepEqual(ext, []);
  });
}
test('使い方ページの最終確認日が constants.js の checked と同じ', () => {
  const a = fs.readFileSync(path.join(__dirname, '..', 'anki', 'guide.html'), 'utf8');
  const t = fs.readFileSync(path.join(__dirname, '..', 'tokei', 'guide.html'), 'utf8');
  assert.ok(a.includes('最終確認日 ' + K2.ankiCard.checked));
  assert.ok(a.includes(K2.ankiCard.url));
  assert.ok(a.includes(K2.ankiCard.value.h + '×' + K2.ankiCard.value.w + 'mm'));
  assert.ok(t.includes('最終確認日 ' + K2.tokeiCurriculum.checked));
  assert.ok(t.includes(K2.tokeiCurriculum.url));
});
