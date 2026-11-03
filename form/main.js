(() => {
  "use strict";

  const W = 1920, H = 1080;
  const root = document.documentElement;
  const stage = document.getElementById("stage");
  const viewport = document.getElementById("viewport");
  const scene = document.getElementById("scene");

  const filmA = document.getElementById("filmA");
  const filmB = document.getElementById("filmB");
  const cursor = document.getElementById("cursor");
  const fxCanvas = document.getElementById("fx");
  const fx = fxCanvas.getContext("2d");
  const lines = [...document.querySelectorAll(".hl")];
  const loader = document.getElementById("loader");
  const loaderNum = document.getElementById("loaderNum");
  const loaderLily = document.getElementById("loaderLily");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOut = (x) => 1 - Math.pow(1 - x, 4);
  const easeInOut = (x) => (x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2);
  const easeIn = (x) => x * x;

  /* ================================================================== */
  /*  Stage fit                                                          */
  /* ================================================================== */
  let S = 1, qFx = 1, K = 1, view = null;
  const anchored = [...document.querySelectorAll("[data-ax]")];
  function fit() {
    const r = viewport.getBoundingClientRect();
    const vw = r.width || W, vh = r.height || H;
    // the picture covers the screen (cropped equally on both sides); on 1920×1080 this is the Figma frame 1:1
    // the picture: the whole Figma frame is always on screen (girl, flower, tubes); the film around it is
    // wider and taller (wall and ledge), so the rest of the screen is filled - no bars, nothing cut
    S = Math.min(vw / W, vh / H) || 1;
    const tx = (vw - W * S) / 2, ty = (vh - H * S) / 2;
    stage.style.setProperty("--s", S);
    stage.style.setProperty("--tx", tx.toFixed(2) + "px");
    stage.style.setProperty("--ty", ty.toFixed(2) + "px");
    // the type is laid out on the screen itself, at the Figma size: each block keeps the share of the screen it
    // has in the frame (the headline across the width from the left line, logo and menu in the corners ...)
    K = Math.min(vw / W, (vh / H) * 1.25);
    view = { vw, vh, tx, ty, S, K };
    anchored.forEach((el) => {
      const ax = +el.dataset.ax, ay = +el.dataset.ay;
      const sx = ax * vw / W, sy = ay * vh / H;                 // where the anchor sits on the screen
      const dx = (sx - tx) / S - ax, dy = (sy - ty) / S - ay;   // in stage coordinates
      el.style.transformOrigin = ax + "px " + ay + "px";
      el.style.transform = "translate(" + dx.toFixed(2) + "px," + dy.toFixed(2) + "px) scale(" + (K / S).toFixed(4) + ")";
    });
    layoutGL();
    const dpr = window.devicePixelRatio || 1;
    qFx = clamp(S * dpr, 0.4, 2);
    const fw = Math.round(W * qFx), fh = Math.round(H * qFx);
    if (fxCanvas.width !== fw || fxCanvas.height !== fh) { fxCanvas.width = fw; fxCanvas.height = fh; }
  }

  /* ================================================================== */
  /*  The film and the headline on the GPU: the headline goes behind    */
  /*  her hair using the matte that rides in the same video frame        */
  /* ================================================================== */
  const glc = document.getElementById("filmGL");
  const EW = 2560, EH = 1440, VH = 1952, MR = [860, 200, 840, 512];   // film, packed height, matte rect
  const HL = [   // Figma 475:48: text, box left, box top, font, size, letter-spacing, colour, reveal [delay, length]
    { t: "MADE FOR", x: 36, y: 184, w: 865, font: "500 170px 'Playfair Display'", ls: 0, c: "#ffffff", d: 0.6, l: 1.7, cap: 33.26 },
    { t: "SKIN THAT", x: 1004, y: 184, w: 875, font: "500 170px 'Playfair Display'", ls: 0, c: "#ffffff", d: 0.85, l: 1.5, cap: 33.26 },
    { t: "FEELS MORE", x: 1235, y: 337, w: 644, font: "600 105px 'Playfair Display'", ls: -1.05, c: "#647422", d: 1.1, l: 1.9, cap: 20.19 },
  ];
  const HL_AX = 36, HL_AY = 263;                                     // the headline's anchor (left line)
  let gl = null, glOK = false, U = {}, vidTex = null, txtTex = null;
  const txt = document.createElement("canvas"), tctx = txt.getContext("2d");
  const line = document.createElement("canvas"), lctx = line.getContext("2d");
  let hlReveal = reduced ? [1, 1, 1] : [0, 0, 0];                     // 0 hidden … 1 fully drawn
  function initGL() {
    try {
      gl = glc.getContext("webgl", { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
      if (!gl) throw new Error("no webgl");
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, "attribute vec2 p; varying vec2 uv; void main(){ uv = vec2(p.x*.5+.5, .5-p.y*.5); gl_Position = vec4(p,0.,1.); }"));
      // uv: the screen (0..1); res: screen size in CSS px; fo: film origin on screen; fs: film scale; zm: intro zoom
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, [
        "precision highp float; varying vec2 uv; uniform sampler2D v, t; uniform vec4 mr; uniform vec2 res, fo; uniform float fs, zm;",
        "void main(){",
        "  vec2 s = uv * res; s = res * 0.5 + (s - res * 0.5) / zm;",
        "  vec2 px = clamp((s - fo) / fs, vec2(0.5), vec2(" + EW + ".0 - 0.5, " + EH + ".0 - 0.5));",
        "  vec3 c = texture2D(v, vec2(px.x / " + EW + ".0, px.y / " + VH + ".0)).rgb;",
        "  vec2 q = px - mr.xy; float m = 0.0;",
        "  if (q.x > 0.0 && q.y > 0.0 && q.x < mr.z && q.y < mr.w) m = clamp((texture2D(v, vec2(q.x / " + EW + ".0, (" + EH + ".0 + q.y) / " + VH + ".0)).r - 0.04) * 1.09, 0.0, 1.0);",
        "  vec4 h = texture2D(t, uv);",
        "  gl_FragColor = vec4(mix(c, h.rgb, h.a * (1.0 - m)), 1.0);",
        "}"].join("\n")));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const mk = (unit) => { const tx = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tx);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); return tx; };
      vidTex = mk(0); txtTex = mk(1);
      gl.uniform1i(gl.getUniformLocation(prog, "v"), 0);
      gl.uniform1i(gl.getUniformLocation(prog, "t"), 1);
      gl.uniform4f(gl.getUniformLocation(prog, "mr"), MR[0], MR[1], MR[2], MR[3]);
      ["res", "fo", "fs", "zm"].forEach((n) => (U[n] = gl.getUniformLocation(prog, n)));
      gl.uniform1f(U.zm, 1);
      root.classList.add("has-gl");
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      glOK = true;
    } catch (e) {
      console.warn("film canvas off:", e.message);
      glOK = false;
      root.classList.add("no-gl");
    }
    return glOK;
  }
  // the canvas covers the film (2560×1440 film px); its buffer matches the screen pixels
  let bw = 0, bh = 0, fs = 1;
  function layoutGL() {
    if (!view) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(2, Math.round(view.vw * dpr)), h = Math.max(2, Math.round(view.vh * dpr));
    if (w !== bw || h !== bh) { bw = w; bh = h; glc.width = w; glc.height = h; txt.width = w; txt.height = h; }
    if (glOK) {
      gl.uniform2f(U.res, view.vw, view.vh);
      gl.uniform2f(U.fo, view.tx - 320 * view.S, view.ty - 180 * view.S);
      gl.uniform1f(U.fs, view.S);
    }
    drawText();
    try { renderGL(current); } catch (e) { /* the film is not set up yet */ }
  }
  // the headline into the text layer, at its place on the screen (film-box left/top on screen: tx - 320 S, ty - 180 S)
  function drawText() {
    if (!view || !bw) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const ox = 0, oy = 0;                                             // the text layer is the screen itself
    const k = view.K;
    const ax = HL_AX * view.vw / W, ay = HL_AY * view.vh / H;          // the anchor on the screen
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.clearRect(0, 0, bw, bh);
    HL.forEach((L, i) => {
      const q = hlReveal[i];
      if (q <= 0) return;
      const sx = ax + (L.x - HL_AX) * k, sy = ay + (L.y - HL_AY) * k;  // the text box on the screen
      const bx = (sx - ox) * dpr, by = (sy - oy) * dpr, s = k * dpr;   // device pixels: drawn 1:1, sharp
      const lw = Math.ceil((L.w + 80) * s), lh = Math.ceil(240 * s);
      line.width = lw; line.height = lh;
      lctx.setTransform(s, 0, 0, s, 0, 0);
      lctx.font = L.font;
      if ("letterSpacing" in lctx) lctx.letterSpacing = L.ls + "px";
      lctx.textBaseline = "alphabetic";
      lctx.fillStyle = L.c;
      // the cap line where Figma draws it (measured: 33.26 px below the box top at 170 px, 20.19 at 105 px)
      const capH = lctx.measureText("H").actualBoundingBoxAscent || 0.708 * parseFloat(L.font.split(" ")[1]);
      lctx.fillText(L.t, 0, L.cap + capH);
      if (q < 1) {                                                   // left-to-right reveal with a soft edge
        const F = 0.34, m = -F + q * (1 + F);
        const g = lctx.createLinearGradient(0, 0, L.w, 0);
        g.addColorStop(Math.max(0, Math.min(1, m)), "rgba(0,0,0,1)");
        g.addColorStop(Math.max(0, Math.min(1, m + F)), "rgba(0,0,0,0)");
        lctx.globalCompositeOperation = "destination-in";
        lctx.fillStyle = g; lctx.fillRect(-10, 0, L.w + 90, 240);
        lctx.globalCompositeOperation = "source-over";
      }
      tctx.drawImage(line, Math.round(bx - 70 * (1 - q) * s), Math.round(by));
    });
    if (glOK) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, txtTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, txt); }
    textDirty = false;
  }
  let textDirty = true;
  function renderGL(v) {
    if (!glOK || !v || v.readyState < 2) return;
    gl.viewport(0, 0, bw, bh);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, vidTex);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, v); } catch (e) { return; }
    if (textDirty) drawText();
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /* ================================================================== */
  /*  Pointer                                                            */
  /* ================================================================== */
  const ptr = { x: W * 0.6, y: H * 0.5, px: W * 0.6, py: H * 0.5, active: false };
  const glowPos = { x: ptr.x, y: ptr.y };
  stage.addEventListener("pointermove", (e) => {
    const r = stage.getBoundingClientRect();
    ptr.x = (e.clientX - r.left) / S;
    ptr.y = (e.clientY - r.top) / S;
    if (!ptr.active) { glowPos.x = ptr.x; glowPos.y = ptr.y; ptr.px = ptr.x; ptr.py = ptr.y; }
    ptr.active = true;
    cursor.classList.add("is-on");
    cursor.classList.toggle("is-link", !!(e.target.closest && e.target.closest("a, button")));
  });
  stage.addEventListener("pointerleave", () => { ptr.active = false; cursor.classList.remove("is-on"); });

  /* ================================================================== */
  /*  Dew glints                                                         */
  /* ================================================================== */
  const DEW = [[1787,912],[1135,583],[1051,701],[1260,574],[1618,932],[1253,532],[1171,694],[1092,605],[1153,612],[966,832],[996,793],[862,792],[1647,891],[1142,749],[560,785],[1103,795],[1733,932],[673,762],[1388,533],[1341,556],[722,866],[923,729],[599,964],[1177,912],[560,731],[573,841],[1618,707],[1210,818],[895,784],[1164,652],[1092,670],[1001,851],[1196,868],[1633,793],[958,737],[806,704],[910,832],[571,701],[1147,784],[973,763],[1729,865],[631,963],[811,787],[638,768],[1696,931],[1151,927],[1112,750],[1044,751],[1012,751],[965,669],[1446,603],[1663,922],[1141,674],[1065,631],[1642,753],[815,735],[1611,744],[1092,702],[1385,572],[777,840]];
  const glints = [].map(([x, y]) => ({ x, y, t: -rand(0, 8), dur: rand(1.2, 2.2), size: rand(8, 17), rot: rand(-0.4, 0.4) }));
  const glintSprite = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 20);
    g.addColorStop(0, "rgba(255,253,248,1)");
    g.addColorStop(0.3, "rgba(255,244,228,.5)");
    g.addColorStop(1, "rgba(255,236,214,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    const ray = (w, len, ang, alpha) => {
      x.save();
      x.translate(64, 64);
      x.rotate(ang);
      const lg = x.createLinearGradient(-len, 0, len, 0);
      lg.addColorStop(0, "rgba(255,250,240,0)");
      lg.addColorStop(0.5, `rgba(255,250,240,${alpha})`);
      lg.addColorStop(1, "rgba(255,250,240,0)");
      x.fillStyle = lg;
      x.beginPath();
      x.moveTo(-len, 0); x.lineTo(0, -w); x.lineTo(len, 0); x.lineTo(0, w);
      x.closePath();
      x.fill();
      x.restore();
    };
    ray(1.8, 60, 0, 0.95);
    ray(1.8, 60, Math.PI / 2, 0.95);
    ray(1, 26, Math.PI / 4, 0.45);
    ray(1, 26, -Math.PI / 4, 0.45);
    return c;
  })();
  function drawFx(t, dt, live) {
    fx.setTransform(1, 0, 0, 1, 0, 0);
    fx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    if (live <= 0) return;
    fx.setTransform(qFx, 0, 0, qFx, 0, 0);
    for (const g of glints) {
      let near = 0;
      if (ptr.active) {
        const d = Math.hypot(g.x - glowPos.x, g.y - glowPos.y);
        near = clamp(1 - d / 230, 0, 1);
        if (near > 0.35 && g.t < 0 && Math.random() < dt * 4) g.t = 0;
      }
      g.t += dt;
      if (g.t > g.dur) { g.t = -rand(3, 10); g.size = rand(8, 17); g.rot = rand(-0.4, 0.4); }
      if (g.t < 0) continue;
      const k = Math.sin((g.t / g.dur) * Math.PI);
      const s = g.size * (0.3 + 0.7 * k) * 2.2 * (1 + near * 0.5);
      fx.globalAlpha = k * k * 0.85 * live;
      fx.save();
      fx.translate(g.x, g.y);
      fx.rotate(g.rot + g.t * 0.3);
      fx.drawImage(glintSprite, -s / 2, -s / 2, s, s);
      fx.restore();
    }
    fx.globalAlpha = 1;
  }

  /* ================================================================== */
  /*  The film: plays once (the calla opens on the ledge, she blinks),    */
  /*  then a seamless loop of its last seconds runs on                    */
  /* ================================================================== */
  let current = filmA;
  function drawGirl() { renderGL(current); }
  function watch(v) {
    if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
      const on = () => { if (v === current) drawGirl(); v.requestVideoFrameCallback(on); };
      v.requestVideoFrameCallback(on);
    } else {
      const loop = () => { if (v === current && !v.paused) drawGirl(); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
  }
  watch(filmA); watch(filmB);
  function playFilm() {
    filmA.classList.add("is-on");
    filmA.play().catch(() => {});
    // if the browser blocked autoplay (e.g. Low Power Mode in Safari), any tap starts the film
    stage.addEventListener("pointerdown", () => { if (current.paused) current.play().catch(() => {}); });
    filmA.addEventListener("ended", () => {
      // the loop file starts on the frame right after the last one of the first play: no seam
      filmB.currentTime = 0;
      filmB.play().catch(() => {});
      filmB.classList.add("is-on");
      current = filmB;
      drawGirl();
      filmA.classList.remove("is-on");
    }, { once: true });
  }
  function pickSource() {
    const v = document.createElement("video");
    if (v.canPlayType('video/mp4; codecs="avc1.640028"')) return [{ url: "assets/film.mp4", size: 7253749, type: "video/mp4" }, { url: "assets/loop.mp4", size: 5804346, type: "video/mp4" }];
    return [{ url: "assets/film.webm", size: 733743, type: "video/webm" }, { url: "assets/loop.webm", size: 572069, type: "video/webm" }];
  }
  async function fetchFile(src, onProgress) {
    try {
      const res = await fetch(src.url);
      if (!res.ok || !res.body) throw new Error("fetch");
      const total = +res.headers.get("content-length") || src.size;
      const reader = res.body.getReader();
      const chunks = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        onProgress(clamp(got / total, 0, 1));
      }
      return URL.createObjectURL(new Blob(chunks, { type: src.type }));
    } catch (e) {
      onProgress(1);
      return src.url;
    }
  }
  const canPlay = (v) => new Promise((r) => (v.readyState >= 3 ? r() : v.addEventListener("canplaythrough", r, { once: true })));

  /* ================================================================== */
  /*  Words                                                              */
  /* ================================================================== */
  const wordGroups = [];
  function splitWords() {
    document.querySelectorAll(".js-words").forEach((el) => {
      const text = el.textContent;
      el.setAttribute("aria-label", text.replace(/\s+/g, " ").trim());
      el.textContent = "";
      const words = [];
      text.split("\n").forEach((line, li) => {
        if (li > 0) el.appendChild(document.createElement("br"));
        line.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { el.appendChild(document.createTextNode(part)); return; }
          const s = document.createElement("span");
          s.className = "word" + (reduced ? "" : " is-hidden");
          s.setAttribute("aria-hidden", "true");
          s.textContent = part;
          el.appendChild(s);
          words.push(s);
        });
      });
      el.classList.add("is-split");
      wordGroups.push(words);
    });
  }
  const reveal = (group, start, step) =>
    group.forEach((w, i) => setTimeout(() => w.classList.remove("is-hidden"), (start + i * step) * 1000));

  /* ================================================================== */
  /*  Loading screen                                                     */
  /* ================================================================== */
  const L = {
    parts: [
      [loaderLily.querySelector(".ln--stem"), 0.0, 0.32],
      [loaderLily.querySelector(".ln--leaf"), 0.22, 0.5],
      [loaderLily.querySelector(".ln--leafvein"), 0.4, 0.58],
      [loaderLily.querySelector(".ln--spathe"), 0.3, 0.88],
      [loaderLily.querySelector(".ln--fold"), 0.62, 0.86],
      [loaderLily.querySelector(".ln--curl"), 0.7, 0.92],
      [loaderLily.querySelector(".ln--spadix"), 0.78, 1.0],
    ],
    spathe: loaderLily.querySelector(".ln--spathe"),
    leaf: loaderLily.querySelector(".ln--leaf"),
    drop: document.getElementById("drop"),
    r1: document.getElementById("ripple1"),
    r2: document.getElementById("ripple2"),
    shown: 0,
    loaded: 0,
  };
  const TIP = { x: 168, y: 14 }, FLOOR = 332;
  function drawLoader(p) {
    L.parts.forEach(([el, a, b]) => { el.style.strokeDashoffset = (1 - clamp((p - a) / (b - a), 0, 1)).toFixed(4); });
    const fill = clamp((p - 0.85) / 0.15, 0, 1);
    L.spathe.style.fillOpacity = (fill * 0.9).toFixed(3);
    L.leaf.style.fillOpacity = (fill * 0.6).toFixed(3);
    loaderNum.textContent = Math.round(p * 100);
  }
  function svgToScreen(x, y) {
    const m = loaderLily.getScreenCTM();
    const pt = loaderLily.createSVGPoint();
    pt.x = x; pt.y = y;
    const s = pt.matrixTransform(m);
    const v = viewport.getBoundingClientRect();
    return { x: s.x - v.left, y: s.y - v.top };
  }

  // the cream drop forms at the tip of the lily, falls, and opens the page with a ripple
  function finishLoader(done) {
    const t0 = performance.now();
    const FORM = 0.5, FALL = 0.55, SPLASH = 1.25;
    let opened = false;
    const v = viewport.getBoundingClientRect();
    const maxR = Math.hypot(v.width, v.height);
    function step(now) {
      const t = (now - t0) / 1000;
      if (t < FORM) {
        const k = easeOut(t / FORM);
        L.drop.setAttribute("cx", TIP.x);
        L.drop.setAttribute("cy", TIP.y + 4 * k);
        L.drop.setAttribute("rx", (4.2 * k).toFixed(2));
        L.drop.setAttribute("ry", (5 * k).toFixed(2));
      } else if (t < FORM + FALL) {
        const k = easeIn((t - FORM) / FALL);
        const y = TIP.y + 4 + (FLOOR - TIP.y - 4) * k;
        L.drop.setAttribute("cy", y.toFixed(2));
        L.drop.setAttribute("rx", (4.2 - 0.8 * k).toFixed(2));
        L.drop.setAttribute("ry", (5 + 3.5 * k).toFixed(2));
      } else {
        L.drop.setAttribute("rx", 0);
        L.drop.setAttribute("ry", 0);
        const s = t - FORM - FALL;
        [[L.r1, 0], [L.r2, 0.16]].forEach(([el, d]) => {
          const k = clamp((s - d) / 0.9, 0, 1);
          el.setAttribute("rx", (2 + 46 * easeOut(k)).toFixed(2));
          el.setAttribute("ry", (0.6 + 9 * easeOut(k)).toFixed(2));
          el.style.opacity = k > 0 ? (1 - k).toFixed(3) : 0;
        });
        if (!opened) { opened = true; done(); }
        // the page opens from the splash in a widening, soft-edged circle
        const c = svgToScreen(TIP.x, FLOOR);
        const k = easeInOut(clamp(s / SPLASH, 0, 1));
        const r = k * maxR;
        const mask = `radial-gradient(circle at ${c.x}px ${c.y}px, transparent ${r}px, #000 ${r + 90}px)`;
        loader.style.webkitMaskImage = mask;
        loader.style.maskImage = mask;
        if (s >= SPLASH) { loader.classList.add("is-gone"); return; }
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function runLoader(assetsReady, done) {
    if (reduced) {
      drawLoader(1);
      assetsReady.then(() => { loader.classList.add("is-gone"); done(); });
      return;
    }
    const MIN = 2.6; // seconds of drawing, even when everything is cached
    const t0 = performance.now();
    function step(now) {
      const tp = clamp((now - t0) / 1000 / MIN, 0, 1);
      const target = Math.min(tp, L.loaded);
      L.shown += (target - L.shown) * 0.12;
      if (target >= 1 && L.shown > 0.995) L.shown = 1;
      drawLoader(easeInOut(L.shown));
      if (L.shown >= 1) { finishLoader(done); return; }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ================================================================== */
  /*  Page timeline                                                      */
  /* ================================================================== */
  const LINES = [[0.6, 1.7], [0.85, 1.5], [1.1, 1.9]];
  const FEATHER = 34;
  let t0 = 0, last = 0, introDone = false, nextShimmer = 7;

  function frame(now) {
    if (!t0) { t0 = now; last = now; }
    const t = (now - t0) / 1000;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (!introDone) {
      const p = easeOut(clamp(t / 2.4, 0, 1));
      // the picture settles from a soft, slightly closer view (her head in front of the headline with it)
      const sc = `scale(${(1.06 - 0.06 * p).toFixed(4)})`;
      scene.style.transform = sc;
      scene.style.opacity = Math.min(1, 0.4 + p * 0.6).toFixed(3);
      if (glOK) { gl.uniform1f(U.zm, 1.06 - 0.06 * p); glc.style.opacity = scene.style.opacity; renderGL(current); }

      hlReveal = HL.map((L) => easeOut(clamp((t - L.d) / L.l, 0, 1)));
      textDirty = true;
      if (current.paused || current.readyState < 2) drawText();
      lines.forEach((el, i) => {
        const [d, len] = LINES[i];
        const q = easeOut(clamp((t - d) / len, 0, 1));
        const m = -FEATHER + q * (100 + FEATHER);
        el.style.setProperty("--m0", m + "%");
        el.style.setProperty("--m1", m + FEATHER + "%");
        el.style.transform = `translateX(${(-70 * (1 - q)).toFixed(2)}px)`;
        el.style.filter = q < 0.99 ? `blur(${((1 - q) * 6).toFixed(2)}px)` : "none";
      });
      if (t > 4.0) {
        introDone = true;
        scene.style.transform = "";
        scene.style.opacity = "";
        if (glOK) { gl.uniform1f(U.zm, 1); glc.style.opacity = ""; }

        lines.forEach((el) => {
          el.style.removeProperty("--m0");
          el.style.removeProperty("--m1");
          el.style.transform = "";
          el.style.filter = "";
        });
        root.classList.remove("js-intro");
        root.classList.add("is-live");
        hlReveal = [1, 1, 1]; textDirty = true;
      }
    }

    if (introDone && t > nextShimmer) {
      nextShimmer = t + rand(9, 13);
      lines.forEach((el, i) => setTimeout(() => {
        el.classList.remove("is-shimmer");
        void el.offsetWidth;
        el.classList.add("is-shimmer");
      }, i * 260));
    }

    glowPos.x += (ptr.x - glowPos.x) * Math.min(1, dt * 12);
    glowPos.y += (ptr.y - glowPos.y) * Math.min(1, dt * 12);
    cursor.style.transform = `translate(${glowPos.x.toFixed(1)}px, ${glowPos.y.toFixed(1)}px)`;
    ptr.px = ptr.x; ptr.py = ptr.y;

    requestAnimationFrame(frame);
  }

  lines.forEach((el) => el.addEventListener("animationend", () => el.classList.remove("is-shimmer")));

  /* ================================================================== */
  /*  Boot                                                               */
  /* ================================================================== */
  initGL();
  fit();
  window.addEventListener("resize", fit);

  // real loading progress: the film (and its loop) and the fonts
  const srcs = pickSource();
  const part = [0, 0, 0];
  const progress = () => { L.loaded = 0.72 * part[0] + 0.24 * part[1] + 0.04 * part[2]; };
  const fontsJob = (document.fonts ? Promise.all([document.fonts.load("500 170px 'Playfair Display'"), document.fonts.load("600 105px 'Playfair Display'"), document.fonts.ready]) : Promise.resolve())
    .catch(() => {}).then(() => { part[2] = 1; progress(); textDirty = true; drawText(); });
  const filmJob = fetchFile(srcs[0], (k) => { part[0] = k; progress(); });
  const loopJob = fetchFile(srcs[1], (k) => { part[1] = k; progress(); });
  const assetsReady = Promise.all([filmJob, loopJob, fontsJob]).then(async ([a, b]) => {
    filmA.src = a; filmB.src = b;
    filmA.load(); filmB.load();
    // Safari on iPhone may hold back "canplaythrough" until playback is asked for: don't wait forever
    await Promise.race([canPlay(filmA), new Promise((r) => setTimeout(r, 1500))]);
  });
  setTimeout(() => { L.loaded = 1; }, 12000); // never hold the page forever

  let started = false;
  function startPage() {
    if (started) return;
    started = true;
    splitWords();
    playFilm();
    drawGirl();
    if (reduced) {
      root.classList.remove("js-intro");
      root.classList.add("is-live");
      return;
    }
    reveal(wordGroups[0] || [], 1.5, 0.07);
    reveal(wordGroups[1] || [], 1.75, 0.03);
    reveal(wordGroups[2] || [], 2.05, 0.08);
    reveal(wordGroups[3] || [], 2.3, 0.08);
    const ins = [...document.querySelectorAll(".js-in")].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    ins.forEach((el, i) => setTimeout(() => el.classList.add("is-in"), 1100 + i * 90));
    requestAnimationFrame(frame);
  }

  // headline lines start hidden until the page opens
  lines.forEach((el) => { el.style.setProperty("--m0", "-34%"); el.style.setProperty("--m1", "0%"); });
  if (reduced) lines.forEach((el) => { el.style.removeProperty("--m0"); el.style.removeProperty("--m1"); });

  runLoader(assetsReady, () => assetsReady.then(startPage));

})();
