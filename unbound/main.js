(() => {
  "use strict";

  const W = 1920, H = 1080;
  const BEAT = (window.unboundAudio && window.unboundAudio.BEAT) || 60 / 124;   // the same tempo as the track (124 BPM)
  const root = document.documentElement;
  const stage = document.getElementById("stage");
  const viewport = document.getElementById("viewport");
  const bg = document.getElementById("bg");
  const person = document.getElementById("person");
  const personLift = document.getElementById("personLift");
  const halo = document.getElementById("halo");
  const flash = document.getElementById("flash");
  const logo = document.querySelector(".logo");
  const ticketL = document.querySelector(".ticket__br--l");
  const ticketR = document.querySelector(".ticket__br--r");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);

  /* ------------------------------------------------------------------ */
  /*  Fit the 1920×1080 stage into the window                            */
  /* ------------------------------------------------------------------ */
  /* Full screen, no bars.
     - The picture (photo, cut-out, haze, smoke) COVERS the window. Its focus point is the headline row
       over his head, so the head keeps covering the same letters.
     - The type is laid out on the screen itself in blocks. Each block has an anchor at its Figma point
       (left edge, centre or right edge, top or bottom) and sits at the same share of the screen. It is
       scaled as a whole (K), so the alignment inside the block and the edge margins stay as in Figma. */
  let S = 1, TX = 0, TY = 0, K = 1;
  const FOCUS = { x: 960, y: 200 };
  // [elements, anchor x, anchor y] in Figma coordinates
  const BLOCKS = [
    [".head .t--wide", 409, 48],                                  // [ KEEP MOVING ]
    [".head .logo", 960, 45],                                     // centred
    [".menu", 1485.5, 48],
    [".ticket", 1871, 45],                                        // right edge = right margin
    [".hl[data-line='0'], .hl[data-line='1'], .hl[data-line='2']", 49, 110],   // LET / THE ELECTRIC ENERGY / TAKE
    [".t--reg24, .t--reg25, .t--medium16, .sound", 48, 517],      // dates + sound
    [".hl[data-line='3'], .hl[data-line='4'], .stage > .t--wide", 404, 693, "fit"],  // [GO INSANE] OVER TONIGHT
    [".info", 1408, 719],
    [".foot .t--light16:not(.t--right)", 49, 1034],               // bottom-left
    [".foot .t--medium18, .foot .age", 960, 1034],                // bottom-centre
    [".foot .t--right", 1872, 1034],                              // bottom-right
  ];
  const placed = [];
  // "fit" blocks scale strictly with the screen (K never larger than the height share), so a tall block in the
  // middle never runs into the footer on wide, low windows
  BLOCKS.forEach(([sel, ax, ay, mode]) => document.querySelectorAll(sel).forEach((el) => placed.push({ el, ax, ay, fit: mode === "fit" })));
  function fit() {
    const r = viewport.getBoundingClientRect();
    const vw = r.width || W, vh = r.height || H;
    S = Math.max(vw / W, vh / H) || 1;
    TX = Math.min(0, Math.max(vw - W * S, FOCUS.x * (vw / W - S)));
    TY = Math.min(0, Math.max(vh - H * S, FOCUS.y * (vh / H - S)));
    stage.style.setProperty("--s", S);
    stage.style.setProperty("--tx", TX.toFixed(2) + "px");
    stage.style.setProperty("--ty", TY.toFixed(2) + "px");
    K = Math.min(vw / W, (vh / H) * 1.25);
    const Kfit = Math.min(vw / W, vh / H);
    for (const p of placed) {
      const k = (p.fit ? Kfit : K) / S;
      const sx = p.ax * vw / W, sy = p.ay * vh / H;              // the anchor on the screen
      const dx = (sx - TX) / S - p.ax, dy = (sy - TY) / S - p.ay; // in stage coordinates
      // offsetLeft/Top ignore transforms, so the origin is the anchor in the element's own box
      p.el.style.transformOrigin = (p.ax - p.el.offsetLeft) + "px " + (p.ay - p.el.offsetTop) + "px";
      p.el.style.translate = dx.toFixed(2) + "px " + dy.toFixed(2) + "px";
      p.el.style.scale = k.toFixed(4);
      p.el.__g = { ax: p.ax, ay: p.ay, dx, dy, k };
    }
    sizeCanvases();
  }
  // a point of the stage → the same point in a placed element's own (Figma) coordinates
  function toLocal(g, x, y) {
    return { x: g.ax + (x - g.ax - g.dx) / g.k, y: g.ay + (y - g.ay - g.dy) / g.k };
  }

  /* ------------------------------------------------------------------ */
  /*  Canvases                                                            */
  /* ------------------------------------------------------------------ */
  const cTrails = document.getElementById("fxTrails");
  const cFog = document.getElementById("fxFog");
  const cSmoke = document.getElementById("fxSmoke");
  const xTrails = cTrails.getContext("2d");
  const xFog = cFog.getContext("2d");
  const xSmoke = cSmoke.getContext("2d");
  let qTrails = 1, qFog = 0.5, qSmoke = 0.6;

  function sizeCanvases() {
    const dpr = window.devicePixelRatio || 1;
    const q = clamp(S * dpr, 0.35, 1);
    qTrails = q;
    qFog = q * 0.8;
    qSmoke = q * 0.7;
    [[cTrails, qTrails], [cFog, qFog], [cSmoke, qSmoke]].forEach(([c, k]) => {
      const w = Math.round(W * k), h = Math.round(H * k);
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    });
  }

  /* soft smoke sprite, generated once */
  function makeSmokeSprite(size, tint, seed) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const x = c.getContext("2d");
    let s = seed;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * size * 0.28;
      const px = size / 2 + Math.cos(a) * d, py = size / 2 + Math.sin(a) * d;
      const pr = size * (0.06 + r() * 0.2);
      const g = x.createRadialGradient(px, py, 0, px, py, pr);
      g.addColorStop(0, `rgba(${tint},${0.10 + r() * 0.14})`);
      g.addColorStop(1, `rgba(${tint},0)`);
      x.fillStyle = g;
      x.beginPath(); x.arc(px, py, pr, 0, Math.PI * 2); x.fill();
    }
    x.globalCompositeOperation = "destination-in";
    const m = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    m.addColorStop(0, "rgba(0,0,0,1)");
    m.addColorStop(0.55, "rgba(0,0,0,.65)");
    m.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = m;
    x.fillRect(0, 0, size, size);
    return c;
  }
  const smokeSprites = [11, 29, 47, 83].map((sd) => makeSmokeSprite(192, "205,228,255", sd));
  const fogSprites = [7, 19, 61].map((sd) => makeSmokeSprite(256, "90,150,235", sd));

  /* ------------------------------------------------------------------ */
  /*  Pointer                                                             */
  /* ------------------------------------------------------------------ */
  const ptr = { x: -9999, y: -9999, px: -9999, py: -9999, active: false, speed: 0 };
  function toStage(e) {
    const r = stage.getBoundingClientRect();
    return { x: (e.clientX - r.left) / S, y: (e.clientY - r.top) / S };
  }
  stage.addEventListener("pointermove", (e) => {
    const p = toStage(e);
    ptr.active = true;
    ptr.x = p.x; ptr.y = p.y;
  });
  stage.addEventListener("pointerleave", () => { ptr.active = false; });

  /* ------------------------------------------------------------------ */
  /*  Headline letters: condense out of smoke, float, drift away         */
  /* ------------------------------------------------------------------ */
  const letters = [];
  function splitHeadline() {
    const lineDelay = [0.55, 0.75, 1.05, 1.25, 1.45];
    document.querySelectorAll(".hl").forEach((el) => {
      const node = el.firstChild;
      if (!node || node.nodeType !== 3) return;
      const text = node.textContent;
      const line = +el.dataset.line;
      const box = el.getBoundingClientRect();
      const sc = box.width / (el.offsetWidth || 1) || S;           // the element's scale on screen
      const w = box.width / sc, h = box.height / sc;
      const range = document.createRange();
      const items = [];
      for (let i = 0; i < text.length; i++) {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        items.push({ ch: text[i], x: (r.left - box.left) / sc, w: r.width / sc });
      }
      el.style.width = w + "px";
      el.style.height = h + "px";
      el.textContent = "";
      const ox = el.offsetLeft, oy = el.offsetTop;
      let k = 0;
      items.forEach((it) => {
        if (it.ch === " ") return;
        const s = document.createElement("span");
        s.className = "ch";
        s.textContent = it.ch;
        s.style.left = it.x + "px";
        el.appendChild(s);
        const L = {
          el: s, line: el,
          cx: ox + it.x + it.w / 2,
          cy: oy + h / 2,
          ox: rand(-90, 90), oy: rand(70, 170), vx: 0, vy: 0,
          rot: rand(-28, 28), vr: 0,
          phase: k * 0.55 + line * 1.7,
          delay: lineDelay[line] + k * 0.045 + rand(0, 0.12),
          shown: false,
        };
        if (!reduced) { s.style.opacity = "0"; }
        letters.push(L);
        k++;
      });
    });
  }

  /* wind gust that sweeps the screen every few seconds */
  const GUST_EVERY = 9, GUST_LEN = 3.6, GUST_FIRST = 6.5;
  function gustX(t) {
    if (t < GUST_FIRST) return null;
    const p = (t - GUST_FIRST) % GUST_EVERY;
    if (p > GUST_LEN) return null;
    return -500 + (p / GUST_LEN) * (W + 1000);
  }
  function gustAt(x, gx) {
    if (gx === null) return 0;
    const d = (x - gx) / 240;
    return Math.exp(-d * d);
  }

  function updateLetters(t, dt) {
    const gx = gustX(t);
    const K = 26, C = 7;
    for (const L of letters) {
      if (t < L.delay) continue;
      if (!L.shown) { L.shown = true; L.born = t; }
      const appear = easeOut(clamp((t - L.born) / 1.1, 0, 1));

      // still letters: no idle wave and no wind gust; only the cursor pushes them apart
      const idleY = 0;
      let tx = 0, ty = 0;

      if (ptr.active) {
        const lp = L.line.__g ? toLocal(L.line.__g, ptr.x, ptr.y) : ptr;
        const dx = L.cx - lp.x, dy = L.cy - lp.y;
        const d = Math.hypot(dx, dy) || 1, R = 240;
        if (d < R) {
          const f = Math.pow(1 - d / R, 2);
          tx += (dx / d) * f * 140;
          ty += (dy / d) * f * 140 - f * 50;
        }
      }

      L.vx += (K * (tx - L.ox) - C * L.vx) * dt;
      L.vy += (K * (ty - L.oy) - C * L.vy) * dt;
      L.ox += L.vx * dt;
      L.oy += L.vy * dt;
      L.vr += (14 * (L.ox * 0.07 - L.rot) - 5 * L.vr) * dt;
      L.rot += L.vr * dt;

      const disp = Math.hypot(L.ox, L.oy - idleY);
      const blur = Math.min(16, disp * 0.1);
      const op = appear * (1 - Math.min(0.6, disp / 300));
      L.el.style.transform = `translate3d(${L.ox.toFixed(2)}px,${L.oy.toFixed(2)}px,0) rotate(${L.rot.toFixed(2)}deg)`;
      L.el.style.opacity = op.toFixed(3);
      L.el.style.filter = blur > 0.35 ? `blur(${blur.toFixed(1)}px)` : "none";
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Small type: techno decode                                          */
  /* ------------------------------------------------------------------ */
  const GLYPHS = "01/\\<>[]_-+=*#%";
  function scramble(el, duration = 700) {
    const nodes = [];
    const walk = (n) => {
      if (n.nodeType === 3) { if (n.textContent.trim()) nodes.push(n); }
      else n.childNodes.forEach(walk);
    };
    walk(el);
    nodes.forEach((n) => { if (n.__final === undefined) n.__final = n.textContent; });
    el.classList.add("is-on");
    if (reduced) return;
    const t0 = performance.now();
    const tick = (now) => {
      const p = clamp((now - t0) / duration, 0, 1);
      nodes.forEach((n) => {
        const f = n.__final;
        let out = "";
        for (let i = 0; i < f.length; i++) {
          const c = f[i];
          const reveal = i / f.length < p * 1.15 - 0.15;
          out += c === " " || reveal ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        n.textContent = out;
      });
      if (p < 1) requestAnimationFrame(tick);
      else nodes.forEach((n) => (n.textContent = n.__final));
    };
    requestAnimationFrame(tick);
  }

  function introSmallType() {
    const els = [...document.querySelectorAll("[data-scramble]")];
    const order = (el) => {
      const r = el.getBoundingClientRect();
      return r.top * 0.4 + r.left * 0.6;
    };
    els.sort((a, b) => order(a) - order(b));
    els.forEach((el, i) => setTimeout(() => scramble(el, 650), 900 + i * 55));
  }

  document.querySelectorAll(".menu a, .logo, .ticket").forEach((a) => {
    a.addEventListener("pointerenter", () => {
      const target = a.classList.contains("ticket") ? a.querySelector(".ticket__txt") : a;
      scramble(target, 380);
      if (a === logo) glitch();
    });
  });

  function glitch() {
    if (reduced) return;
    logo.classList.remove("is-glitch");
    void logo.offsetWidth;
    logo.classList.add("is-glitch");
  }

  /* ------------------------------------------------------------------ */
  /*  Light trails orbiting the dancer                                   */
  /* ------------------------------------------------------------------ */
  const ORBIT = { cx: 1000, cy: 590, tilt: 0.13 };
  const trails = [];
  const TRAIL_COLORS = [
    [255, 106, 42], [255, 140, 70], [255, 170, 110], [255, 92, 38],
    [95, 180, 255], [150, 210, 255],
  ];
  for (let i = 0; i < 64; i++) {
    const orange = Math.random() < 0.62;
    const col = orange ? TRAIL_COLORS[(Math.random() * 4) | 0] : TRAIL_COLORS[4 + ((Math.random() * 2) | 0)];
    trails.push({
      a: rand(0, Math.PI * 2),
      w: rand(0.22, 0.62) * (Math.random() < 0.5 ? 1 : 1.25),
      rx: rand(620, 1120),
      ry: rand(0.2, 0.32),
      dy: rand(-60, 120),
      lw: rand(0.8, 2.6),
      col,
      prev: null,
      wobble: rand(0, 10),
    });
  }
  function orbitPos(p, t) {
    const x0 = Math.cos(p.a) * p.rx;
    const y0 = Math.sin(p.a) * p.rx * p.ry + p.dy + Math.sin(t * 0.7 + p.wobble) * 14;
    const c = Math.cos(ORBIT.tilt), s = Math.sin(ORBIT.tilt);
    return { x: ORBIT.cx + x0 * c - y0 * s, y: ORBIT.cy + x0 * s + y0 * c, depth: Math.sin(p.a) };
  }

  let boost = 0;
  function drawTrails(t, dt, beat) {
    const x = xTrails;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = "destination-out";
    x.fillStyle = `rgba(0,0,0,${1 - Math.exp(-dt * 3.2)})`;
    x.fillRect(0, 0, cTrails.width, cTrails.height);
    x.setTransform(qTrails, 0, 0, qTrails, 0, 0);
    x.globalCompositeOperation = "lighter";
    x.lineCap = "round";
    const speed = 1 + beat * 0.35 + boost;
    for (const p of trails) {
      p.a += p.w * dt * speed;
      const q = orbitPos(p, t);
      if (p.prev) {
        const front = q.depth > 0;
        const alpha = (front ? 0.55 : 0.2) * (0.6 + beat * 0.4);
        x.strokeStyle = `rgba(${p.col[0]},${p.col[1]},${p.col[2]},${alpha})`;
        x.lineWidth = p.lw * (front ? 1 : 0.6);
        x.beginPath();
        x.moveTo(p.prev.x, p.prev.y);
        x.lineTo(q.x, q.y);
        x.stroke();
      }
      p.prev = q;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Fog, bass dust and sound rings                                     */
  /* ------------------------------------------------------------------ */
  const fog = [];
  for (let i = 0; i < 14; i++) {
    const top = i < 4;
    fog.push({
      x: top ? rand(980, 1350) : rand(-200, W + 200),
      y: top ? rand(-40, 260) : rand(520, 1080),
      s: top ? rand(380, 620) : rand(520, 980),
      vx: top ? rand(4, 14) : rand(-14, 14),
      vy: top ? rand(-10, -3) : rand(-3, 3),
      r: rand(0, 6.28), vr: rand(-0.05, 0.05),
      a: top ? rand(0.18, 0.3) : rand(0.12, 0.22),
      img: fogSprites[i % fogSprites.length],
      top,
    });
  }
  /* Bass dust: specks of light hanging in the haze. They twinkle, drift,
     and jump outward from the dancer on every kick drum, like dust on a speaker. */
  const DUST_C = { x: 1000, y: 560 };
  const DUST_RGB = ["205,232,255", "120,190,255", "255,150,90"];
  function makeDot(rgb) {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, `rgba(${rgb},1)`);
    g.addColorStop(0.22, `rgba(${rgb},.9)`);
    g.addColorStop(0.5, `rgba(${rgb},.25)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g;
    x.fillRect(0, 0, 32, 32);
    return c;
  }
  function makeBokeh(rgb) {
    const c = document.createElement("canvas");
    c.width = c.height = 96;
    const x = c.getContext("2d");
    x.filter = "blur(2px)";
    const g = x.createRadialGradient(48, 48, 0, 48, 48, 40);
    g.addColorStop(0, `rgba(${rgb},.3)`);
    g.addColorStop(0.82, `rgba(${rgb},.42)`);
    g.addColorStop(0.94, `rgba(${rgb},.8)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g;
    x.beginPath(); x.arc(48, 48, 40, 0, Math.PI * 2); x.fill();
    return c;
  }
  const dotSprites = DUST_RGB.map(makeDot);
  const bokehSprites = DUST_RGB.map(makeBokeh);
  const dust = [];
  for (let i = 0; i < 230; i++) {
    const bokeh = i < 28;
    const z = bokeh ? rand(0, 0.3) : rand(0.3, 1);
    const ci = Math.random() < 0.22 ? 2 : (Math.random() < 0.5 ? 0 : 1);
    dust.push({
      x: rand(0, W), y: rand(0, H), vx: 0, vy: 0,
      dx: rand(-7, 7), dy: rand(-12, -2),
      size: bokeh ? rand(26, 64) : rand(2.2, 4.6) * (0.6 + z),
      a: bokeh ? rand(0.3, 0.5) : rand(0.6, 1),
      img: bokeh ? bokehSprites[ci] : dotSprites[ci],
      bokeh, z, seed: rand(0, 100),
    });
  }
  function kickDust(power, cx = DUST_C.x, cy = DUST_C.y) {
    for (const p of dust) {
      const dx = p.x - cx, dy = p.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      const f = power * (50 + 150 * p.z) * Math.max(0, 1 - d / 1800);
      p.vx += (dx / d) * f;
      p.vy += (dy / d) * f;
    }
  }
  let liveG = 0, beatG = 0;
  function drawDust(x, t, dt, gx) {
    for (const p of dust) {
      p.vx *= Math.exp(-dt * 2.4);
      p.vy *= Math.exp(-dt * 2.4);
      let fx = p.dx * (0.5 + p.z) + Math.sin(t * 0.6 + p.seed) * 6 + gustAt(p.x, gx) * 110;
      let fy = p.dy * (0.5 + p.z) + Math.cos(t * 0.5 + p.seed * 1.3) * 5 - gustAt(p.x, gx) * 40;
      // (the specks no longer swirl away from the cursor)
      p.x += (p.vx + fx) * dt;
      p.y += (p.vy + fy) * dt;
      const m = 80;
      if (p.x < -m) p.x += W + 2 * m; else if (p.x > W + m) p.x -= W + 2 * m;
      if (p.y < -m) p.y += H + 2 * m; else if (p.y > H + m) p.y -= H + 2 * m;

      const tw = 0.7 + 0.3 * Math.sin(t * (1.5 + p.z * 2) + p.seed);
      const flash = 1 + beatG * (p.bokeh ? 0.8 : 1.8) * p.z + (p.bokeh ? beatG * 0.5 : 0);
      x.globalAlpha = clamp(p.a * tw * flash * (0.25 + 0.75 * liveG), 0, 1);
      const sz = p.bokeh ? p.size * (1 + beatG * 0.08) : p.size * 5 * (1 + beatG * 0.35 * p.z);
      x.drawImage(p.img, p.x - sz / 2, p.y - sz / 2, sz, sz);
    }
    x.globalAlpha = 1;
  }
  const rings = [];
  function spawnRing() { /* the line around the dancer is removed */ }

  function drawFog(t, dt, beat, gx) {
    const x = xFog;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, cFog.width, cFog.height);
    x.setTransform(qFog, 0, 0, qFog, 0, 0);
    x.globalCompositeOperation = "lighter";

    for (const f of fog) {
      const wind = gustAt(f.x, gx) * 60;
      f.x += (f.vx + wind) * dt;
      f.y += f.vy * dt;
      f.r += f.vr * dt;
      if (f.top) {
        if (f.y < -f.s * 0.6) { f.y = rand(160, 300); f.x = rand(980, 1250); }
      } else {
        if (f.x > W + f.s) f.x = -f.s;
        if (f.x < -f.s) f.x = W + f.s;
      }
      x.save();
      x.globalAlpha = f.a * (0.85 + beat * 0.25);
      x.translate(f.x, f.y);
      x.rotate(f.r);
      x.drawImage(f.img, -f.s / 2, -f.s / 2, f.s, f.s);
      x.restore();
    }

    // (bass dust / bokeh specks removed)

    // sound rings around the dancer: removed (none are spawned any more)
    rings.length = 0;
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.t += dt;
      const p = r.t / r.max;
      if (p >= 1) { rings.splice(i, 1); continue; }
      const e = easeOut(p);
      const rx = 160 + e * (r.strong ? 1500 : 1050), ry = rx * 0.3;
      const a = (1 - p) * (r.strong ? 0.75 : 0.4);
      x.save();
      x.translate(r.x, r.y);
      x.rotate(ORBIT.tilt);
      x.lineWidth = (r.strong ? 3 : 1.6) * (1 - p) + 0.4;
      x.strokeStyle = `rgba(95,180,255,${a})`;
      x.beginPath(); x.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); x.stroke();
      x.strokeStyle = `rgba(255,106,42,${a * 0.8})`;
      x.beginPath(); x.ellipse(0, 6, rx * 0.96, ry * 0.96, 0, 0, Math.PI * 2); x.stroke();
      x.restore();
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Exhaled smoke in front of the face                                 */
  /* ------------------------------------------------------------------ */
  const MOUTH = { x: 1074, y: 302 };
  const BREATH = 5.2, EXHALE = 1.7;
  const puffs = [];
  function spawnPuff(x, y, o = {}) {
    puffs.push({
      x: x + rand(-6, 6), y: y + rand(-6, 6),
      vx: o.vx ?? rand(18, 52), vy: o.vy ?? rand(-62, -28),
      s: o.s ?? rand(16, 34), gs: o.gs ?? rand(26, 48),
      r: rand(0, 6.28), vr: rand(-0.5, 0.5),
      life: 0, max: o.max ?? rand(4.2, 6.8),
      a: o.a ?? rand(0.16, 0.3),
      img: smokeSprites[(Math.random() * smokeSprites.length) | 0],
      seed: rand(0, 100),
    });
  }
  let puffAcc = 0, trailAcc = 0;
  function drawSmoke(t, dt, gx) {
    const ph = t % BREATH;
    const rate = ph < EXHALE ? 30 * Math.sin((ph / EXHALE) * Math.PI) + 4 : 3;
    puffAcc += rate * dt;
    while (puffAcc > 1) { puffAcc--; spawnPuff(MOUTH.x, MOUTH.y); }

    // a thin wisp follows the cursor
    if (ptr.active) {
      const mv = Math.hypot(ptr.x - ptr.px, ptr.y - ptr.py);
      trailAcc += Math.min(mv, 80) * 0.12;
      while (trailAcc > 1 && puffs.length < 420) {
        trailAcc--;
        spawnPuff(ptr.x, ptr.y, { vx: rand(-12, 12), vy: rand(-30, -10), s: rand(10, 22), gs: rand(30, 55), max: rand(1.6, 2.6), a: rand(0.07, 0.13) });
      }
    }
    ptr.px = ptr.x; ptr.py = ptr.y;

    const x = xSmoke;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, cSmoke.width, cSmoke.height);
    x.setTransform(qSmoke, 0, 0, qSmoke, 0, 0);
    x.globalCompositeOperation = "lighter";

    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      p.life += dt;
      if (p.life > p.max) { puffs.splice(i, 1); continue; }
      // curl + buoyancy + gust + cursor stirring
      p.vx += (Math.sin(t * 1.3 + p.seed + p.y * 0.012) * 26 + 8) * dt + gustAt(p.x, gx) * 160 * dt;
      p.vy += (Math.cos(t * 1.1 + p.seed + p.x * 0.01) * 18 - 10) * dt;
      if (ptr.active) {
        const dx = p.x - ptr.x, dy = p.y - ptr.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 200) {
          const f = (1 - d / 200) * 260 * dt;
          p.vx += (dx / d) * f - (dy / d) * f * 0.8;
          p.vy += (dy / d) * f + (dx / d) * f * 0.8;
        }
      }
      p.vx *= 1 - 0.35 * dt; p.vy *= 1 - 0.35 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.s += p.gs * dt;
      p.r += p.vr * dt;
      const k = p.life / p.max;
      const fade = k < 0.12 ? k / 0.12 : Math.pow(1 - (k - 0.12) / 0.88, 1.6);
      x.save();
      x.globalAlpha = p.a * fade;
      x.translate(p.x, p.y);
      x.rotate(p.r);
      x.drawImage(p.img, -p.s / 2, -p.s / 2, p.s, p.s);
      x.restore();
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Bass drop on click / tap                                           */
  /* ------------------------------------------------------------------ */
  function drop(px, py) {
    boost = 2.4;
    spawnRing(px, py, true);
    kickDust(7, px, py);
    for (let i = 0; i < 26; i++) {
      const a = rand(0, Math.PI * 2), v = rand(40, 160);
      spawnPuff(px, py, { vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, s: rand(30, 60), gs: rand(50, 90), max: rand(2, 3.4), a: rand(0.12, 0.22) });
    }
    // the headline stays put on a drop (only the cursor moves its letters)
    flash.style.setProperty("--fx", (px / W) * 100 + "%");
    flash.style.setProperty("--fy", (py / H) * 100 + "%");
    flash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 650, easing: "cubic-bezier(.2,.7,.3,1)" });
    glitch();
  }
  stage.addEventListener("click", (e) => {
    if (e.target.closest("a, button")) return;
    const p = toStage(e);
    drop(p.x, p.y);
  });

  /* ------------------------------------------------------------------ */
  /*  Sound                                                              */
  /* ------------------------------------------------------------------ */
  const soundBtn = document.getElementById("soundBtn");
  const soundTxt = soundBtn.querySelector(".sound__txt");
  function syncSoundUI() {
    const A = window.unboundAudio;
    const on = !!(A && A.playing && !A.muted);
    soundTxt.textContent = on ? "[ SOUND ON ]" : "[ SOUND OFF ]";
    soundBtn.setAttribute("aria-pressed", on ? "true" : "false");
    soundBtn.classList.toggle("is-on", on);
  }
  soundBtn.addEventListener("click", () => {
    const A = window.unboundAudio;
    if (!A) return;
    if (!A.enabled) A.enable().then((ok) => { if (ok) { A.startSong(false); syncSoundUI(); } });
    else if (!A.playing) { A.startSong(false); syncSoundUI(); }
    else { A.setMuted(!A.muted); syncSoundUI(); }
  });
  if (window.unboundAudio) {
    // the drop of the track (and the first kick when started from here) fires the visual drop
    window.unboundAudio.onDrop(() => drop(ORBIT.cx, ORBIT.cy - 40));
  }

  /* ------------------------------------------------------------------ */
  /*  Main loop                                                          */
  /* ------------------------------------------------------------------ */
  let t0 = 0, last = 0, lastBeatIdx = -1, nextGlitch = 7;
  function frame(now) {
    if (!t0) { t0 = now; last = now; }
    const t = (now - t0) / 1000;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    // the pulse at the track tempo (124 BPM), starts after the intro
    const live = clamp((t - 2.2) / 1.5, 0, 1);
    // when the music plays, the pulse follows the actual kick drum
    const A = window.unboundAudio;
    const synced = !!(A && A.playing);
    const brk = synced && A.inBreak();
    const bt = synced ? A.beatPos() : t / BEAT;
    const beatIdx = Math.floor(bt);
    const beat = Math.exp(-(bt - beatIdx) * 5) * live * (brk ? 0.12 : 1);
    if (beatIdx !== lastBeatIdx && live > 0) {
      lastBeatIdx = beatIdx;
      if (!brk) {
        if (beatIdx % 8 === 0) spawnRing(ORBIT.cx, ORBIT.cy + 20, false);
        kickDust(beatIdx % 4 === 0 ? 1.7 : 1);
      }
    }
    soundBtn.style.setProperty("--b", synced && !A.muted ? beat.toFixed(3) : "0");
    boost *= Math.exp(-dt * 2.2);

    liveG = live; beatG = beat;
    const pump = 1 + beat * 0.0028;
    bg.style.transform = person.style.transform = personLift.style.transform = `scale(${pump.toFixed(5)})`;
    halo.style.opacity = (live * (0.16 + beat * 0.18)).toFixed(3);
    const kick = (beat * 3).toFixed(2);
    ticketL.style.translate = `-${kick}px 0`;
    ticketR.style.translate = `${kick}px 0`;

    if (t > nextGlitch) { glitch(); nextGlitch = t + rand(5, 9); }

    const gx = gustX(t);
    updateLetters(t, dt);
    // light trails (comets) around the dancer: removed
    drawFog(t, dt, beat, gx);
    drawSmoke(t, dt, gx);

    requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------ */
  /*  Boot                                                               */
  /* ------------------------------------------------------------------ */
  fit();
  window.addEventListener("resize", fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);   // widths change when the fonts arrive

  if (reduced) {
    root.classList.add("is-ready");
    return;
  }
  root.classList.add("js-intro");

  let booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    splitHeadline();
    root.classList.add("is-split");
    requestAnimationFrame(() => {
      root.classList.add("is-ready");
      syncSoundUI();
      introSmallType();
      requestAnimationFrame(frame);
    });
  }
  // the loading screen hands over at the drop; without it, start when the fonts are in
  if (window.unboundLoader) {
    window.unboundLoader.then(boot);
  } else {
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(boot);
    setTimeout(boot, 3000);
  }
})();
