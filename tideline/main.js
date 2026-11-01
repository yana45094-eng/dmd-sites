(() => {
  "use strict";

  const W = 1920, H = 1080;
  const T_TEXT = 0.5;     // seconds into the film: the text comes in almost at once
  const K = 1;            // timing scale for the text
  const root = document.documentElement;
  const stage = document.getElementById("stage");
  const viewport = document.getElementById("viewport");
  const film = document.getElementById("film");
  const replayBtn = document.getElementById("replayBtn");
  const playBtn = document.getElementById("playBtn");
  const lines = [...document.querySelectorAll(".hl")];
  const seven = document.getElementById("seven");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const swell = "cubic-bezier(.22,.9,.25,1)";

  /* ---------- fit ---------- */
  let S = 1;
  // The whole Figma frame scales as ONE picture that covers the screen, so the text, the car and the surfers
  // keep exactly the Figma relation. Whatever does not fit is cropped (mostly from the sand at the bottom),
  // and the header and the bottom row move in by that crop, so their margins to the screen edges stay as in Figma.
  const SKY = 0.5;          // the crop is shared equally between top and bottom
  function fit() {
    const r = viewport.getBoundingClientRect();
    S = Math.max(r.width / W, r.height / H) || 1;
    const ox = (r.width - W * S) / 2;            // <= 0
    const oy = (r.height - H * S) * SKY;         // <= 0
    const cropX = -ox / S, cropT = -oy / S, cropB = (H * S - r.height + oy) / S;
    stage.style.setProperty("--s", S);
    stage.style.setProperty("--ox", ox.toFixed(2) + "px");
    stage.style.setProperty("--oy", oy.toFixed(2) + "px");
    stage.style.setProperty("--gx", (-cropX).toFixed(2));
    stage.style.setProperty("--gyt", (-cropT).toFixed(2));
    stage.style.setProperty("--gyb", (-cropB).toFixed(2));
    stage.style.setProperty("--gy", (-(cropT + cropB) / 2).toFixed(2));
    stage.style.setProperty("--k", 1);
    // percent layout: every text block keeps the same share of the screen it has in the Figma frame
    // (e.g. the headline centre stays at 56.7% across and 40.2% down); sizes follow the picture
    const visW = W - 2 * cropX, visH = H - cropT - cropB;
    // text sizes in percent too: when part of the picture is cropped, the text shrinks by the same share,
    // so blocks never run into each other
    const u = Math.min(1, visW / W, visH / H);
    anchored.forEach((el) => {
      const ax = +el.dataset.ax, ay = +el.dataset.ay;
      const dy = cropT + ay * visH / H - ay;
      // the menu and the facts sit on the headline's right line (x 1394 in Figma, where SURFING and HERE end):
      // they follow the headline, which is placed by its centre (data-hx)
      const hx = el.dataset.hx ? +el.dataset.hx : null;
      const dx = hx === null ? cropX + ax * visW / W - ax : cropX + hx * visW / W + (ax - hx) * u - ax;
      el.style.transformOrigin = ax + "px " + ay + "px";
      el.style.transform = "translate(" + dx.toFixed(2) + "px," + dy.toFixed(2) + "px) scale(" + u.toFixed(4) + ")";
    });
  }
  const anchored = [...document.querySelectorAll("[data-ax]")];
  fit();
  window.addEventListener("resize", fit);

  /* ---------- headline letters (kerning kept by measuring each glyph) ---------- */
  const letters = [];
  function splitHeadline() {
    lines.forEach((el, li) => {
      const node = el.firstChild;
      if (!node || node.nodeType !== 3) return;
      const text = node.textContent;
      const box = el.getBoundingClientRect();
      const f = box.width / el.offsetWidth || S;   // the real on-screen scale of this line (stage and block together)
      const h = box.height / f;
      const range = document.createRange();
      const items = [];
      for (let i = 0; i < text.length; i++) {
        range.setStart(node, i); range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        items.push({ ch: text[i], x: (r.left - box.left) / f });
      }
      el.style.height = h + "px";
      el.textContent = "";
      items.forEach((it) => {
        const s = document.createElement("span");
        s.className = "ch";
        s.textContent = it.ch;
        s.style.left = it.x + "px";
        el.appendChild(s);
        letters.push({ el: s, line: li, x: el.offsetLeft + it.x });
      });
    });
  }

  /* ---------- the text moment: everything arrives from left to right ---------- */
  let running = [];
  const anim = (el, frames, opts) => { const o = Object.assign({ fill: "backwards" }, opts); o.duration *= K; o.delay = (o.delay || 0) * K; const a = el.animate(frames, o); running.push(a); return a; };
  const show = (el) => el.classList.add("is-shown");

  function textIn() {
    // headline rises out of the water like a swell running left to right
    letters.forEach((L) => {
      // letters rise out of the line, one after another left to right, under a mask at the baseline
      // (each line starts a beat after the one above, so the three words overlap softly)
      const idx = letters.filter((o) => o.line === L.line).indexOf(L);
      const delay = L.line * 0.16 + idx * 0.05;
      anim(L.el, [
        { transform: "translateY(105%)", opacity: 0 },
        { transform: "translateY(30%)", opacity: 1, offset: 0.45 },
        { transform: "translateY(0)", opacity: 1 },
      ], { duration: 1150, delay: delay * 1000, easing: "cubic-bezier(.16,1,.3,1)" });
    });
    lines.forEach((el) => {
      show(el);
      el.classList.add("is-masked");
      setTimeout(() => el.classList.remove("is-masked"), 2200);
    });
    // copy is washed in like a wave running up the sand
    const wash = (el, d) => { show(el); anim(el, [{ clipPath: "inset(-10% 100% -10% 0)", transform: "translateX(-14px)", opacity: 0.2 }, { clipPath: "inset(-10% 0 -10% 0)", transform: "translateX(0)", opacity: 1 }], { duration: 1100, delay: d * 1000, easing: swell }); };
    const slide = (el, d) => { show(el); anim(el, [{ opacity: 0, transform: "translateX(-18px)" }, { opacity: 1, transform: "none" }], { duration: 900, delay: d * 1000, easing: swell }); };
    slide(document.querySelector(".logo"), 0);
    document.querySelectorAll(".copy .js-wash").forEach((el, i) => wash(el, 0.2 + i * 0.08));
    document.querySelectorAll(".menu .js-in").forEach((el, i) => slide(el, 0.3 + i * 0.06));
    slide(document.querySelector(".cta"), 0.5);
    document.querySelectorAll(".facts .js-wash").forEach((el, i) => wash(el, 0.55 + i * 0.08));
    // the 7 rolls up like an odometer, DAYS follows
    show(seven);
    anim(seven.querySelector(".seven__num"), [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }], { duration: 650, delay: 300, easing: swell });
    const days = document.querySelector(".t--days");
    show(days);
    anim(days, [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 600, delay: 450, easing: swell });
  }
  function textOut() {
    running.forEach((a) => a.cancel());
    running = [];
    document.querySelectorAll(".is-shown").forEach((el) => el.classList.remove("is-shown"));
  }

  /* ---------- the surfers in front of the headline ----------
     Every frame of the film carries the surfers' matte under the picture (rows 1080–1410).
     The matte becomes the alpha of the same pixels and is drawn above the headline. */
  const FG = { x: 1180, y: 480, w: 380, h: 330, my: 1080 };
  const fg = document.getElementById("fgGuys");
  const fctx = fg.getContext("2d");
  const buf = document.createElement("canvas");
  buf.width = FG.w; buf.height = FG.h * 2;
  const bctx = buf.getContext("2d", { willReadFrequently: true });
  function drawGuys() {
    if (film.readyState < 2) return;
    try {
      bctx.drawImage(film, FG.x, FG.y, FG.w, FG.h, 0, 0, FG.w, FG.h);
      bctx.drawImage(film, 0, FG.my, FG.w, FG.h, 0, FG.h, FG.w, FG.h);
      const pic = bctx.getImageData(0, 0, FG.w, FG.h);
      const mat = bctx.getImageData(0, FG.h, FG.w, FG.h).data;
      const d = pic.data;
      for (let i = 0; i < d.length; i += 4) {
        const a = (mat[i] - 12) * 1.12;          // lift the codec's black level, keep soft edges
        d[i + 3] = a < 0 ? 0 : a > 255 ? 255 : a;
      }
      fctx.putImageData(pic, 0, 0);
    } catch (e) { /* a tainted or not-yet-decoded frame: skip it */ }
  }
  if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
    const onFrame = () => { drawGuys(); film.requestVideoFrameCallback(onFrame); };
    film.requestVideoFrameCallback(onFrame);
  } else {
    const loopGuys = () => { if (!film.paused) drawGuys(); requestAnimationFrame(loopGuys); };
    requestAnimationFrame(loopGuys);
  }
  film.addEventListener("seeked", drawGuys);
  film.addEventListener("loadeddata", drawGuys);

  /* ---------- playback ---------- */
  let textShown = false;
  function tick() {
    if (!textShown && film.currentTime >= T_TEXT) { textShown = true; textIn(); }
    if (!film.paused && !film.ended) requestAnimationFrame(tick);
  }
  film.addEventListener("play", () => { playBtn.hidden = true; replayBtn.hidden = true; requestAnimationFrame(tick); });
  film.addEventListener("ended", () => { replayBtn.hidden = false; if (!textShown) { textShown = true; textIn(); } });

  function start() {
    const p = film.play();
    if (p && p.catch) p.catch(() => { playBtn.hidden = false; });
  }
  playBtn.addEventListener("click", start);
  // if the browser blocked autoplay (e.g. Low Power Mode in Safari), any tap starts the film
  stage.addEventListener("pointerdown", () => { if (ready && film.paused) start(); });
  replayBtn.addEventListener("click", () => {
    textOut();
    textShown = false;
    film.currentTime = 0;
    start();
  });

  /* ---------- boot: the tide loader fetches the film, then a wave reveals it ---------- */
  let ready = false;
  const loader = window.TideLoader.create({
    stage,
    sources: { mp4: "assets/film.mp4", mp4Size: 2334518, webm: "assets/film.webm", webmSize: 3929819 },
    frames: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => "assets/strip/s" + i + ".jpg"),
    hero: "assets/poster.jpg",
    startX: () => -parseFloat(stage.style.getPropertyValue("--gx") || 0),
    cover: () => parseFloat(stage.style.getPropertyValue("--k") || 1),
  });
  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.all([fontsReady, loader.load()]).then(([, url]) => {
    film.src = url;
    film.load();
    if (reduced) {
      // no motion: the last frame of the film with the text in place
      root.classList.remove("js-intro");
      film.addEventListener("loadedmetadata", () => { film.currentTime = Math.max(0, film.duration - 0.05); }, { once: true });
      ready = true;
      replayBtn.hidden = false;
      replayBtn.textContent = "[ PLAY THE FILM ]";
      replayBtn.addEventListener("click", () => { root.classList.add("js-intro"); }, { once: true });
      loader.reveal();
      return;
    }
    splitHeadline();
    // the loader stops on the first frame and grows it to full screen, then the film rolls.
    // Safari on iPhone may hold back "canplay" until playback is asked for, so don't wait for it forever.
    let revealed = false;
    const go = () => {
      if (revealed) return;
      revealed = true;
      loader.reveal().then(() => { ready = true; start(); });
    };
    film.addEventListener("canplay", go, { once: true });
    film.addEventListener("loadeddata", go, { once: true });
    setTimeout(go, 1500);
  });
})();
