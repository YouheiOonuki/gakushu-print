// ===========================
// 丸つけカメラ — 写真から紙を見つけて、答えのますを読む（企画書 71・K86）
// 画像はこの端末の中だけで処理する（送信しない）。ライブラリなし。純粋関数（DOM に触らない）
//
//  1. 灰色にして、まわりより暗い所を黒にする（影があっても読めるよう、近くの平均と比べる）
//  2. 黒のかたまりから、四すみの位置合わせ印（四角の中に四角）を探す
//  3. 印 4 つの組と向き（8 通り）を試し、「しるしの帯」の CRC が合うものを紙とする（逆さ・横向きでも読める）
//  4. 紙の mm → 写真の画素 の射影変換で、答えのますを 1 つずつ切り出して数字を読む
//
// ブラウザでは window.Vision、Node（テスト）では module.exports
// ===========================
(function (root) {
  'use strict';

  var Mark = root.Mark || (typeof require !== 'undefined' ? require('../mark.js') : null);

  /** RGBA → 灰色（0〜255 の Float32Array） */
  function toGray(rgba, w, h) {
    var g = new Float32Array(w * h);
    for (var i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
    return g;
  }

  /** 縮小（面積の平均）。f は整数の倍率 */
  function shrink(g, w, h, f) {
    var w2 = Math.floor(w / f), h2 = Math.floor(h / f), out = new Float32Array(w2 * h2);
    for (var y = 0; y < h2; y++) for (var x = 0; x < w2; x++) {
      var s = 0;
      for (var dy = 0; dy < f; dy++) { var row = (y * f + dy) * w + x * f; for (var dx = 0; dx < f; dx++) s += g[row + dx]; }
      out[y * w2 + x] = s / (f * f);
    }
    return { g: out, w: w2, h: h2 };
  }

  /** 近くの平均より k 倍以上暗い所を 1 にする（積分画像） */
  function adaptiveBinary(g, w, h, r, k) {
    var I = new Float64Array((w + 1) * (h + 1));
    for (var y = 0; y < h; y++) {
      var s = 0;
      for (var x = 0; x < w; x++) { s += g[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + s; }
    }
    var b = new Uint8Array(w * h);
    for (var yy = 0; yy < h; yy++) {
      var y0 = Math.max(0, yy - r), y1 = Math.min(h, yy + r + 1);
      for (var xx = 0; xx < w; xx++) {
        var x0 = Math.max(0, xx - r), x1 = Math.min(w, xx + r + 1);
        var sum = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
        var mean = sum / ((y1 - y0) * (x1 - x0));
        b[yy * w + xx] = g[yy * w + xx] < mean * k ? 1 : 0;
      }
    }
    return b;
  }

  /** 4 近傍のかたまり。それぞれの外接四角・画素数・重心 */
  function components(b, w, h) {
    var lab = new Int32Array(w * h), comps = [], stack = new Int32Array(w * h);
    for (var i = 0; i < w * h; i++) {
      if (!b[i] || lab[i]) continue;
      var id = comps.length + 1, sp = 0, n = 0, sx = 0, sy = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
      stack[sp++] = i; lab[i] = id;
      while (sp) {
        var p = stack[--sp], x = p % w, y = (p - x) / w;
        n++; sx += x; sy += y;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && b[p - 1] && !lab[p - 1]) { lab[p - 1] = id; stack[sp++] = p - 1; }
        if (x < w - 1 && b[p + 1] && !lab[p + 1]) { lab[p + 1] = id; stack[sp++] = p + 1; }
        if (y > 0 && b[p - w] && !lab[p - w]) { lab[p - w] = id; stack[sp++] = p - w; }
        if (y < h - 1 && b[p + w] && !lab[p + w]) { lab[p + w] = id; stack[sp++] = p + w; }
      }
      comps.push({ id: id, n: n, cx: sx / n, cy: sy / n, x0: x0, y0: y0, x1: x1, y1: y1, bw: x1 - x0 + 1, bh: y1 - y0 + 1 });
    }
    return { lab: lab, comps: comps };
  }

  /** 位置合わせ印の候補（外の黒い枠の中に、まん中の黒い四角がある） */
  function findMarkers(g, w, h) {
    var r = Math.max(6, Math.round(Math.min(w, h) / 22));
    var b = adaptiveBinary(g, w, h, r, 0.8);
    var cc = components(b, w, h).comps;
    var minSide = Math.max(6, Math.min(w, h) / 120), maxSide = Math.min(w, h) / 4;
    var big = [], small = [];
    cc.forEach(function (c) {
      var side = Math.max(c.bw, c.bh), asp = c.bw / c.bh, fill = c.n / (c.bw * c.bh);
      if (asp < 0.5 || asp > 2) return;
      if (side >= minSide && side <= maxSide && fill > 0.25 && fill < 0.75) big.push(c);
      if (side >= 3 && fill > 0.5) small.push(c);
    });
    var out = [];
    big.forEach(function (o) {
      var ox = (o.x0 + o.x1) / 2, oy = (o.y0 + o.y1) / 2, side = Math.max(o.bw, o.bh);
      // 外の枠の重心は外接四角のまん中に近い（中が空いた四角）
      if (Math.hypot(o.cx - ox, o.cy - oy) > side * 0.15) return;
      for (var i = 0; i < small.length; i++) {
        var s = small[i];
        if (s.id === o.id) continue;
        var ss = Math.max(s.bw, s.bh) / side;
        if (ss < 0.22 || ss > 0.62) continue;
        if (Math.hypot(s.cx - ox, s.cy - oy) > side * 0.12) continue;
        // 中の四角の重心と、枠の重心の平均を印の中心とする
        out.push({ x: (s.cx * s.n + o.cx * o.n) / (s.n + o.n), y: (s.cy * s.n + o.cy * o.n) / (s.n + o.n), size: side });
        break;
      }
    });
    return out;
  }

  // ---------------------------------------------------------------
  // 射影変換（4 点の対応から 3×3 を解く）
  // ---------------------------------------------------------------
  function solve(A, bv) {
    var n = bv.length, M = A.map(function (row, i) { return row.concat([bv[i]]); });
    for (var c = 0; c < n; c++) {
      var piv = c;
      for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      if (Math.abs(M[piv][c]) < 1e-12) return null;
      var t = M[c]; M[c] = M[piv]; M[piv] = t;
      for (var r2 = 0; r2 < n; r2++) {
        if (r2 === c) continue;
        var f = M[r2][c] / M[c][c];
        for (var k = c; k <= n; k++) M[r2][k] -= f * M[c][k];
      }
    }
    return M.map(function (row, i) { return row[n] / row[i]; });
  }
  /** src[i] → dst[i]（各 [x,y]、4 点）の変換 */
  function homography(src, dst) {
    var A = [], bv = [];
    for (var i = 0; i < 4; i++) {
      var x = src[i][0], y = src[i][1], u = dst[i][0], v = dst[i][1];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); bv.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); bv.push(v);
    }
    var hv = solve(A, bv);
    return hv ? hv.concat([1]) : null;
  }
  function apply(H, x, y) {
    var d = H[6] * x + H[7] * y + H[8];
    return [(H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d];
  }
  function sample(g, w, h, x, y) {
    if (x < 0 || y < 0 || x > w - 1.001 || y > h - 1.001) return 255;
    var x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, i = y0 * w + x0;
    return g[i] * (1 - fx) * (1 - fy) + g[i + 1] * fx * (1 - fy) + g[i + w] * (1 - fx) * fy + g[i + w + 1] * fx * fy;
  }
  /** 紙の (mm) のまわり rad mm を 3×3 点で平均 */
  function sampleMm(img, H, mx, my, rad) {
    var s = 0;
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      var p = apply(H, mx + dx * rad, my + dy * rad);
      s += sample(img.g, img.w, img.h, p[0], p[1]);
    }
    return s / 9;
  }

  /** しるしの帯を読む（0/1 の並び） */
  function readCode(img, H) {
    var C = Mark.CODE, M = Mark.MARKER, u = M.size / 7;
    var black = 0;
    M.centers.forEach(function (c) { black += sampleMm(img, H, c[0], c[1], u * 0.5); });
    black /= 4;
    var bits = [];
    for (var i = 0; i < Mark.CODE_BITS; i++) {
      var p = Mark.codeCellCenter(i), col = i % C.cols;
      var cx = C.x + (col + 0.5) * C.cw;
      var white = Math.max(sampleMm(img, H, cx, C.y - 1.6, 0.3), sampleMm(img, H, cx, C.y + C.rows * C.ch + 1.6, 0.3));
      var v = sampleMm(img, H, p[0], p[1], Math.min(C.cw, C.ch) * 0.2);
      bits.push(v < (white + black) / 2 ? 1 : 0);
    }
    return bits;
  }

  function convexOrder(pts) {
    var cx = 0, cy = 0;
    pts.forEach(function (p) { cx += p.x / 4; cy += p.y / 4; });
    return pts.slice().sort(function (a, b) { return Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx); });
  }
  function area4(q) {
    var s = 0;
    for (var i = 0; i < 4; i++) { var a = q[i], b = q[(i + 1) % 4]; s += a.x * b.y - b.x * a.y; }
    return Math.abs(s) / 2;
  }

  /**
   * 写真から紙を見つけて符号を読む。
   * @param {{g:Float32Array,w:number,h:number}} img 灰色の写真（長い辺 2,400px 程度まで）
   * @returns {{ok:true, H:number[], decoded:object, markers:object[]}|{ok:false, reason:string, markers:object[]}}
   */
  function locate(img) {
    var f = Math.max(1, Math.round(Math.max(img.w, img.h) / 1200));
    var small = f > 1 ? shrink(img.g, img.w, img.h, f) : img;
    var cand = findMarkers(small.g, small.w, small.h).map(function (m) { return { x: m.x * f + (f - 1) / 2, y: m.y * f + (f - 1) / 2, size: m.size * f }; });
    if (cand.length < 4) return { ok: false, reason: 'markers', markers: cand };
    cand.sort(function (a, b) { return b.size - a.size; });
    cand = cand.slice(0, 10);
    var dst = Mark.MARKER.centers;
    var combos = [];
    for (var a = 0; a < cand.length; a++) for (var b = a + 1; b < cand.length; b++) for (var c = b + 1; c < cand.length; c++) for (var d = c + 1; d < cand.length; d++) {
      var q = convexOrder([cand[a], cand[b], cand[c], cand[d]]);
      var sizes = q.map(function (p) { return p.size; });
      if (Math.max.apply(null, sizes) > Math.min.apply(null, sizes) * 2.5) continue;
      combos.push({ q: q, area: area4(q) });
    }
    combos.sort(function (x, y) { return y.area - x.area; });
    for (var k = 0; k < combos.length && k < 60; k++) {
      var q2 = combos[k].q;
      for (var rot = 0; rot < 4; rot++) for (var mir = 0; mir < 2; mir++) {
        var src = [];
        for (var i = 0; i < 4; i++) { var p = q2[mir ? (rot - i + 8) % 4 : (rot + i) % 4]; src.push([p.x, p.y]); }
        var H = homography(dst, src);
        if (!H) continue;
        var dec = Mark.decode(readCode(img, H));
        if (dec) return { ok: true, H: H, decoded: dec, markers: q2 };
      }
    }
    return { ok: false, reason: 'code', markers: cand };
  }

  // ---------------------------------------------------------------
  // 答えのます 1 つを読む
  // ---------------------------------------------------------------
  var S = 48;   // ますの中を S×S 点で取る

  /**
   * @returns {{empty:boolean, img28?:Float32Array, ink:number}}
   */
  function cellImage(img, H, cell) {
    var inset = Math.max(1.0, cell.s * 0.1);
    var x0 = cell.x + inset, y0 = cell.y + inset, side = cell.s - 2 * inset;
    var v = new Float32Array(S * S);
    for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
      var p = apply(H, x0 + (x + 0.5) * side / S, y0 + (y + 0.5) * side / S);
      v[y * S + x] = sample(img.g, img.w, img.h, p[0], p[1]);
    }
    // 紙の明るさ（ますの中の明るい方から 80% の所）と、インクの濃さ 0〜1
    var sorted = Array.prototype.slice.call(v).sort(function (a, b) { return a - b; });
    var white = sorted[Math.floor(S * S * 0.8)];
    var ink = new Float32Array(S * S), bin = new Uint8Array(S * S);
    for (var i = 0; i < ink.length; i++) {
      var t = (white - v[i]) / Math.max(30, white * 0.55);
      ink[i] = t < 0 ? 0 : t > 1 ? 1 : t;
      bin[i] = ink[i] > 0.35 ? 1 : 0;
    }
    // ますの枠が入りこんだ行・列（端の 15% にある、ほぼ一直線の黒）を消す
    var band = Math.round(S * 0.15);
    for (var r = 0; r < S; r++) {
      if (r >= band && r < S - band) continue;
      var nr = 0, nc = 0;
      for (var c = 0; c < S; c++) { nr += bin[r * S + c]; nc += bin[c * S + r]; }
      if (nr > S * 0.6) for (var c2 = 0; c2 < S; c2++) { bin[r * S + c2] = 0; ink[r * S + c2] = 0; }
      if (nc > S * 0.6) for (var c3 = 0; c3 < S; c3++) { bin[c3 * S + r] = 0; ink[c3 * S + r] = 0; }
    }
    var cc = components(bin, S, S);
    var keep = {}, total = 0;
    cc.comps.forEach(function (c) {
      if (c.n < S * S * 0.006) return;                 // 点・ごみ
      var edge = c.x0 === 0 || c.y0 === 0 || c.x1 === S - 1 || c.y1 === S - 1;
      if (edge && ((c.bw > S * 0.6 && c.bh < S * 0.14) || (c.bh > S * 0.6 && c.bw < S * 0.14))) return;   // 枠の残り
      if (edge && c.n < S * S * 0.02 && Math.min(c.cx, c.cy, S - 1 - c.cx, S - 1 - c.cy) < S * 0.08) return;  // 端の小さなかけら
      keep[c.id] = true; total += c.n;
    });
    if (total < S * S * 0.018) return { empty: true, ink: total / (S * S) };
    // 残したかたまりだけのインク。外接四角
    var bx0 = S, by0 = S, bx1 = -1, by1 = -1;
    var m = new Float32Array(S * S);
    for (var j = 0; j < S * S; j++) {
      var id = cc.lab[j];
      // かたまりの周り 1 点のうすいインク（ふちのぼかし）も入れる
      var on = (id && keep[id]);
      if (!on && ink[j] > 0.05) {
        var x = j % S, y2 = (j - x) / S;
        for (var dy = -1; dy <= 1 && !on; dy++) for (var dx = -1; dx <= 1 && !on; dx++) {
          var xx = x + dx, yy = y2 + dy;
          if (xx >= 0 && yy >= 0 && xx < S && yy < S && keep[cc.lab[yy * S + xx]]) on = true;
        }
      }
      if (!on) continue;
      m[j] = ink[j];
      var px = j % S, py = (j - px) / S;
      if (px < bx0) bx0 = px; if (px > bx1) bx1 = px; if (py < by0) by0 = py; if (py > by1) by1 = py;
    }
    return { empty: false, ink: total / (S * S), img28: toMnist(m, S, bx0, by0, bx1, by1) };
  }

  /** MNIST と同じ形に: 外接四角を縦横比のまま 20×20 に収め、28×28 の重心をまん中に。いちばん濃い所を 1 に */
  function toMnist(m, n, x0, y0, x1, y1) {
    var bw = x1 - x0 + 1, bh = y1 - y0 + 1, sc = 20 / Math.max(bw, bh);
    var tw = Math.max(1, Math.round(bw * sc)), th = Math.max(1, Math.round(bh * sc));
    var small = new Float32Array(tw * th);
    // 面積の平均で縮める（拡大のときは最近傍の平均になる）
    for (var y = 0; y < th; y++) for (var x = 0; x < tw; x++) {
      var sx0 = x0 + x / sc, sx1 = x0 + (x + 1) / sc, sy0 = y0 + y / sc, sy1 = y0 + (y + 1) / sc;
      var s = 0, a = 0;
      for (var yy = Math.floor(sy0); yy < Math.ceil(sy1); yy++) for (var xx = Math.floor(sx0); xx < Math.ceil(sx1); xx++) {
        var wy = Math.min(yy + 1, sy1) - Math.max(yy, sy0), wx = Math.min(xx + 1, sx1) - Math.max(xx, sx0);
        if (wy <= 0 || wx <= 0) continue;
        s += m[yy * n + xx] * wx * wy; a += wx * wy;
      }
      small[y * tw + x] = a ? s / a : 0;
    }
    var mx = 0, cx = 0, cy = 0, tot = 0;
    for (var i = 0; i < small.length; i++) { var px = i % tw, py = (i - px) / tw; cx += px * small[i]; cy += py * small[i]; tot += small[i]; if (small[i] > mx) mx = small[i]; }
    cx = tot ? cx / tot : tw / 2; cy = tot ? cy / tot : th / 2;
    var ox = Math.round(13.5 - cx), oy = Math.round(13.5 - cy);
    var out = new Float32Array(784);
    for (var j = 0; j < small.length; j++) {
      var qx = j % tw + ox, qy = Math.floor(j / tw) + oy;
      if (qx >= 0 && qy >= 0 && qx < 28 && qy < 28) out[qy * 28 + qx] = small[j] / (mx || 1);
    }
    return out;
  }

  /**
   * 写真 1 枚を丸つけする。
   * @param img 灰色の写真 {g,w,h}
   * @param model Digits.makeModel の返り値
   * @returns {{ok:boolean, reason?:string, H?:number[], decoded?:object, results?:object[], layout?:object}}
   */
  function grade(img, model) {
    var loc = locate(img);
    if (!loc.ok) return loc;
    var probs = Mark.problemsOf(loc.decoded);
    if (!probs) return { ok: false, reason: 'page', markers: loc.markers };
    var digits = Mark.answerDigits(loc.decoded.state);
    var lay = Mark.layout(loc.decoded.state[loc.decoded.state.type].count, digits, probs);
    var results = probs.map(function (p, i) {
      var cells = lay.items[i].cells.map(function (c) {
        var ci = cellImage(img, loc.H, c);
        if (ci.empty) return { empty: true };
        var r = model.classify(ci.img28);
        return { empty: false, digit: r.digit, conf: r.conf };
      });
      var filled = cells.filter(function (c) { return !c.empty; });
      var text = filled.map(function (c) { return c.digit; }).join('');
      // 間にあいたますがある（例: 「4 _ 7」）・自信のない字がある → 「たしかめて」
      var firstI = -1, lastI = -1;
      cells.forEach(function (c, k) { if (!c.empty) { if (firstI < 0) firstI = k; lastI = k; } });
      var gap = filled.length && (lastI - firstI + 1) !== filled.length;
      var minConf = filled.reduce(function (m, c) { return Math.min(m, c.conf); }, 1);
      var read = text === '' ? null : Number(text);
      return {
        no: i + 1, a: p.a, b: p.b, op: p.op, answer: p.answer, cells: cells,
        read: read, blank: read === null, correct: read === p.answer, unsure: !!gap || minConf < 0.7, minConf: minConf,
      };
    });
    return { ok: true, H: loc.H, decoded: loc.decoded, results: results, layout: lay, markers: loc.markers };
  }

  var api = {
    toGray: toGray, shrink: shrink, adaptiveBinary: adaptiveBinary, components: components, findMarkers: findMarkers,
    homography: homography, apply: apply, sample: sample, readCode: readCode, locate: locate, cellImage: cellImage, toMnist: toMnist, grade: grade,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Vision = api;
})(this);
