// ===========================
// 丸つけカメラ — 手書き数字 1 字を読む（小さな畳み込みニューラルネット。ライブラリなし）
// 重みは digits-model.json（tools/marutsuke/train_digits.py で MNIST から作った int8。CC BY-SA 3.0）
// 入力は 28×28 の「インクの濃さ」（0〜1。MNIST と同じく、字を 20×20 に収めて重心をまん中に置いたもの）
// ブラウザでは window.Digits、Node（テスト）では module.exports
// ===========================
(function (root) {
  'use strict';

  function b64ToInt8(s) {
    var bin = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
    var out = new Int8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = (bin.charCodeAt(i) << 24) >> 24;
    return out;
  }

  /** digits-model.json の中身から、読む関数を作る */
  function makeModel(json) {
    if (!json || json.format !== 'yorozu-digits-1') throw new Error('model format');
    var W = {};
    Object.keys(json.layers).forEach(function (k) {
      var l = json.layers[k], q = b64ToInt8(l.q), f = new Float32Array(q.length);
      for (var i = 0; i < q.length; i++) f[i] = q[i] * l.scale;
      W[k] = { shape: l.shape, w: f };
    });

    // 3×3・余白 1 の畳み込み＋ReLU。x は [cin][n][n]
    function conv(x, cin, n, wk, bk) {
      var w = W[wk].w, b = W[bk].w, cout = W[wk].shape[0];
      var out = new Float32Array(cout * n * n);
      for (var o = 0; o < cout; o++) {
        for (var y = 0; y < n; y++) {
          for (var xx = 0; xx < n; xx++) {
            var s = b[o];
            for (var c = 0; c < cin; c++) {
              var wb = ((o * cin + c) * 3) * 3, xb = c * n * n;
              for (var ky = 0; ky < 3; ky++) {
                var yy = y + ky - 1;
                if (yy < 0 || yy >= n) continue;
                for (var kx = 0; kx < 3; kx++) {
                  var xk = xx + kx - 1;
                  if (xk < 0 || xk >= n) continue;
                  s += w[wb + ky * 3 + kx] * x[xb + yy * n + xk];
                }
              }
            }
            out[(o * n + y) * n + xx] = s > 0 ? s : 0;
          }
        }
      }
      return out;
    }
    // 2×2 の最大値（端の余りは落とす。PyTorch の max_pool2d と同じ）
    function pool(x, c, n) {
      var m = Math.floor(n / 2), out = new Float32Array(c * m * m);
      for (var k = 0; k < c; k++) for (var y = 0; y < m; y++) for (var xx = 0; xx < m; xx++) {
        var i = (k * n + 2 * y) * n + 2 * xx;
        out[(k * m + y) * m + xx] = Math.max(x[i], x[i + 1], x[i + n], x[i + n + 1]);
      }
      return out;
    }

    /** 28×28（784 個）→ { digit, conf, probs } */
    function classify(img) {
      var x = conv(img, 1, 28, 'c1.weight', 'c1.bias'); x = pool(x, 16, 28);
      x = conv(x, 16, 14, 'c2.weight', 'c2.bias'); x = pool(x, 32, 14);
      x = conv(x, 32, 7, 'c3.weight', 'c3.bias'); x = pool(x, 32, 7);
      var fw = W['fc.weight'].w, fb = W['fc.bias'].w, n = x.length, logits = [];
      for (var o = 0; o < 10; o++) { var s = fb[o]; for (var i = 0; i < n; i++) s += fw[o * n + i] * x[i]; logits.push(s); }
      var mx = Math.max.apply(null, logits), sum = 0;
      var p = logits.map(function (v) { var e = Math.exp(v - mx); sum += e; return e; }).map(function (e) { return e / sum; });
      var best = 0;
      for (var d = 1; d < 10; d++) if (p[d] > p[best]) best = d;
      return { digit: best, conf: p[best], probs: p };
    }
    return { classify: classify };
  }

  var api = { makeModel: makeModel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Digits = api;
})(this);
