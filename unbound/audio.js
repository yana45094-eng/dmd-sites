/* UN//BOUND sound, track 2 ("Night Shift"): a different original track, synthesized live with the
   Web Audio API. 124 BPM acid techno in D minor (Dm – B♭ – F – C): a rolling squelchy 303-style
   bassline, off-beat hats, rim shots and a short lead hook. 32-bar cycle: groove (8) → acid opens up (8)
   → full with the hook (8) → breakdown with riser and snare roll (4) → drop (4).
   Nothing is downloaded; every sound is generated here. The visuals read the beat position from here,
   so the pulses land on the kick. */
window.unboundAudio = (() => {
  "use strict";

  const BPM = 124, BEAT = 60 / BPM, STEP = BEAT / 4, BARS = 32;
  let ctx = null, master, comp, duck, verb, verbSend, delay, delaySend, noiseBuf;
  let enabled = false, playing = false, muted = false;
  let songStart = 0, nextStepTime = 0, stepIdx = 0, timer = null;
  let ambient = null;
  const dropHandlers = [];
  let skipFirstDrop = false;

  /* ---------- setup ---------- */
  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.0001;
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    master.connect(comp).connect(ctx.destination);

    // everything melodic goes through the "duck" bus that dips on every kick (sidechain feel)
    duck = ctx.createGain();
    duck.connect(master);

    // reverb from generated impulse
    verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.4);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    verb.buffer = ir;
    verbSend = ctx.createGain();
    verbSend.gain.value = 0.32;
    verbSend.connect(verb).connect(duck);

    // dotted-eighth delay for the arp and stabs
    delay = ctx.createDelay(1.5);
    delay.delayTime.value = BEAT * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const dlp = ctx.createBiquadFilter();
    dlp.type = "lowpass";
    dlp.frequency.value = 2600;
    delay.connect(dlp).connect(fb).connect(delay);
    delaySend = ctx.createGain();
    delaySend.gain.value = 0.3;
    delaySend.connect(delay);
    dlp.connect(duck);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    return true;
  }

  function noise(t, dur) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.start(t, Math.random() * 1.5, dur + 0.05);
    return s;
  }
  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  /* ---------- instruments ---------- */
  function kick(t, v = 1) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(165, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.13);
    env(g, t, 0.002, 0.95 * v, 0.42);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + 0.5);
    const c = noise(t, 0.01), cf = ctx.createBiquadFilter(), cg = ctx.createGain();
    cf.type = "highpass"; cf.frequency.value = 2500;
    env(cg, t, 0.001, 0.25 * v, 0.012);
    c.connect(cf).connect(cg).connect(master);
    // sidechain dip
    duck.gain.cancelScheduledValues(t);
    duck.gain.setValueAtTime(0.25, t);
    duck.gain.linearRampToValueAtTime(1, t + BEAT * 0.62);
  }
  function hat(t, open, v = 1) {
    const s = noise(t, open ? 0.25 : 0.05), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = "highpass"; f.frequency.value = open ? 6500 : 8000;
    env(g, t, 0.001, (open ? 0.12 : 0.07) * v, open ? 0.2 : 0.035);
    s.connect(f).connect(g).connect(master);
  }
  function clap(t, v = 1) {
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = "bandpass"; f.frequency.value = 1300; f.Q.value = 0.9;
    g.gain.setValueAtTime(0.0001, t);
    [0, 0.011, 0.022].forEach((o) => {
      g.gain.setValueAtTime(0.32 * v, t + o);
      g.gain.exponentialRampToValueAtTime(0.06 * v, t + o + 0.009);
    });
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    const s = noise(t, 0.22);
    s.connect(f).connect(g);
    g.connect(master);
    g.connect(verbSend);
  }
  function snare(t, v = 1) {
    const s = noise(t, 0.12), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = "bandpass"; f.frequency.value = 1800; f.Q.value = 0.7;
    env(g, t, 0.001, 0.22 * v, 0.1);
    s.connect(f).connect(g);
    g.connect(master); g.connect(verbSend);
  }
  function bass(t, freq, v = 1) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = "sawtooth"; o.frequency.value = freq;
    f.type = "lowpass"; f.Q.value = 6;
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(160, t + 0.1);
    env(g, t, 0.004, 0.32 * v, 0.1);
    o.connect(f).connect(g).connect(duck);
    o.start(t); o.stop(t + 0.16);
  }
  function stab(t, freqs, dur, v = 1, cutoff = 1400) {
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = "lowpass"; f.Q.value = 3;
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(cutoff * 0.35, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05 * v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    freqs.forEach((fr) => [-7, 7].forEach((det) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth"; o.frequency.value = fr; o.detune.value = det;
      o.connect(f);
      o.start(t); o.stop(t + dur + 0.05);
    }));
    f.connect(g);
    g.connect(duck); g.connect(delaySend); g.connect(verbSend);
  }
  function pluck(t, freq, v = 1) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = "square"; o.frequency.value = freq;
    f.type = "lowpass"; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.12);
    env(g, t, 0.003, 0.045 * v, 0.12);
    o.connect(f).connect(g);
    g.connect(duck); g.connect(delaySend);
    o.start(t); o.stop(t + 0.2);
  }
  function crash(t) {
    const s = noise(t, 1.8), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = "highpass"; f.frequency.value = 4500;
    env(g, t, 0.003, 0.16, 1.7);
    s.connect(f).connect(g);
    g.connect(master); g.connect(verbSend);
  }
  function riser(t, dur) {
    const s = noise(t, dur), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = "bandpass"; f.Q.value = 2.5;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + dur * 0.95);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
    s.connect(f).connect(g);
    g.connect(master); g.connect(verbSend);
  }

  // the acid bass: a saw through a very resonant low-pass that snaps shut after every note
  function acid(t, freq, accent, cutoff, slideTo) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + STEP * 0.9);
    f.type = "lowpass"; f.Q.value = accent ? 17 : 12;
    const top = cutoff * (accent ? 1.9 : 1);
    f.frequency.setValueAtTime(top, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(140, cutoff * 0.18), t + (accent ? 0.2 : 0.13));
    env(g, t, 0.003, (accent ? 0.2 : 0.13), STEP * (slideTo ? 1.1 : 0.85));
    o.connect(f).connect(g);
    g.connect(duck); g.connect(delaySend);
    o.start(t); o.stop(t + STEP * 1.4);
  }
  function rim(t, v = 1) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = "triangle"; o.frequency.setValueAtTime(1750, t);
    f.type = "highpass"; f.frequency.value = 900;
    env(g, t, 0.001, 0.09 * v, 0.03);
    o.connect(f).connect(g);
    g.connect(master); g.connect(delaySend);
    o.start(t); o.stop(t + 0.06);
  }
  function sub(t, freq) {           // a short sub under the kick in the full parts
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = freq;
    env(g, t, 0.01, 0.16, BEAT * 0.4);
    o.connect(g).connect(duck);
    o.start(t); o.stop(t + BEAT * 0.5);
  }

  // D minor: Dm – B♭ – F – C
  const CHORDS = [
    [293.66, 349.23, 440, 587.33],
    [233.08, 293.66, 349.23, 466.16],
    [349.23, 440, 523.25, 698.46],
    [261.63, 329.63, 392, 523.25],
  ];
  const ROOTS = [73.42, 58.27, 87.31, 65.41];
  // the acid line, one bar of 16ths (semitones over the chord root; null = rest), accents and slides
  const LINE   = [0, null, 12, 0,  null, 7, 0, 12,  0, null, 10, 0,  3, null, 12, 7];
  const ACCENT = [1, 0, 1, 0,  0, 1, 0, 1,  1, 0, 0, 0,  1, 0, 1, 0];
  const SLIDE  = [0, 0, 1, 0,  0, 0, 1, 0,  0, 0, 1, 0,  0, 0, 1, 0];
  // the hook: two bars of 8ths over D4 (semitones; null = rest)
  const HOOK = [12, null, 15, 12, null, 10, 7, null,  12, null, 15, 17, 15, null, 12, 10];
  const D4 = 293.66;
  const st = (f, n) => f * Math.pow(2, n / 12);

  /* ---------- sequencer ---------- */
  function scheduleStep(i, t) {
    const bar = Math.floor(i / 16) % BARS, s16 = i % 16, beat = Math.floor(s16 / 4), q = s16 % 4;
    const chord = Math.floor(bar / 2) % 4;
    const breakdown = bar >= 24 && bar < 28;
    const acidOpen = bar >= 8;
    const full = bar >= 16 && bar < 24 || bar >= 28;

    if (bar === 28 && s16 === 0) { crash(t); emitDrop(t); }
    if (i === 0) { crash(t); emitDrop(t); }

    if (!breakdown) {
      if (q === 0) { kick(t); if (full) sub(t, ROOTS[chord]); }
      // hats: open on the off-beat, ticking 16ths once the acid opens up
      if (q === 2) hat(t, true, 1);
      else if (acidOpen) hat(t, false, q === 0 ? 0.5 : 0.75);
      if (acidOpen && q === 0 && (beat === 1 || beat === 3)) clap(t);
      if (acidOpen && (s16 === 3 || s16 === 11 || (full && s16 === 14))) rim(t, s16 === 14 ? 0.7 : 1);
      // the acid line; its filter slowly opens and closes over 8 bars
      const n = LINE[s16];
      if (n !== null) {
        const sweep = 0.5 - 0.5 * Math.cos(((bar % 8) + s16 / 16) / 8 * Math.PI * 2);
        const cutoff = (acidOpen ? 420 : 260) + sweep * (acidOpen ? 2300 : 700);
        const next = LINE[(s16 + 1) % 16];
        const f = st(ROOTS[chord] * 2, n);
        acid(t, f, ACCENT[s16], cutoff, SLIDE[s16] && next !== null ? st(ROOTS[chord] * 2, next) : 0);
      }
      // the hook and short chord stabs in the full parts
      if (full && q % 2 === 0) {
        const h = HOOK[((bar % 2) * 8) + (s16 >> 1)];
        if (h !== null) pluck(t, st(D4, h), q === 0 ? 1 : 0.8);
      }
      if (full && (s16 === 6 || s16 === 14) && bar % 2 === 1) stab(t, CHORDS[chord], 0.18, 0.9, 1900);
    } else {
      // breakdown: a held chord that opens up, a riser and a snare roll into the drop
      const b = bar - 24;
      if (s16 === 0) stab(t, CHORDS[chord], BEAT * 4, 2.2, 600 + b * 700);
      if (b === 0 && s16 === 0) riser(t, BEAT * 16);
      if (b >= 2) {
        const density = b === 2 ? 4 : (beat < 2 ? 2 : 1);
        if (s16 % density === 0) snare(t, 0.35 + (b - 2) * 0.3 + s16 / 40);
      }
    }
  }

  function tick() {
    while (nextStepTime < ctx.currentTime + 0.14) {
      scheduleStep(stepIdx, nextStepTime);
      stepIdx++;
      nextStepTime += STEP;
    }
  }

  function emitDrop(t) {
    const first = skipFirstDrop;
    skipFirstDrop = false;
    if (first) return;
    const ms = Math.max(0, (t - ctx.currentTime) * 1000 + latency() * 1000);
    setTimeout(() => dropHandlers.forEach((f) => f()), ms);
  }
  const latency = () => (ctx && (ctx.outputLatency || ctx.baseLatency)) || 0;

  /* ---------- ambient bed while the page loads ---------- */
  function startAmbient() {
    if (ambient || !ctx) return;
    const t = ctx.currentTime;
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = "lowpass"; f.frequency.value = 500; f.Q.value = 2;
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.12; lg.gain.value = 260;
    lfo.connect(lg).connect(f.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 2.5);
    const oscs = [];
    CHORDS[0].forEach((fr) => [-9, 9].forEach((det) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth"; o.frequency.value = fr / 2; o.detune.value = det;
      o.connect(f); o.start(t); oscs.push(o);
    }));
    lfo.start(t);
    f.connect(g); g.connect(master); g.connect(verbSend);
    ambient = { g, oscs, lfo, f };
  }
  function stopAmbient(t) {
    if (!ambient) return;
    const a = ambient;
    ambient = null;
    a.g.gain.cancelScheduledValues(t);
    a.g.gain.setValueAtTime(Math.max(a.g.gain.value, 0.0001), t);
    a.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    a.oscs.forEach((o) => o.stop(t + 0.4));
    a.lfo.stop(t + 0.4);
  }

  /* ---------- public ---------- */
  const api = {
    BEAT,
    get enabled() { return enabled; },
    get playing() { return playing; },
    get muted() { return muted; },
    /** must be called from a click / tap */
    enable() {
      if (!ctx && !build()) return Promise.resolve(false);
      enabled = true;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), ctx.currentTime);
      master.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 0.4);
      muted = false;
      document.documentElement.classList.add("has-sound");
      return ctx.resume().then(() => { if (!playing) startAmbient(); return true; });
    },
    setMuted(m) {
      if (!ctx) return;
      muted = m;
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), t);
      master.gain.exponentialRampToValueAtTime(m ? 0.0001 : 0.9, t + 0.25);
      document.documentElement.classList.toggle("has-sound", !m);
    },
    /** one-shots for the loading screen */
    hit(type, v = 1) {
      if (!enabled || playing || !ctx) return;
      const t = ctx.currentTime + 0.01;
      if (type === "kick") kick(t, v * 0.7);
      else if (type === "snare") snare(t, v);
    },
    /** start the loop with its first kick right now; quietDrop: don't fire the visual drop for this first beat */
    startSong(quietDrop) {
      if (!enabled || playing || !ctx) return;
      playing = true;
      skipFirstDrop = !!quietDrop;
      songStart = ctx.currentTime + 0.03;
      stopAmbient(songStart);
      nextStepTime = songStart;
      stepIdx = 0;
      tick();
      timer = setInterval(tick, 25);
    },
    /** beats since the song started, as heard (output latency included) */
    beatPos() {
      if (!playing) return 0;
      return Math.max(0, (ctx.currentTime - latency() - songStart) / BEAT);
    },
    inBreak() {
      if (!playing) return false;
      const bar = Math.floor(api.beatPos() / 4) % BARS;
      return bar >= 24 && bar < 28;
    },
    onDrop(fn) { dropHandlers.push(fn); },
  };
  document.addEventListener("visibilitychange", () => {
    if (!ctx || !playing) return;
    if (document.hidden) ctx.suspend(); else if (!muted) ctx.resume();
  });
  return api;
})();
