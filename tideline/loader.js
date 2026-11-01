/* TIDELINE loading screen — a roll of film.
   While the video downloads a 35 mm strip with stills from the film runs through the
   screen. The frames come out as negatives and are developed left to right as the
   download goes (a line of light marks how far). At 100% the strip slows down and stops
   on the first frame of the film, which grows to fill the screen and becomes the film. */
(function () {
  "use strict";

  const W = 1920, H = 1080;
  const FW = 480, FH = 270;          // frame on the strip (16:9, a quarter of the stage)
  const GAP = 24;                    // space between frames
  const P = FW + GAP;                // pitch
  const PAD = 12;
  const REB = 56;                    // rebate with sprocket holes and edge print
  const STRIP_TOP = (H - FH) / 2 - 10 - REB;
  const SPEED = 170;                 // px per second
  const COPIES = 3;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const outCubic = (k) => 1 - Math.pow(1 - k, 3);
  const inOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

  const STATUS = [
    [0.00, "LOADING THE ROLL"],
    [0.18, "EXPOSING"],
    [0.40, "DEVELOPING"],
    [0.62, "FIXING"],
    [0.82, "DRYING"],
    [0.97, "PROJECTING"],
  ];

  function pickSource(sources) {
    const v = document.createElement("video");
    if (sources.mp4 && v.canPlayType('video/mp4; codecs="avc1.640028"')) return { url: sources.mp4, size: sources.mp4Size };
    if (sources.webm && v.canPlayType('video/webm; codecs="vp9"')) return { url: sources.webm, size: sources.webmSize };
    return { url: sources.mp4 || sources.webm, size: sources.mp4Size };
  }

  function grainURL() {
    const c = document.createElement("canvas");
    c.width = c.height = 160;
    const g = c.getContext("2d");
    const img = g.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 34;
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL();
  }

  function create(opts) {
    const stage = opts.stage;
    const frames = opts.frames;              // urls; frames[0] is the first frame of the film
    const N = frames.length;
    const L = N * P;                         // one copy of the roll
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const minTime = reduced ? 0 : (opts.minTime || 1500);

    /* ---------- markup ---------- */
    const root = document.createElement("div");
    root.className = "fl";
    root.setAttribute("aria-hidden", "true");

    const strip = document.createElement("div");
    strip.className = "fl-strip";
    strip.style.top = STRIP_TOP + "px";
    strip.style.width = PAD * 2 + COPIES * L + "px";
    let printsTop = "", printsBot = "", cells = "";
    for (let c = 0; c < COPIES; c++) {
      for (let i = 0; i < N; i++) {
        const k = c * N + i;
        const x = PAD + k * P;
        const n = (k % 36) + 1;
        cells += '<div class="fl-frame" data-k="' + k + '" style="left:' + x + "px; background-image:url('" + frames[i] + "')\"></div>";
        printsTop += '<span style="left:' + (x + 4) + 'px">TIDELINE 400</span><span style="left:' + (x + 300) + 'px">▸ ' + n + "</span>";
        printsBot += '<span style="left:' + (x + 4) + 'px">' + n + 'A</span><span style="left:' + (x + 300) + 'px">7 DAYS ▸</span>';
      }
    }
    strip.innerHTML =
      '<div class="fl-rebate fl-rebate--top">' + printsTop + "</div>" +
      '<div class="fl-cells">' + cells + "</div>" +
      '<div class="fl-rebate fl-rebate--bottom">' + printsBot + "</div>";

    root.innerHTML =
      '<div class="fl-light" style="top:' + (STRIP_TOP - 40) + "px; height:" + (FH + 20 + REB * 2 + 80) + 'px"></div>' +
      '<div class="fl-ui">' +
      '<span class="fl-logo" style="left:49px; top:25px"><span class="logo__word">TIDELINE</span><span class="logo__dot">.</span></span>' +
      '<p class="fl-count" style="left:43px; top:890px"><span class="fl-num">0</span><span class="fl-unit">%</span></p>' +
      '<div class="fl-status" style="left:1394px; top:967px"><p>35 MM · TIDELINE 400</p><p class="fl-msg">LOADING THE ROLL</p><p class="fl-frameno">FRAME 00 / 36</p></div>' +
      "</div>" +
      '<div class="fl-grain" style="background-image:url(' + grainURL() + ')"></div>';
    root.insertBefore(strip, root.firstChild);
    stage.appendChild(root);

    const live = document.createElement("span");
    live.className = "sr-only";
    live.setAttribute("role", "status");
    live.textContent = "Loading";
    stage.appendChild(live);

    const cellEls = [...strip.querySelectorAll(".fl-frame")];
    const light = root.querySelector(".fl-light");
    const num = root.querySelector(".fl-num");
    const msg = root.querySelector(".fl-msg");
    const frameNo = root.querySelector(".fl-frameno");
    const uiEls = [...root.querySelectorAll(".fl-logo, .fl-count, .fl-status")];

    /* ---------- state ---------- */
    let real = 0, shown = 0, loaded = false;
    let t0 = performance.now();
    let x = opts.startX ? opts.startX() : 0;   // the roll starts at the left edge of the screen
    let mode = "load";           // load → stop → grow → done
    let stopFrom = 0, stopTo = 0, stopStart = 0;
    const STOP = 550;
    let raf = 0, last = performance.now();

    function place() { strip.style.transform = "translate3d(" + x.toFixed(2) + "px,0,0)"; }

    function develop(boundary) {
      for (const el of cellEls) {
        const k = +el.dataset.k;
        const cx = x + PAD + k * P + FW / 2;
        const dev = cx < boundary;
        if (dev !== el.classList.contains("is-dev")) el.classList.toggle("is-dev", dev);
      }
    }

    function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const cap = minTime ? clamp((now - t0) / minTime, 0, 1) : 1;
      const target = Math.min(real, cap);
      shown += (target - shown) * Math.min(1, dt * 9);
      if (target >= 1 && shown > 0.996) shown = 1;
      const pct = Math.floor(shown * 100);
      if (num.textContent !== String(pct)) num.textContent = pct;
      let s = STATUS[0][1];
      STATUS.forEach(([k, v]) => { if (shown >= k) s = v; });
      if (msg.textContent !== s) msg.textContent = s;
      const fn = "FRAME " + String(Math.round(shown * 36)).padStart(2, "0") + " / 36";
      if (frameNo.textContent !== fn) frameNo.textContent = fn;

      if (mode === "load") {
        x -= SPEED * dt;
        if (x < -L) x += L;
        place();
        // the developing line starts on the first frame of the roll and runs left to right
        const first = x + PAD;
        const B = first + shown * (W + FW / 2 - first);
        light.style.transform = "translate3d(" + B.toFixed(1) + "px,0,0)";
        light.style.opacity = shown < 1 ? "1" : "0";
        develop(B);
      } else if (mode === "stop") {
        const q = clamp((now - stopStart) / STOP, 0, 1);
        x = stopFrom + (stopTo - stopFrom) * outCubic(q);
        place();
        develop(W * 2);
        if (q >= 1) grow();
      }
      if (mode !== "done") raf = requestAnimationFrame(loop);
    }

    /* ---------- loading ---------- */
    let resolveLoad, urlOut = null;
    const loadedP = new Promise((r) => (resolveLoad = r));
    function checkDone() {
      if (loaded && shown >= 1) { resolveLoad(urlOut); return; }
      setTimeout(checkDone, 60);
    }
    async function fetchWithProgress(src) {
      const res = await fetch(src.url);
      if (!res.ok || !res.body) throw new Error("fetch failed");
      const total = +res.headers.get("content-length") || src.size || 0;
      const reader = res.body.getReader();
      const chunks = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        if (total) real = clamp(got / total, 0, 0.999);
      }
      const type = src.url.endsWith(".webm") ? "video/webm" : "video/mp4";
      return URL.createObjectURL(new Blob(chunks, { type }));
    }
    function load() {
      t0 = performance.now();
      place();
      raf = requestAnimationFrame(loop);
      const src = pickSource(opts.sources);
      fetchWithProgress(src)
        .then((url) => { urlOut = url; })
        .catch(() => { urlOut = src.url; })   // e.g. opened from disk: stream it instead
        .finally(() => { real = 1; loaded = true; checkDone(); });
      return loadedP;
    }

    /* ---------- reveal: stop on the first frame, then it grows into the film ---------- */
    let resolveCover;
    function reveal() {
      live.textContent = "Loaded";
      const p = new Promise((r) => (resolveCover = r));
      if (reduced) { cover(); finish(); return p; }
      // the next copy of frame 0 that lands in the middle of the screen, at least 500px away
      const centerX = (W - FW) / 2;
      let to = null;
      for (let c = 0; c < COPIES; c++) {
        const cand = centerX - PAD - c * L;
        if (cand <= x - 500) { to = cand; break; }
      }
      if (to === null) to = centerX - PAD - (COPIES - 1) * L;
      stopFrom = x; stopTo = to; stopStart = performance.now();
      strip.classList.add("is-final");     // frames still to come in are already developed
      mode = "stop";
      return p;
    }

    function grow() {
      mode = "grow";
      cancelAnimationFrame(raf);
      const hero = document.createElement("div");
      hero.className = "fl-hero";
      hero.style.backgroundImage = "url('" + opts.hero + "')";
      root.appendChild(hero);
      const sx = FW / W, sy = FH / H;
      const from = "translate(" + (W - FW) / 2 + "px," + (H - FH) / 2 + "px) scale(" + sx + "," + sy + ")";
      const ease = "cubic-bezier(.7,0,.2,1)";
      const k = opts.cover ? opts.cover() : 1;           // the film covers the whole screen
      const to = "translate(" + (1 - k) * W / 2 + "px," + (1 - k) * H / 2 + "px) scale(" + k + "," + k + ")";
      const a = hero.animate([{ transform: from }, { transform: to }], { duration: 600, easing: ease, fill: "forwards" });
      // the strip opens up: rebates fly off, the rest of the roll fades
      strip.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 350, delay: 120, easing: "ease", fill: "forwards" });
      strip.querySelector(".fl-rebate--top").animate([{ transform: "none" }, { transform: "translateY(-420px)" }], { duration: 600, easing: ease, fill: "forwards" });
      strip.querySelector(".fl-rebate--bottom").animate([{ transform: "none" }, { transform: "translateY(420px)" }], { duration: 600, easing: ease, fill: "forwards" });
      uiEls.forEach((el, i) => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 60 * i, fill: "forwards" }));
      a.finished.then(() => { cover(); setTimeout(finish, 60); });
    }

    function cover() { if (resolveCover) { resolveCover(); resolveCover = null; } }
    function finish() {
      mode = "done";
      cancelAnimationFrame(raf);
      const f = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" });
      f.finished.then(() => root.remove());
    }

    return { load, reveal };
  }

  window.TideLoader = { create };
})();
