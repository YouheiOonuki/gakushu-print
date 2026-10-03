// 丸つけカメラ（企画書 71・K86）: 印の符号・並び・紙の見つけ方・数字の読み取り
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const C = require('../calc.js');
const M = require('../mark.js');
const S = require('../sheets.js');
const V = require('../marutsuke/vision.js');
const D = require('../marutsuke/digits.js');

const arith = (o, seed) => C.normalizeState({ type: 'arith', seed: seed == null ? 123 : seed, common: { mark: true }, arith: o });
const kuku = (o, seed) => C.normalizeState({ type: 'kuku', seed: seed == null ? 9 : seed, common: { mark: true }, kuku: o });

test('符号: すべての設定と種・ページで、書いて読むと同じ設定に戻る', () => {
  let n = 0;
  for (const op of ['add', 'sub', 'mix']) for (const level of ['d1', 'teen', 'd2d1', 'd2d2', 'd3d2', 'd3d3']) for (const carry of ['none', 'with', 'any']) for (const count of [10, 20, 30]) {
    const s = arith({ op, level, carry, count }, (n * 2654435761) >>> 0);
    const page = n % 10;
    const d = M.decode(M.encode(s, page));
    assert.ok(d, `${op} ${level} ${carry} ${count}`);
    assert.equal(d.page, page);
    assert.equal(d.state.seed, s.seed);
    for (const k of ['op', 'level', 'carry', 'count']) assert.equal(d.state.arith[k], s.arith[k]);
    n++;
  }
  for (const order of ['seq', 'rev', 'random']) for (const count of [20, 30]) for (const dans of [[1], [2, 5], [1, 2, 3, 4, 5, 6, 7, 8, 9], [9]]) {
    const s = kuku({ dans, order, count }, 4294967295);
    const d = M.decode(M.encode(s, 3));
    assert.deepEqual(d.state.kuku.dans, dans);
    assert.equal(d.state.kuku.order, order);
    assert.equal(d.state.kuku.count, count);
    assert.equal(d.state.seed, 4294967295);
  }
  assert.equal(M.CODE_BITS, 68);
});

test('符号: 1 ますでも読みちがえたら（どの位置の 1 bit・2 bit の反転も）null', () => {
  const b = M.encode(arith({ op: 'mix', level: 'd3d3', count: 30 }, 987654321), 4);
  for (let i = 0; i < b.length; i++) {
    const c = b.slice(); c[i] ^= 1;
    assert.equal(M.decode(c), null, `bit ${i}`);
    for (let j = i + 1; j < b.length; j += 7) { const e = c.slice(); e[j] ^= 1; assert.equal(M.decode(e), null, `bits ${i},${j}`); }
  }
  assert.equal(M.decode(new Array(68).fill(0)), null);
  assert.equal(M.decode(new Array(68).fill(1)), null);
});

test('作り直し: 符号から作った問題が、印刷したプリントの問題と同じ（どのページでも）', () => {
  for (const s of [arith({ op: 'mix', level: 'd2d2', count: 20 }, 55), arith({ op: 'sub', level: 'teen', carry: 'with', count: 30 }, 1), kuku({ dans: [3, 7], order: 'random', count: 20 }, 77), kuku({ dans: [2, 3, 4], order: 'rev', count: 20 })]) {
    const t = s.type;
    s[t].pages = 3;
    const wb = C.buildWorkbook(s, {}, 'ja');
    wb.pages.forEach((p, i) => {
      const re = M.problemsOf(M.decode(M.encode(s, i)));
      assert.deepEqual(re.map((x) => [x.a, x.op, x.b, x.answer]), p.items.map((x) => [x.a, x.op, x.b, C.answerOf(x)]));
    });
  }
});

// 2026-10-03 の calc.js で作った値を写したもの
test('作り直し: 問題の作り方が変わっていない（印刷ずみの紙を後から読むため。変えるなら mark.js の VERSION を上げる）', () => {
  const p = M.problemsOf(M.decode(M.encode(arith({ op: 'mix', level: 'd2d2', count: 10 }, 20261003), 1)));
  assert.deepEqual(p.map((x) => `${x.a}${x.op}${x.b}=${x.answer}`), ['57+30=87', '77+18=95', '71-49=22', '60-48=12', '78-20=58', '47+16=63', '58-35=23', '42+10=52', '37-13=24', '14+81=95']);
  const k = M.problemsOf(M.decode(M.encode(kuku({ dans: [6, 7], order: 'random', count: 20 }, 42), 0)));
  assert.deepEqual(k.slice(0, 8).map((x) => `${x.a}×${x.b}`), ['6×5', '6×3', '6×7', '6×9', '7×3', '6×4', '7×2', '7×1']);
});

test('印を入れられるのは よこの たし算・ひき算と九九で、入れたい問題がないときだけ', () => {
  assert.equal(M.applicable(arith({ style: 'yoko' })).ok, true);
  assert.equal(M.applicable(arith({ style: 'tate' })).reason, 'tate');
  assert.equal(M.applicable(arith({ custom: '7+8' })).reason, 'custom');
  assert.equal(M.applicable(arith({ custom: 'こんにちは' })).ok, true, '読めない行だけなら、作った問題だけになるので入れられる');
  assert.equal(M.applicable(kuku({ custom: '6×7' })).reason, 'custom');
  assert.equal(M.applicable(C.normalizeState({ type: 'clock' })).reason, 'type');
});

test('答えのますの数は、その設定でいちばん大きい答えの桁数', () => {
  const d = (op, level) => M.answerDigits(arith({ op, level }));
  assert.equal(d('add', 'd1'), 2); assert.equal(d('sub', 'd1'), 1); assert.equal(d('add', 'd3d3'), 4); assert.equal(d('sub', 'd3d3'), 3);
  assert.equal(d('mix', 'd2d1'), 3); assert.equal(d('sub', 'teen'), 2);
  assert.equal(M.answerDigits(kuku({})), 2);
  // どの問題の答えも、ますに入る
  for (const op of ['add', 'sub', 'mix']) for (const level of ['d1', 'teen', 'd2d1', 'd2d2', 'd3d2', 'd3d3']) {
    const s = arith({ op, level, count: 30 }, 3); s.arith.pages = 10;
    const max = Math.max(...C.buildWorkbook(s, {}, 'ja').pages.flatMap((p) => p.items.map(C.answerOf)));
    assert.ok(String(max).length <= M.answerDigits(s));
  }
});

test('並び: ますは問題の範囲・紙の中にあり、重ならず、印と帯にかからない', () => {
  const boxes = [[M.CODE.x - 1, M.CODE.y - 1, M.CODE.cols * M.CODE.cw + 2, M.CODE.rows * M.CODE.ch + 2]];
  M.MARKER.centers.forEach(([x, y]) => boxes.push([x - M.MARKER.size / 2 - 1, y - M.MARKER.size / 2 - 1, M.MARKER.size + 2, M.MARKER.size + 2]));
  const hit = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
  for (const count of [10, 18, 20, 30]) for (const digits of [1, 2, 3, 4]) {
    const items = Array.from({ length: count }, () => ({ a: 999, b: 999, op: '+' }));
    const L = M.layout(count, digits, items);
    const cells = L.items.flatMap((it) => it.cells.map((c) => [c.x, c.y, c.s, c.s]));
    cells.forEach((c, i) => {
      assert.ok(c[0] >= 10 && c[0] + c[2] <= 200 && c[1] >= M.AREA.top && c[1] + c[3] <= M.AREA.bottom, `cell ${i}`);
      boxes.forEach((b) => assert.ok(!hit(c, b)));
      for (let j = i + 1; j < cells.length; j++) assert.ok(!hit([c[0] + 0.01, c[1] + 0.01, c[2] - 0.02, c[3] - 0.02], cells[j]), `cells ${i} ${j}`);
    });
    assert.ok(L.cell >= 10, `ますは 10mm 以上（${count} 問・${digits} けた: ${L.cell}）`);
    assert.ok(L.fontPt >= 13, `式の字は 13pt 以上（${count} 問・${digits} けた: ${L.fontPt}）`);
  }
});

test('紙: 印を入れると、問題のページに印と帯、答えのページには印なし・ますに赤い答え', () => {
  const s = arith({ op: 'add', level: 'd2d2', count: 20 }, 31);
  const r = S.render(C.buildWorkbook(s, {}, 'ja'), s, 'ja');
  assert.equal(r.marked, true);
  const pages = r.html.split('<section').slice(1);
  assert.equal(pages.length, 2);
  assert.match(pages[0], /data-mark="1"/); assert.match(pages[0], /class="mk-svg"/);
  assert.equal((pages[0].match(/class="mk-cell"/g) || []).length, 20 * 3);
  assert.doesNotMatch(pages[1], /mk-svg/);
  assert.equal((pages[1].match(/ans-fill/g) || []).length, C.buildWorkbook(s, {}, 'ja').pages[0].items.map(C.answerOf).join('').length);
  // 印を外す・筆算・入れたい問題・英語では、前と同じ紙
  for (const t of [Object.assign({}, s, { common: Object.assign({}, s.common, { mark: false }) }), arith({ style: 'tate' }), arith({ custom: '7+8' })]) {
    const x = S.render(C.buildWorkbook(t, {}, 'ja'), t, 'ja');
    assert.equal(x.marked, false); assert.doesNotMatch(x.html, /sheet-mark/);
  }
  assert.equal(S.render(C.buildWorkbook(s, {}, 'en'), s, 'en').marked, false);
});

test('設定: mark は既定で切、共有リンクで行き来する', () => {
  assert.equal(C.normalizeState({}).common.mark, false);
  const s = arith({});
  assert.equal(C.decodeShare('#s=' + C.encodeShare(s)).common.mark, true);
});

// --- 紙を見つける（写真の代わりに、紙の印と帯を画素に描いたもの） ---
function rasterize(bits, H, w, h, extra) {
  // 写真の画素 → 紙の mm（H の逆）で、印・帯・枠のどれかの黒なら 30、そうでなければ 235
  const inv = V.homography(...H);
  const g = new Float32Array(w * h);
  const u = M.MARKER.size / 7;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [mx, my] = V.apply(inv, x + 0.5, y + 0.5);
    let dark = false;
    if (mx >= 0 && my >= 0 && mx <= 210 && my <= 297) {
      for (const [cx, cy] of M.MARKER.centers) {
        const dx = Math.abs(mx - cx), dy = Math.abs(my - cy), m = Math.max(dx, dy);
        if (m <= 3.5 * u && (m > 2.5 * u || m <= 1.5 * u)) dark = true;
      }
      const ci = Math.floor((mx - M.CODE.x) / M.CODE.cw), ri = Math.floor((my - M.CODE.y) / M.CODE.ch);
      if (ci >= 0 && ci < M.CODE.cols && ri >= 0 && ri < M.CODE.rows && bits[ri * M.CODE.cols + ci]) dark = true;
      if (extra && extra(mx, my)) dark = true;
      g[y * w + x] = dark ? 30 : 235 - 40 * (x / w);   // 右へ少し暗く（影）
    } else g[y * w + x] = 120;
  }
  return { g, w, h };
}

test('紙を見つける: 回転・逆さ・ゆがみがあっても、帯から同じ設定とページを読む', () => {
  const s = kuku({ dans: [4, 8], order: 'random', count: 30 }, 31337);
  const bits = M.encode(s, 2);
  const W = 600, Hh = 800;
  const cases = [
    [[0, 0], [210, 0], [210, 297], [0, 297]].map(([x, y]) => [x * 2.4 + 40, y * 2.4 + 30]),          // まっすぐ
    [[0, 0], [210, 0], [210, 297], [0, 297]].map(([x, y]) => [560 - x * 2.4, 770 - y * 2.4]),        // 逆さ
    [[60, 80], [520, 40], [560, 760], [30, 700]],                                                      // ゆがみ
  ];
  for (const dst of cases) {
    const img = rasterize(bits, [dst, [[0, 0], [210, 0], [210, 297], [0, 297]]], W, Hh);
    const loc = V.locate(img);
    assert.ok(loc.ok, JSON.stringify(loc.reason));
    assert.equal(loc.decoded.page, 2);
    assert.equal(loc.decoded.state.seed, 31337);
    assert.deepEqual(loc.decoded.state.kuku.dans, [4, 8]);
    // 紙の mm → 画素 が合っている（左下の印の中心）
    const p = V.apply(loc.H, 13, 284), q = V.apply(V.homography([[0, 0], [210, 0], [210, 297], [0, 297]], dst), 13, 284);
    assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1]) < 2.5, `${p} ${q}`);
  }
});

test('紙を見つける: 印のない写真・帯のない紙は「見つからない」と言う（まちがった丸つけをしない）', () => {
  const blank = { g: new Float32Array(400 * 500).fill(230), w: 400, h: 500 };
  assert.equal(V.locate(blank).ok, false);
  const dst = [[30, 30], [370, 30], [370, 470], [30, 470]];
  const noCode = rasterize(new Array(68).fill(0), [dst, [[0, 0], [210, 0], [210, 297], [0, 297]]], 400, 500);
  const r = V.locate(noCode);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'code');
});

// --- 数字を読む ---
const model = D.makeModel(JSON.parse(fs.readFileSync(path.join(__dirname, '../marutsuke/digits-model.json'), 'utf8')));
const mn = zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'marutsuke/mnist-t10k-8000-9999.bin.gz')));

test('数字のモデル: 重みの形と大きさ（約 2.3 万バイト）', () => {
  const j = JSON.parse(fs.readFileSync(path.join(__dirname, '../marutsuke/digits-model.json'), 'utf8'));
  assert.equal(j.format, 'yorozu-digits-1');
  assert.deepEqual(j.layers['c1.weight'].shape, [16, 1, 3, 3]);
  assert.deepEqual(j.layers['fc.weight'].shape, [10, 288]);
  assert.ok(fs.statSync(path.join(__dirname, '../marutsuke/digits-model.json')).size < 40000);
  assert.match(j.license, /CC BY-SA 3\.0/);
});

test('数字のモデル: 学習に使っていない MNIST の 2,000 字で 98% 以上', () => {
  let ok = 0;
  for (let i = 0; i < 2000; i++) {
    const a = new Float32Array(784);
    let mx = 0;
    for (let j = 0; j < 784; j++) { a[j] = mn[2000 + i * 784 + j] / 255; if (a[j] > mx) mx = a[j]; }
    for (let j = 0; j < 784; j++) a[j] /= mx;
    if (model.classify(a).digit === mn[i]) ok++;
  }
  assert.ok(ok / 2000 >= 0.98, String(ok / 2000));
});

test('ますの切り出し: 空のますは空、枠の線だけでも空、字があれば MNIST の形にして読む', () => {
  const H = V.homography([[0, 0], [10, 0], [10, 10], [0, 10]], [[0, 0], [100, 0], [100, 100], [0, 100]]);   // 1mm = 10px
  const cell = { x: 0, y: 0, s: 10 };
  const paper = () => ({ g: new Float32Array(100 * 100).fill(225), w: 100, h: 100 });
  const a = paper();
  assert.equal(V.cellImage(a, H, cell).empty, true);
  // 枠（ずれて内側に入った線）
  for (let i = 0; i < 100; i++) for (let t = 10; t < 13; t++) { a.g[t * 100 + i] = 60; a.g[i * 100 + t] = 60; }
  assert.equal(V.cellImage(a, H, cell).empty, true, '枠の線は字ではない');
  // MNIST の「7」を 3 倍にして書く
  const b = paper(), idx = Array.from(mn.subarray(0, 2000)).indexOf(7);
  for (let y = 0; y < 84; y++) for (let x = 0; x < 84; x++) {
    const v = mn[2000 + idx * 784 + Math.floor(y / 3) * 28 + Math.floor(x / 3)];
    b.g[(y + 8) * 100 + x + 8] = 225 - v * 0.7;
  }
  const r = V.cellImage(b, H, cell);
  assert.equal(r.empty, false);
  assert.equal(model.classify(r.img28).digit, 7);
});
