(() => {
  "use strict";

  /* TIDELINE — FIRST MOTION.
     1. Loading: a clean lime Ø is traced as the film loads, the count inside it; at 100% the slash
        goes on and we fly through the ring into the page.
     2. The film runs without a break: two players take turns and each lap dissolves into the next.
     3. The headline comes up out of the water; when a wave breaks in the film it rolls through
        the letters, and the letters ripple under the cursor. */

  const W = 1920, H = 1080;
  const root = document.documentElement;
  const stage = document.getElementById("stage");
  const viewport = document.getElementById("viewport");
  const filmA = document.getElementById("filmA");
  const filmB = document.getElementById("filmB");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const swell = "cubic-bezier(.22,.9,.25,1)";
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- fit: no black bars ----------
     The picture covers the whole screen (whatever does not fit is cropped equally on both sides).
     Every text block keeps the share of the screen it has in the Figma frame (e.g. the headline centre at
     35% across, 52% down), and when part of the picture is cropped the text shrinks by the same share.
     On a 1920×1080 screen this is the Figma frame one to one. */
  let S = 1;
  const headShift = { x: 0, y: 0, k: 1 };      // where the headline block sits, so the cursor is measured in its own coordinates
  let limePlace = "";
  const limeO = document.getElementById("limeO");
  // the headline block first: the blocks that follow it need its place
  const anchored = [...document.querySelectorAll("[data-ax]")].sort((a, b) => (a.dataset.follow ? 1 : 0) - (b.dataset.follow ? 1 : 0));
  function fit() {
    const r = viewport.getBoundingClientRect();
    const vw = r.width || W, vh = r.height || H;
    S = Math.max(vw / W, vh / H) || 1;
    const tx = (vw - W * S) / 2, ty = (vh - H * S) / 2;
    stage.style.setProperty("--s", S);
    stage.style.setProperty("--tx", tx.toFixed(2) + "px");
    stage.style.setProperty("--ty", ty.toFixed(2) + "px");
    const cropX = -tx / S, cropY = -ty / S;
    const visW = W - 2 * cropX, visH = H - 2 * cropY;
    const u = Math.min(1, visW / W, visH / H);
    anchored.forEach((el) => {
      const ax = +el.dataset.ax, ay = +el.dataset.ay;
      let dx = cropX + ax * visW / W - ax;
      const dy = cropY + ay * visH / H - ay;
      // data-follow="head": same size as the headline and straight under it (the big O of the footer sits
      // under the O of MOTION); vertically it stays on the bottom edge
      if (el.dataset.follow) dx = 49 + headShift.x + (ax - 49) * headShift.k - ax;
      // data-fixed: keeps its size (the headline, the loader captions)
      const k = el.dataset.fixed ? 1 : el.dataset.follow ? headShift.k : u;
      if (el.classList.contains("grp--head")) {
        headShift.x = dx; headShift.y = dy; headShift.k = k;
        el.querySelectorAll(".hd, .lime-o, .deco").forEach((pc) => {
          const l = parseFloat(pc.style.left), t = parseFloat(pc.style.top);
          pc.style.transformOrigin = (ax - l) + "px " + (ay - t) + "px";
          const place = "translate(" + dx.toFixed(2) + "px," + dy.toFixed(2) + "px) scale(" + k.toFixed(4) + ")";
          if (pc.id === "limeO") { limePlace = place; limeO.style.transform = place + " " + (limeO.dataset.t || ""); }
          else pc.style.transform = place;
        });
        return;
      }
      el.style.transformOrigin = ax + "px " + ay + "px";
      el.style.transform = "translate(" + dx.toFixed(2) + "px," + dy.toFixed(2) + "px) scale(" + k.toFixed(4) + ")";
    });
  }
  fit();
  window.addEventListener("resize", fit);

  /* ---------- the lime Ø geometry (fitted on the artwork, 419×419) ---------- */
  const O = { cx: 220.3, cy: 222.9, rx: 94.75, ry: 146.2, a: 54.1 * Math.PI / 180 };
  const SLASH = [[70, 400], [392, 14]];
  function ringPoints(steps) {
    const pt = (t) => [O.cx + Math.cos(O.a) * O.rx * Math.cos(t) - Math.sin(O.a) * O.ry * Math.sin(t),
                       O.cy + Math.sin(O.a) * O.rx * Math.cos(t) + Math.cos(O.a) * O.ry * Math.sin(t)];
    let t0 = 0, best = Infinity;
    for (let t = 0; t < Math.PI * 2; t += 0.01) { const y = pt(t)[1]; if (y < best) { best = y; t0 = t; } }
    t0 += 0.35;
    const turn = Math.PI * 2 * 1.1, out = [];
    for (let i = 0; i <= steps; i++) out.push(pt(t0 - (turn * i) / steps));   // written anticlockwise, like a hand
    return out;
  }
  const RING = ringPoints(160);
  document.getElementById("oRing").setAttribute("d", RING.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(""));

  /* ---------- big letters: split, keeping the kerning of the font ---------- */
  function split(el) {
    const out = [];
    const box = el.getBoundingClientRect();
    const f = box.width / el.offsetWidth || S;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const items = [];
    const range = document.createRange();
    let n;
    while ((n = walker.nextNode())) {
      const ghost = n.parentNode.classList && n.parentNode.classList.contains("o-ghost");
      for (let i = 0; i < n.textContent.length; i++) {
        range.setStart(n, i); range.setEnd(n, i + 1);
        const r = range.getBoundingClientRect();
        items.push({ ch: n.textContent[i], x: (r.left - box.left) / f, w: r.width / f, ghost });
      }
    }
    el.style.width = box.width / f + "px";
    el.style.height = box.height / f + "px";
    el.textContent = "";
    items.forEach((it) => {
      const s = document.createElement("span");
      s.className = "ch" + (it.ghost ? " o-ghost" : "");
      s.textContent = it.ch;
      s.style.position = "absolute";
      s.style.left = it.x + "px";
      s.style.top = "0";
      el.appendChild(s);
      if (!it.ghost) out.push({ el: s, x: el.offsetLeft + it.x + it.w / 2, y: el.offsetTop + 200 });
    });
    return out;
  }

  /* ---------- the film without a break ---------- */
  let current = filmA, spare = filmB, filmLen = 10;
  const XF = 1.0;                                   // dissolve between laps, seconds
  const listeners = [];
  const onTime = (fn) => listeners.push(fn);
  function runFilm() {
    filmLen = isFinite(filmA.duration) ? filmA.duration : filmLen;
    current.currentTime = 0;
    current.classList.add("is-on");
    current.play().catch(() => {});
    // if the browser blocked autoplay (e.g. Low Power Mode in Safari), any tap starts the film
    stage.addEventListener("pointerdown", () => { if (current.paused) current.play().catch(() => {}); });
    let lastT = 0, handing = false;
    const tick = () => {
      const t = current.currentTime;
      listeners.forEach((fn) => fn(lastT, t));
      lastT = t;
      if (!handing && t >= filmLen - XF - 0.05) {
        handing = true;
        spare.currentTime = 0;
        spare.play().catch(() => {});
        const from = current, to = spare;
        to.style.zIndex = 1; from.style.zIndex = 0;
        to.animate([{ opacity: 0 }, { opacity: 1 }], { duration: XF * 1000, easing: "linear", fill: "forwards" }).finished.then(() => {
          from.pause();
          from.getAnimations().forEach((a) => a.cancel());
          from.classList.remove("is-on");
          to.classList.add("is-on");
          to.getAnimations().forEach((a) => a.cancel());
          current = to; spare = from; lastT = 0; handing = false;
        });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ---------- the headline: the wave that rolls through it (the letters stay crisp: no filters) ---------- */
  let letters = [];
  const lift = new Map();          // letter → current offset from waves and the cursor
  let waves = [];                  // travelling swells: {start, dur, amp}
  function rollWave(amp) { waves.push({ start: performance.now(), dur: 2600, amp }); }   // a slow swell, not a jolt
  let pointer = null;
  stage.addEventListener("pointermove", (e) => {
    const r = stage.getBoundingClientRect();
    // stage point → headline block point (the block is moved by headShift and scaled by headShift.k around (49, 563))
    const sx = (e.clientX - r.left) / S, sy = (e.clientY - r.top) / S;
    pointer = { x: 49 + (sx - headShift.x - 49) / headShift.k, y: 563 + (sy - headShift.y - 563) / headShift.k, t: performance.now() };
  });
  stage.addEventListener("pointerleave", () => { pointer = null; });

  const oLift = { y: 0, r: 0 };
  // smooth motion: a slow, wide swell; the tilt follows the slope of the swell (no flip at the crest);
  // easing is time-based, so it is equally soft at any frame rate
  const WAVE_W = 280, ease = (dt, rate) => 1 - Math.exp(-dt * rate);
  let lastNow = performance.now();
  const swellAt = (x, now, w) => {
    const p = clamp((now - w.start) / w.dur, 0, 1);
    const front = -350 + (p * p * (3 - 2 * p)) * 2000;   // eased run across the headline
    const d = (x - front) / WAVE_W;
    return { k: Math.exp(-d * d), slope: -2 * d * Math.exp(-d * d) };
  };
  function headlineLoop(now) {
    const dt = Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;
    const a = ease(dt, 7);
    waves = waves.filter((w) => now - w.start < w.dur + 800);
    letters.forEach((L) => {
      let y = 0, r = 0;
      waves.forEach((w) => {
        // the crest travels left to right across the headline
        const s = swellAt(L.x, now, w);
        y -= 26 * w.amp * s.k;
        r += 1.6 * w.amp * s.slope;
      });
      if (pointer) {
        const dx = L.x - pointer.x, dy = L.y - pointer.y;
        const k = Math.exp(-(dx * dx + dy * dy) / (2 * 190 * 190));
        y -= 22 * k;
      }
      const prev = lift.get(L) || { y: 0, r: 0 };
      const cur = { y: prev.y + (y - prev.y) * a, r: prev.r + (r - prev.r) * a };
      lift.set(L, cur);
      if (L.ready) {
        // at rest the letter has no transform at all, so the glyph is drawn sharp
        const still = Math.abs(cur.y) < 0.15 && Math.abs(cur.r) < 0.03;
        const t = still ? "" : "translateY(" + cur.y.toFixed(2) + "px) rotate(" + cur.r.toFixed(3) + "deg)";
        if (L.el.style.transform !== t) L.el.style.transform = t;
      }
    });
    // the Ø rides the wave too
    if (limeO.dataset.ready) {
      let w = 0, ws = 0;
      waves.forEach((v) => { const s2 = swellAt(1006, now, v); w += v.amp * s2.k; ws += v.amp * s2.slope; });
      // the cursor lifts the Ø like the letters around it (its centre: 1007, 628), with a little tilt
      let py = 0, pr = 0;
      if (pointer) {
        const dx = 1007 - pointer.x, dy = 628 - pointer.y;
        const k = Math.exp(-(dx * dx + dy * dy) / (2 * 190 * 190));
        py = -22 * k; pr = -3 * k * Math.sign(dx || 1);
      }
      oLift.y += (py - oLift.y) * a; oLift.r += (pr - oLift.r) * a;
      const y = -22 * w + oLift.y, r = 2.4 * ws + oLift.r;
      // the Ø tilts about its own centre (209.5, 209.5), not about the block's anchor
      const o = (limeO.style.transformOrigin || "0px 0px").split(" ").map(parseFloat);
      const px = 209.5 - o[0], pyv = 209.5 - o[1];
      const t = Math.abs(y) < 0.15 && Math.abs(r) < 0.03 ? "" : "translate(" + px + "px," + (pyv + y).toFixed(2) + "px) rotate(" + r.toFixed(3) + "deg) translate(" + (-px) + "px," + (-pyv) + "px)";
      if (limeO.dataset.t !== t) { limeO.dataset.t = t; limeO.style.transform = (limePlace + " " + t).trim(); }
    }
    requestAnimationFrame(headlineLoop);
  }

  /* ---------- page intro ---------- */
  const ring = document.getElementById("oRing");
  const slash = document.getElementById("oSlash");
  const show = (el) => el.classList.add("is-shown");
  function placeO() {
    // the loader brings the Ø in, already painted: just show it where it lands
    show(limeO);
    ring.style.strokeDashoffset = "0"; slash.style.strokeDashoffset = "0";
    document.getElementById("limeFull").style.opacity = "1";
    limeO.dataset.ready = "1";
  }
  function paintO() {
    show(limeO);
    ring.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 750, easing: "cubic-bezier(.5,.05,.3,1)", fill: "forwards" });
    const s = slash.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 300, delay: 680, easing: "cubic-bezier(.6,0,.2,1)", fill: "forwards" });
    s.finished.then(() => {
      document.getElementById("limeFull").animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, fill: "forwards" });
      flick();
      limeO.dataset.ready = "1";
    });
    return s.finished;
  }
  function flick() {
    const box = document.getElementById("limeDrops");
    for (let i = 0; i < 10; i++) {
      const d = document.createElement("span");
      d.className = "drop";
      const sz = 3 + Math.random() * 6;
      d.style.width = d.style.height = sz + "px";
      d.style.left = "388px"; d.style.top = "20px";
      box.appendChild(d);
      const ang = -Math.PI / 4 + (Math.random() - 0.5) * 1.2;
      const dist = 30 + Math.random() * 80;
      d.animate([
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        { transform: "translate(" + Math.cos(ang) * dist + "px," + (Math.sin(ang) * dist + 30) + "px) scale(.6)", opacity: 0 },
      ], { duration: 700 + Math.random() * 400, easing: "cubic-bezier(.2,.7,.4,1)", fill: "forwards" }).finished.then(() => d.remove());
    }
  }
  function emerge(list, delay, step) {
    list.forEach((L, i) => {
      show(L.el);
      const a = L.el.animate([
        { transform: "translateY(60%) rotate(5deg)", clipPath: "inset(-20% -60% 100% -30%)", opacity: 0 },
        { transform: "translateY(-4%) rotate(-.6deg)", clipPath: "inset(-20% -60% -20% -30%)", opacity: 1, offset: 0.7 },
        { transform: "none", clipPath: "inset(-20% -60% -20% -30%)", opacity: 1 },
      ], { duration: 1150, delay: delay + i * step, easing: swell, fill: "backwards" });
      a.finished.then(() => { a.cancel(); L.ready = true; });
    });
  }
  function typeOn(el, delay) {
    const text = el.dataset.type;
    el.textContent = "";
    setTimeout(() => {
      show(el);
      let i = 0;
      const id = setInterval(() => {
        i++;
        el.textContent = text.slice(0, i) + (i < text.length ? "_" : "");
        if (i >= text.length) clearInterval(id);
      }, 34);
    }, delay);
  }
  function slideIn(el, delay) {
    show(el);
    el.animate([{ opacity: 0, transform: "translateX(-18px)" }, { opacity: 1, transform: "none" }], { duration: 900, delay, easing: swell, fill: "backwards" });
  }

  let firstLetters = [], baseLetters = [], motionLetters = [];
  async function pageIn() {
    // the headline comes up out of the water and settles
    emerge(baseLetters, 0, 65);
    emerge(firstLetters, 0, 65);
    emerge(motionLetters, 150, 65);
    if (!limeO.classList.contains("is-shown")) { await wait(650); paintO(); }
    document.querySelectorAll(".deco.js-hide").forEach((el, i) => typeOn(el, 300 + i * 380));
    document.querySelectorAll(".menu a").forEach((el, i) => slideIn(el, 200 + i * 80));
    const cta = document.querySelector(".cta");
    show(cta);
    cta.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 500, fill: "backwards" });
    cta.querySelectorAll(".cta__b--top, .cta__k--top").forEach((p) => p.animate([{ transform: "translateY(13px)" }, { transform: "none" }], { duration: 900, delay: 500, easing: swell, fill: "backwards" }));
    cta.querySelectorAll(".cta__b--bottom, .cta__k--bottom").forEach((p) => p.animate([{ transform: "translateY(-13px)" }, { transform: "none" }], { duration: 900, delay: 500, easing: swell, fill: "backwards" }));
    document.querySelectorAll(".bullet").forEach((el, i) => {
      show(el);
      el.animate([{ transform: "scale(0)" }, { transform: "scale(1.6)", offset: 0.6 }, { transform: "scale(1)" }], { duration: 600, delay: 600 + i * 140, easing: "ease-out", fill: "backwards" });
    });
    document.querySelectorAll(".facts li").forEach((el, i) => slideIn(el, 680 + i * 140));
    document.querySelectorAll(".para .w").forEach((el) => {
      const x = parseFloat(el.style.left), y = parseFloat(el.style.top);
      show(el);
      el.animate([
        { clipPath: "inset(-20% 100% -20% 0)", transform: "translateX(-10px)", opacity: 0.2 },
        { clipPath: "inset(-20% 0 -20% 0)", transform: "none", opacity: 1 },
      ], { duration: 900, delay: 800 + (x - 1353) * 1.1 + (y - 946) * 4.5, easing: swell, fill: "backwards" });
    });
    const fo = document.getElementById("footO");
    show(fo);
    fo.animate([{ transform: "translateY(160px)" }, { transform: "none" }], { duration: 1400, delay: 400, easing: swell, fill: "backwards" })
      .finished.then(() => fo.animate([
        { transform: "translateY(0) rotate(0)" }, { transform: "translateY(-9px) rotate(-1.2deg)" },
        { transform: "translateY(0) rotate(0)" }, { transform: "translateY(-5px) rotate(1deg)" }, { transform: "translateY(0) rotate(0)" },
      ], { duration: 5200, iterations: Infinity, easing: "ease-in-out" }));
    // waves breaking in the film roll through the headline
    onTime((a, b) => {
      [1.05, 4.15].forEach((T, i) => { if (a < T && b >= T) rollWave(i ? 1 : 0.8); });
    });
  }

  /* ---------- loading screen: the T of TIDELINE and its lime dot; as the film loads the T moves left and the
     name is typed out letter by letter, the lime dot always just after the last letter like a cursor;
     the percent below. About 3 seconds. ---------- */
  const ld = document.getElementById("ld");
  const live = document.getElementById("ldA11y");
  const ldT = document.getElementById("ldT");
  const ldTm = ldT.parentElement;
  const ldDot = document.getElementById("ldDot");
  const ldPct = document.getElementById("ldPct");
  const WORD = "TIDELINE", DOT_GAP = 10, DOT = 30, TOP = 455;
  let prefix = [], capTop = 40, letterEls = [];
  function placeMark() {
    // one span per letter (kerning kept: each letter sits at the width of the text before it)
    let c = null;
    try { c = document.createElement("canvas").getContext("2d"); c.font = "600 140px Inter"; } catch (e) { /* fallback */ }
    prefix = [];
    for (let i = 0; i <= WORD.length; i++) prefix.push(c ? c.measureText(WORD.slice(0, i)).width : i * 86);
    if (c) {
      const m = c.measureText("T");
      const base = (170 - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
      capTop = base - m.actualBoundingBoxAscent;
    }
    ldT.textContent = "";
    letterEls = [...WORD].map((ch, i) => {
      const sp = document.createElement("span");
      sp.className = "ld-ch";
      sp.textContent = ch;
      sp.style.left = prefix[i] + "px";
      if (i) sp.style.visibility = "hidden";
      ldT.appendChild(sp);
      return sp;
    });
    ldDot.style.top = (TOP + capTop - 4) + "px";
  }
  // w = width of what is typed so far; the line (letters + dot) stays centred on the screen
  function layout(w) {
    // the line glides to stay centred; the dot jumps straight to the end of the last typed letter, like a cursor
    const left = 960 - (w + DOT_GAP + DOT) / 2;
    ldTm.style.transform = "translateX(" + left.toFixed(2) + "px)";
    ldDot.style.transform = "translateX(" + (left + prefix[shownLetters] + DOT_GAP).toFixed(2) + "px)";
  }
  let shownLetters = 1, wNow = 0;
  function drawLoader(p) {
    // typed: each letter appears at once, like a key press, as the film loads
    const want = 1 + Math.min(WORD.length - 1, Math.floor(p * (WORD.length - 1) + 1e-6));
    while (shownLetters < want) letterEls[shownLetters++].style.visibility = "visible";
    const v = Math.floor(p * 100) + "%";
    if (ldPct.textContent !== v) ldPct.textContent = v;
  }

  function pickSource() {
    const v = document.createElement("video");
    if (v.canPlayType('video/mp4; codecs="avc1.640028"')) return { url: "assets/film.mp4", size: 6151722, type: "video/mp4" };
    return { url: "assets/film.webm", size: 4064035, type: "video/webm" };
  }
  async function fetchFilm(onProgress) {
    const src = pickSource();
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
        onProgress(clamp(got / total, 0, 0.999));
      }
      return URL.createObjectURL(new Blob(chunks, { type: src.type }));
    } catch (e) {
      return src.url;
    }
  }
  const ready = (v) => new Promise((r) => (v.readyState >= 3 ? r() : v.addEventListener("canplaythrough", r, { once: true })));

  async function loading() {
    placeMark();
    const t0 = performance.now();
    const out = "cubic-bezier(.2,.9,.25,1)", inout = "cubic-bezier(.76,0,.24,1)";
    wNow = prefix[1];
    layout(wNow);
    // 1. the T comes up, the dot pops in beside it
    ldT.animate([{ transform: "translateY(105%)" }, { transform: "none" }], { duration: 600, easing: out, fill: "backwards" });
    ldDot.animate([{ scale: "0" }, { scale: "1.25", offset: 0.6 }, { scale: "1" }], { duration: 420, delay: 300, easing: "ease-out", fill: "backwards" });
    // the dot blinks like a cursor while the name is being typed
    const blink = ldDot.animate([{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0.2, offset: 0.55 }, { opacity: 0.2, offset: 0.95 }, { opacity: 1 }], { duration: 900, delay: 800, iterations: Infinity });
    // 2. as the film loads the name is typed out; the line glides so it stays centred
    let real = 0, shown = 0, last = t0, raf = 0, done = false;
    const START = 800, MIN = 2900;          // ≈4 s from the first frame to the curtain
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const cap = clamp((now - t0 - START) / (MIN - START), 0, 1);
      shown += (Math.min(real, cap) - shown) * Math.min(1, dt * 8);
      if (real >= 1 && cap >= 1 && shown > 0.995) shown = 1;
      drawLoader(shown);
      wNow += (prefix[shownLetters] - wNow) * (1 - Math.exp(-dt * 14));
      layout(wNow);
      if (!done) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const url = await fetchFilm((k) => { real = k; });
    real = 1;
    [filmA, filmB].forEach((v) => { v.src = url; v.load(); });
    await new Promise((r) => { const c = () => (shown >= 1 && Math.abs(wNow - prefix[WORD.length]) < 0.5 ? r() : setTimeout(c, 30)); c(); });
    await Promise.race([Promise.all([ready(filmA), ready(filmB)]), wait(1500)]);
    done = true;
    cancelAnimationFrame(raf);
    drawLoader(1);
    layout(prefix[WORD.length]);
    blink.cancel();
    live.textContent = "Loaded";
    await wait(350);
    // 3. everything goes, the black lifts off the film
    [ldTm, ldDot, ldPct].forEach((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: "ease", fill: "forwards" }));
    await wait(160);
    runFilm();
    const lift = document.getElementById("ldBg").animate([{ transform: "none" }, { transform: "translateY(-100%)" }], { duration: 900, easing: inout, fill: "forwards" });
    setTimeout(pageIn, 380);
    await lift.finished;
    ld.remove();
  }

  /* ---------- boot ---------- */
  const fontsReady = Promise.all([
    document.fonts ? document.fonts.load("800 285px Archivo") : null,
    document.fonts ? document.fonts.ready : null,
  ]).catch(() => {});
  fontsReady.then(async () => {
    if (reduced) {
      root.classList.remove("js-intro");
      ld.remove();
      return;
    }
    baseLetters = split(document.getElementById("firstBase"));
    firstLetters = split(document.getElementById("first"));
    motionLetters = split(document.getElementById("motion"));
    // the big O of the footer goes exactly under the O of MOTION (same font, same size: same glyph box)
    const mo = document.getElementById("motion");
    const oCh = mo.querySelectorAll(".ch")[1];
    document.getElementById("footO").style.left = (mo.offsetLeft + parseFloat(oCh.style.left)).toFixed(2) + "px";
    letters = baseLetters.concat(firstLetters, motionLetters);
    requestAnimationFrame(headlineLoop);
    await loading();
  });
})();
