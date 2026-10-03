// ===========================
// 丸つけカメラ — 画面（企画書 71・K86）
// 写真はこの端末の中だけで処理する。送信しない・保存しない（localStorage も使わない）
// 読み取りは vision.js、数字は digits.js（重み digits-model.json は最初の 1 枚のときに読む）
// ===========================
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var MAX_SIDE = 2400;      // 写真の長い辺をここまで縮めてから読む（12M 画素の写真でも重くならないように）
  var VIEW_PX_PER_MM = 3;   // 結果の絵（紙をまっすぐにしたもの）
  var OP = { '+': '＋', '-': '−', '×': '×' };

  var modelPromise = null;
  function loadModel() {
    if (!modelPromise) {
      modelPromise = fetch('./digits-model.json').then(function (r) {
        if (!r.ok) throw new Error('model');
        return r.json();
      }).then(Digits.makeModel);
      modelPromise.catch(function () { modelPromise = null; });
    }
    return modelPromise;
  }

  function show(id, on) { $(id).hidden = !on; }
  function setState(s) { document.body.setAttribute('data-state', s); }

  // --- 画像を読む ---
  function bitmapOf(blob) {
    if (window.createImageBitmap) {
      return createImageBitmap(blob, { imageOrientation: 'from-image' }).catch(function () { return imgOf(blob); });
    }
    return imgOf(blob);
  }
  function imgOf(blob) {
    return new Promise(function (ok, ng) {
      var url = URL.createObjectURL(blob), im = new Image();
      im.onload = function () { URL.revokeObjectURL(url); ok(im); };
      im.onerror = function () { URL.revokeObjectURL(url); ng(new Error('image')); };
      im.src = url;
    });
  }

  /** 画像（bitmap / img / video）→ { g, w, h, rgba } */
  function pixelsOf(src, sw, sh) {
    var sc = Math.min(1, MAX_SIDE / Math.max(sw, sh));
    var w = Math.max(1, Math.round(sw * sc)), h = Math.max(1, Math.round(sh * sc));
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(src, 0, 0, w, h);
    var data = cx.getImageData(0, 0, w, h).data;
    return { g: Vision.toGray(data, w, h), w: w, h: h, rgba: data };
  }

  var REASON = {
    markers: '四すみの 黒い四角が 4 つ 見つかりませんでした。紙ぜんぶが 入るように、明るい所で とりなおしてください。',
    code: '紙の下の 帯が 読めませんでした。「丸つけカメラ用の印」を入れて印刷したプリントですか？ 影や ピンぼけが ないように とりなおしてください。',
    page: 'このプリントの問題を 作りなおせませんでした。学習プリントメーカーで 印刷しなおしてください。',
    image: '写真を ひらけませんでした。べつの写真を えらんでください。',
    model: '数字を読む データを 読みこめませんでした。通信できる所で もう一度 ためしてください。',
  };

  function fail(reason) {
    show('busy', false);
    $('err').textContent = REASON[reason] || REASON.image;
    show('err', true);
    setState('error');
  }

  function processSource(src, sw, sh) {
    show('err', false); show('result', false); show('busy', true);
    setState('busy');
    // 「よんでいます」を先に描いてから重い処理をする
    return new Promise(function (r) { setTimeout(r, 30); }).then(function () {
      var img = pixelsOf(src, sw, sh);
      return loadModel().then(function (model) {
        var res = Vision.grade(img, model);
        if (!res.ok) return fail(res.reason);
        showResult(img, res);
      }, function () { fail('model'); });
    }).catch(function () { fail('image'); });
  }

  function onFile(file) {
    if (!file) return;
    bitmapOf(file).then(function (bm) {
      return processSource(bm, bm.width || bm.naturalWidth, bm.height || bm.naturalHeight);
    }, function () { fail('image'); });
  }

  // --- 結果 ---
  var current = null;   // { img, res, view }

  function drawView(img, H) {
    var W = Math.round(Mark.PAGE.w * VIEW_PX_PER_MM), Hh = Math.round(Mark.PAGE.h * VIEW_PX_PER_MM);
    var cv = $('r-canvas');
    cv.width = W; cv.height = Hh;
    var cx = cv.getContext('2d');
    var out = cx.createImageData(W, Hh), d = out.data;
    for (var y = 0; y < Hh; y++) for (var x = 0; x < W; x++) {
      var p = Vision.apply(H, (x + 0.5) / VIEW_PX_PER_MM, (y + 0.5) / VIEW_PX_PER_MM);
      var px = Math.round(p[0]), py = Math.round(p[1]), o = (y * W + x) * 4;
      if (px < 0 || py < 0 || px >= img.w || py >= img.h) { d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = 255; continue; }
      var i = (py * img.w + px) * 4;
      d[o] = img.rgba[i]; d[o + 1] = img.rgba[i + 1]; d[o + 2] = img.rgba[i + 2]; d[o + 3] = 255;
    }
    cx.putImageData(out, 0, 0);
    return cx.getImageData(0, 0, W, Hh);
  }

  function verdict(r) { return r.override !== undefined ? r.override : r.correct; }

  function paint() {
    var cv = $('r-canvas'), cx = cv.getContext('2d'), k = VIEW_PX_PER_MM;
    cx.putImageData(current.view, 0, 0);
    var lay = current.res.layout;
    current.res.results.forEach(function (r, i) {
      var cells = lay.items[i].cells, c0 = cells[0], c1 = cells[cells.length - 1];
      var x0 = c0.x * k, x1 = (c1.x + c1.s) * k, y0 = c0.y * k, y1 = (c0.y + c0.s) * k;
      var cxm = (x0 + x1) / 2, cym = (y0 + y1) / 2, rad = Math.max(x1 - x0, y1 - y0) / 2 + 2 * k;
      cx.lineWidth = Math.max(3, 0.9 * k);
      var ok = verdict(r);
      if (r.unsure && r.override === undefined) {
        cx.strokeStyle = '#d97706';
        cx.setLineDash([3 * k, 2 * k]);
        cx.strokeRect(x0 - 1.5 * k, y0 - 1.5 * k, x1 - x0 + 3 * k, y1 - y0 + 3 * k);
        cx.setLineDash([]);
      }
      cx.strokeStyle = '#d0021b';
      cx.beginPath();
      if (ok) {
        cx.ellipse(cxm, cym, rad, (y1 - y0) / 2 + 3 * k, 0, 0, Math.PI * 2);
      } else {
        // ×ではなく、日本の丸つけの「チェック（レ）」
        cx.moveTo(x0, cym); cx.lineTo(x0 + (x1 - x0) * 0.3, y1 + 1.5 * k); cx.lineTo(x1 + 2 * k, y0 - 2 * k);
      }
      cx.stroke();
    });
    var n = current.res.results.length, good = current.res.results.filter(verdict).length;
    $('r-score').textContent = 'せいかい ' + good + ' / ' + n;
    var unsure = current.res.results.filter(function (r) { return r.unsure && r.override === undefined; }).length;
    $('r-sub').textContent = (unsure ? 'たしかめてほしい問題（？）: ' + unsure + ' こ。' : '') + 'もんだい ばんごう ' + Calc.seedLabel(current.res.decoded.state.seed) + '・' + (current.res.decoded.page + 1) + ' まいめ';
    renderList();
  }

  function renderList() {
    var ol = $('r-list');
    ol.innerHTML = '';
    current.res.results.forEach(function (r, i) {
      var li = document.createElement('li');
      var ok = verdict(r);
      li.className = ok ? 'ok' : 'ng';
      li.setAttribute('data-no', String(r.no));
      li.setAttribute('data-read', r.read === null ? '' : String(r.read));
      li.setAttribute('data-correct', ok ? '1' : '0');
      li.setAttribute('data-unsure', r.unsure && r.override === undefined ? '1' : '0');
      var ex = document.createElement('span');
      ex.className = 'mt-ex';
      ex.textContent = '(' + r.no + ') ' + r.a + ' ' + OP[r.op] + ' ' + r.b + ' ＝ ' + r.answer;
      var rd = document.createElement('span');
      rd.className = 'mt-read';
      rd.textContent = r.blank ? 'かいていない' : 'よみ: ' + r.read;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'mt-mark';
      b.textContent = ok ? '○' : 'レ';
      b.setAttribute('aria-label', '(' + r.no + ') いまは ' + (ok ? 'せいかい' : 'まちがい') + '。おすと なおせます');
      if (r.unsure && r.override === undefined) { var q = document.createElement('span'); q.className = 'mt-q'; q.textContent = '？'; li.appendChild(q); }
      b.addEventListener('click', function () {
        r.override = !verdict(r);
        paint();
        var again = $('r-list').querySelectorAll('.mt-mark')[i];
        if (again) again.focus();
      });
      li.appendChild(ex); li.appendChild(rd); li.appendChild(b);
      ol.appendChild(li);
    });
  }

  function showResult(img, res) {
    current = { img: img, res: res, view: drawView(img, res.H) };
    paint();
    show('busy', false); show('result', true);
    setState('done');
    window.__marutsuke = {   // テスト（Playwright）が読む。画面の外には出さない
      seed: res.decoded.state.seed, page: res.decoded.page, type: res.decoded.state.type,
      results: res.results.map(function (r) { return { no: r.no, answer: r.answer, read: r.read, correct: r.correct, unsure: r.unsure }; }),
    };
    $('result').scrollIntoView({ block: 'start' });
  }

  // --- カメラ（拒否されても「写真を えらぶ」で使える） ---
  var stream = null;
  function stopCam() {
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null;
    show('cam-box', false);
  }
  $('cam-start').addEventListener('click', function () {
    $('cam-msg').textContent = '';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $('cam-msg').textContent = 'このブラウザでは カメラを つかえません。「写真を えらぶ」から、カメラで とるか 写真を えらんでください。';
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(function (s) {
        stream = s;
        var v = $('video');
        v.srcObject = s;
        show('cam-box', true);
        return v.play();
      })
      .catch(function () {
        stopCam();
        $('cam-msg').textContent = 'カメラが つかえませんでした（ゆるされていないか、ほかのアプリが つかっています）。「写真を えらぶ」から、カメラで とるか 写真を えらんでください。';
      });
  });
  $('cam-stop').addEventListener('click', stopCam);
  $('shoot').addEventListener('click', function () {
    var v = $('video');
    if (!v.videoWidth) return;
    var cv = document.createElement('canvas');
    cv.width = v.videoWidth; cv.height = v.videoHeight;
    cv.getContext('2d').drawImage(v, 0, 0);
    stopCam();
    processSource(cv, cv.width, cv.height);
  });

  $('file').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    onFile(f);
    e.target.value = '';
  });
  $('again').addEventListener('click', function () {
    show('result', false);
    current = null;
    window.scrollTo(0, 0);
    $('cam-start').focus();
  });
  setState('ready');
})();
