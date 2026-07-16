/* ============================================================
   loader.js — capability detection + progress + audio.

   There is no GLB and no HDR to fetch, so "loading" here means
   compiling shaders and building geometry. The progress bar
   reports real work (renderer.compile) rather than faking a
   download that isn't happening.
   ============================================================ */

export function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext &&
      (c.getContext("webgl2") || c.getContext("webgl")));
  } catch (e) { return false; }
}

export function prefersReducedMotion() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* Rough device tier. Used to drop bloom/shadows on weak hardware
   rather than shipping everyone a slideshow. */
export function deviceTier() {
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const mobile = matchMedia("(pointer:coarse)").matches;
  if (mem <= 2 || cores <= 2) return "low";
  if (mobile || mem <= 4) return "mid";
  return "high";
}

/* ------------------------------------------------------------
   Synthesized SFX. No audio files: servos and clunks are cheap
   to make with oscillators and noise, and this way there's
   nothing to host, license, or wait on.

   Muted by default. Sound on a homepage without consent is
   hostile, so this only ever runs after a click.
   ------------------------------------------------------------ */
export function createSfx() {
  let ctx = null, muted = true;

  function ensure() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function noiseBuffer(c, dur) {
    const b = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    return b;
  }

  function servo(at, dur = 0.16, f0 = 320, f1 = 900) {
    const c = ensure();
    const o = c.createOscillator(), g = c.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(f1, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.05, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    const flt = c.createBiquadFilter(); flt.type = "bandpass"; flt.Q.value = 6;
    flt.frequency.value = 700;
    o.connect(flt).connect(g).connect(c.destination);
    o.start(at); o.stop(at + dur + 0.02);
  }

  function clunk(at) {
    const c = ensure();
    const s = c.createBufferSource(); s.buffer = noiseBuffer(c, 0.09);
    const g = c.createGain();
    g.gain.setValueAtTime(0.14, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
    const flt = c.createBiquadFilter(); flt.type = "lowpass"; flt.frequency.value = 380;
    s.connect(flt).connect(g).connect(c.destination);
    s.start(at); s.stop(at + 0.1);
  }

  return {
    get muted() { return muted; },
    setMuted(v) { muted = v; if (!v) ensure(); },
    arm() {
      if (muted) return;
      const c = ensure(), n = c.currentTime;
      servo(n, 0.3, 200, 520);
    },
    transform() {
      if (muted) return;
      const c = ensure(), n = c.currentTime;
      /* a burst of servos and clunks spread across the morph */
      for (let i = 0; i < 9; i++) {
        servo(n + i * 0.16 + Math.random() * 0.05, 0.12 + Math.random() * 0.1,
          220 + Math.random() * 260, 700 + Math.random() * 600);
      }
      [0.1, 0.55, 0.95, 1.45, 1.9].forEach((d) => clunk(n + d));
    },
  };
}
