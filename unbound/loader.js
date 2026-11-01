/* UN//BOUND loading screen: the set warms up.
   Light trails orbit the counter, bass dust jumps on every kick, the tempo climbs
   from 102 to 124 BPM with the loading progress; at 100% a short build-up, one beat
   of silence, then the drop: a flash, a shock ring and the screen is cut away in strips. */
window.unboundLoader = new Promise((resolveDone) => {
  "use strict";

  const el = document.getElementById("loader");
  if (!el) { resolveDone(); return; }
  const canvas = document.getElementById("loaderCanvas");
  const ctx = canvas.getContext("2d");
  const numEl = document.getElementById("loaderNum");
  const bars = [...document.querySelectorAll(".ld-eq i")];
  const logo = document.querySelector(".ld-logo");
  const statusEl = document.getElementById("loaderStatus");
  const tagEl = document.getElementById("loaderTag");
  const soundBtn = document.getElementById("loaderSound");
  const A = window.unboundAudio;
  // a tap anywhere on the loading screen turns the sound on (browsers only allow audio after a gesture)
  el.addEventListener("click", () => {
    if (!A || A.enabled) return;
    A.enable().then((ok) => { if (ok) soundBtn.textContent = "[ SOUND ON ]"; });
  });
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

  /* ---------- real progress: photo, cut-out, fonts ---------- */
  const imgs = [...document.querySelectorAll(".stage img")];
  const waitImg = (img) => (img.complete && img.naturalWidth ? Promise.resolve() : new Promise((r) => { img.addEventListener("load", r, { once: true }); img.addEventListener("error", r, { once: true }); }));
  const jobs = [...imgs.map(waitImg), document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()];
  let loaded = 0, done = 0;
  jobs.forEach((j) => j.then(() => { done++; loaded = done / jobs.length; }));
  setTimeout(() => { loaded = 1; }, 9000);

  if (reduced) {
    Promise.all(jobs).then(() => { numEl.textContent = "100"; el.classList.add("is-gone"); resolveDone(); });
    return;
  }

  /* ---------- canvas ---------- */
  let w = 0, h = 0, dpr = 1;
  function size() {
    const r = el.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  size();
  window.addEventListener("resize", size);

  const COLORS = [[255, 106, 42], [255, 140, 70], [255, 92, 38], [95, 180, 255], [150, 210, 255]];
  const trails = [];
  for (let i = 0; i < 90; i++) {
    const orange = Math.random() < 0.6;
    trails.push({
      a: rand(0, Math.PI * 2),
      w: rand(0.35, 0.9),
      rf: rand(0.75, 1.35),
      ry: rand(0.26, 0.42),
      dy: rand(-0.08, 0.12),
      lw: rand(1, 3.2),
      col: orange ? COLORS[(Math.random() * 3) | 0] : COLORS[3 + ((Math.random() * 2) | 0)],
      prev: null,
    });
  }
  const dust = [];
  for (let i = 0; i < 140; i++) {
    dust.push({ x: rand(0, 1), y: rand(0, 1), vx: 0, vy: 0, z: rand(0.2, 1), r: rand(0.8, 2.4), a: rand(0.3, 0.9), blue: Math.random() < 0.6, seed: rand(0, 99) });
  }
  const rings = [];

  /* ---------- the run ---------- */
  let t0 = 0, last = 0, shown = 0, beatPhase = 0, lastBeat = -1, speed = 1;
  let stage = "load", stageT = 0;      // load → build → silence → drop
  const MIN_LOAD = 3.2;

  function kick(power) {
    const cx = w / 2, cy = h * 0.47;
    for (const p of dust) {
      const dx = p.x * w - cx, dy = p.y * h - cy;
      const d = Math.hypot(dx, dy) || 1;
      const f = power * (60 + 140 * p.z) * Math.max(0, 1 - d / Math.max(w, h));
      p.vx += (dx / d) * f; p.vy += (dy / d) * f;
    }
  }

  function draw(t, dt, beat, intensity) {
    const cx = w / 2, cy = h * 0.47;
    const R = Math.min(w, h) * 0.3;
    // fading trails
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = `rgba(0,0,0,${1 - Math.exp(-dt * 3)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    const tilt = -0.13, c = Math.cos(tilt), s = Math.sin(tilt);
    for (const p of trails) {
      p.a += p.w * dt * speed;
      const rx = R * 1.5 * p.rf;
      const x0 = Math.cos(p.a) * rx, y0 = Math.sin(p.a) * rx * p.ry + p.dy * R;
      const q = { x: cx + x0 * c - y0 * s, y: cy + x0 * s + y0 * c, front: Math.sin(p.a) > 0 };
      if (p.prev) {
        const al = (q.front ? 0.6 : 0.22) * (0.5 + beat * 0.5) * intensity;
        const rgb = `${p.col[0]},${p.col[1]},${p.col[2]}`;
        ctx.strokeStyle = `rgba(${rgb},${al * 0.15})`;
        ctx.lineWidth = p.lw * 4;
        ctx.beginPath(); ctx.moveTo(p.prev.x, p.prev.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        ctx.strokeStyle = `rgba(${rgb},${al})`;
        ctx.lineWidth = p.lw;
        ctx.stroke();
      }
      p.prev = q;
    }
    // (bass dust removed: the loading screen stays black behind the counter)
    for (const p of []) {
      p.vx *= Math.exp(-dt * 2.5); p.vy *= Math.exp(-dt * 2.5);
      p.x += (p.vx * dt + Math.sin(t * 0.7 + p.seed) * 6 * dt) / w;
      p.y += (p.vy * dt - 8 * p.z * dt) / h;
      if (p.x < -0.05) p.x += 1.1; if (p.x > 1.05) p.x -= 1.1;
      if (p.y < -0.05) p.y += 1.1; if (p.y > 1.05) p.y -= 1.1;
      const a = p.a * (0.35 + beat * 0.65 * p.z) * intensity * 0.5;
      ctx.fillStyle = p.blue ? `rgba(150,205,255,${a})` : `rgba(255,150,90,${a})`;
      ctx.beginPath(); ctx.arc(p.x * w, p.y * h, p.r * (1 + beat * 0.6 * p.z), 0, Math.PI * 2); ctx.fill();
    }
    // shock rings around the counter: removed
    rings.length = 0;
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) { rings.splice(i, 1); continue; }
      const e = 1 - Math.pow(1 - k, 3);
      const rr = R * (0.4 + e * r.size);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(tilt);
      ctx.lineWidth = r.lw * (1 - k) + 0.5;
      ctx.strokeStyle = `rgba(95,180,255,${(1 - k) * r.a})`;
      ctx.beginPath(); ctx.ellipse(0, 0, rr * 1.5, rr * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(255,106,42,${(1 - k) * r.a * 0.8})`;
      ctx.beginPath(); ctx.ellipse(0, 5, rr * 1.45, rr * 0.43, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  function setCounter(v) {
    const n = Math.round(v * 100);
    let txt = String(n).padStart(3, "0");
    // a glitchy digit now and then while loading
    if (n < 100 && Math.random() < 0.06) txt = txt.slice(0, 2) + ((Math.random() * 10) | 0);
    numEl.textContent = txt;
    statusEl.textContent = n + "%";
    const lit = Math.round(v * bars.length);
    bars.forEach((b, i) => b.classList.toggle("is-lit", i < lit));
  }

  function frame(now) {
    if (!t0) { t0 = now; last = now; }
    const t = (now - t0) / 1000;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    // progress never outruns the real loading, and takes at least MIN_LOAD seconds
    const target = Math.min(clamp(t / MIN_LOAD, 0, 1), loaded);
    shown += (target - shown) * Math.min(1, dt * 5);
    if (target >= 1 && shown > 0.995) shown = 1;

    // tempo warms up with the progress: 102 → 124 BPM (the track runs at 124)
    const bpm = 102 + 22 * shown;
    let beat = 0, intensity = 1;
    if (stage === "load") {
      beatPhase += (dt * bpm) / 60;
      const idx = Math.floor(beatPhase);
      beat = Math.exp(-(beatPhase - idx) * 5);
      if (idx !== lastBeat) { lastBeat = idx; kick(1); if (A) A.hit("kick", 1); if (idx % 4 === 0) rings.push({ t: 0, dur: 1.4, size: 1.4, lw: 1.5, a: 0.45 }); }
      speed = 1 + shown * 0.8;
      setCounter(shown);
      if (shown >= 1) { stage = "build"; stageT = t; el.classList.add("is-build"); tagEl.textContent = "[ GET READY ]"; }
    } else if (stage === "build") {
      // snare roll: the hits come faster and faster
      const k = (t - stageT) / 1.1;
      const rate = 4 + 16 * k * k;
      beatPhase += dt * rate;
      const idx = Math.floor(beatPhase);
      beat = Math.exp(-(beatPhase - idx) * 6);
      if (idx !== lastBeat) { lastBeat = idx; kick(0.35 + k); if (A) A.hit("snare", 0.3 + k * 0.7); }
      speed = 1.8 + k * 3;
      numEl.textContent = "100";
      if (k >= 1) { stage = "silence"; stageT = t; el.classList.add("is-silence"); }
    } else if (stage === "silence") {
      // one beat of nothing before the drop
      intensity = 0.15;
      speed = 0.2;
      if (t - stageT > 0.42) {
        stage = "drop"; stageT = t;
        el.classList.remove("is-silence");
        el.classList.add("is-drop");
        tagEl.textContent = "[ DROP ]";
        kick(5);
        rings.push({ t: 0, dur: 1.2, size: 3.2, lw: 4, a: 0.95 });
        if (A && A.enabled) A.startSong(true);   // the loop's first kick lands on the drop
        resolveDone();                 // the page intro starts under the falling strips
        setTimeout(() => el.classList.add("is-gone"), 1400);
      }
    } else {
      intensity = Math.max(0, 1 - (t - stageT) / 0.9);
      speed = 2.2;
      beat = 1 - clamp((t - stageT) / 0.5, 0, 1);
    }

    el.style.setProperty("--beat", beat.toFixed(3));
    draw(t, dt, beat, intensity);
    if (!el.classList.contains("is-gone")) requestAnimationFrame(frame);
  }

  // occasional glitch on the logo
  const glitchTimer = setInterval(() => {
    if (el.classList.contains("is-gone")) { clearInterval(glitchTimer); return; }
    logo.classList.remove("is-glitch");
    void logo.offsetWidth;
    logo.classList.add("is-glitch");
  }, 1700);

  requestAnimationFrame(frame);
});
