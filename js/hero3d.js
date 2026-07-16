/* ============================================================
   hero3d.js — entry point.

   Owns: renderer, lifecycle, and the decision of whether to run
   at all. Nothing here knows how the robot is built or posed.

   Fallback strategy: if WebGL is unavailable or the visitor has
   asked for reduced motion, this module does nothing at all and
   the existing SVG machine in .hero__art stays on screen. The
   fallback isn't a placeholder — it's the previous version of
   this feature, already built and already accessible.
   ============================================================ */
import * as THREE from "three";
import { buildTransformer } from "./transformer.js";
import { createCameraRig } from "./camera.js";
import { createMouseController } from "./mouse-controller.js";
import { createAnimationController } from "./animation-controller.js";
import {
  buildEnvironment, buildPlatform, buildParticles, buildSmoke, buildComposer,
} from "./effects.js";
import { hasWebGL, prefersReducedMotion, deviceTier, createSfx } from "./loader.js";

const container = document.getElementById("hero-robot-container");

/* ---------- bail out cleanly, leaving the SVG fallback in place ---------- */
if (!container || !hasWebGL() || prefersReducedMotion()) {
  container && container.setAttribute("data-fallback", "true");
} else {
  init(container);
}

function init(container) {
  const tier = deviceTier();
  const svgStage = document.getElementById("stage");
  const sfx = createSfx();

  /* ---------- renderer ---------- */
  const renderer = new THREE.WebGLRenderer({
    antialias: tier !== "low", alpha: true, powerPreference: "high-performance",
  });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = tier !== "low";
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const rigCam = createCameraRig(container);
  scene.add(rigCam.pivot);

  buildEnvironment(renderer, scene);
  const platform = buildPlatform(scene);
  const particles = tier === "low" ? null : buildParticles(scene);
  const smoke = tier === "low" ? null : buildSmoke(scene);

  const machine = buildTransformer();
  scene.add(machine.root);

  const mouseCtl = createMouseController(container);
  const anim = createAnimationController(machine, {
    sfx,
    onState: (s) => {
      container.dataset.state = s;
      label && (label.textContent = s === "ROBOT" ? "Revert" : "Transform");
    },
  });

  /* ---------- post ---------- */
  let composer = null, bloom = null;
  if (tier === "high") {
    const p = buildComposer(renderer, scene, rigCam.camera,
      { w: container.clientWidth, h: container.clientHeight });
    composer = p.composer; bloom = p.bloom;
  }

  /* ---------- adaptive DPR: the cheapest quality lever there is ---------- */
  const MAX_DPR = tier === "high" ? 1.85 : tier === "mid" ? 1.4 : 1;
  let dpr = Math.min(devicePixelRatio || 1, MAX_DPR);
  renderer.setPixelRatio(dpr);
  composer && composer.setPixelRatio(dpr);

  /* ---------- UI ---------- */
  const ui = document.createElement("div");
  ui.className = "h3d__ui";
  ui.innerHTML =
    '<button class="h3d__btn" id="h3dBtn" type="button"><span id="h3dLabel">Transform</span></button>' +
    '<button class="h3d__btn h3d__btn--icon" id="h3dSnd" type="button" aria-pressed="false" ' +
    'aria-label="Enable sound" title="Sound">♪</button>';
  container.appendChild(ui);
  const label = ui.querySelector("#h3dLabel");
  ui.querySelector("#h3dBtn").addEventListener("click", () => anim.toggle());
  const sndBtn = ui.querySelector("#h3dSnd");
  sndBtn.addEventListener("click", () => {
    const on = sfx.muted;
    sfx.setMuted(!on);
    sndBtn.setAttribute("aria-pressed", String(on));
    sndBtn.setAttribute("aria-label", on ? "Disable sound" : "Enable sound");
  });

  /* click the canvas to transform */
  renderer.domElement.addEventListener("click", () => anim.toggle());

  /* ---------- resize ---------- */
  const ro = new ResizeObserver(() => {
    const { w, h } = rigCam.resize();
    renderer.setSize(w, h);
    composer && composer.setSize(w, h);
    bloom && bloom.setSize(w, h);
  });
  ro.observe(container);

  /* ---------- scroll reaction ---------- */
  let scrollV = 0;
  addEventListener("scroll", () => {
    const r = container.getBoundingClientRect();
    /* -1 when the hero is above the fold, +1 as it leaves — the robot
       looks down as you leave, which is why it reads as acknowledgement */
    scrollV = Math.max(-1, Math.min(1, -r.top / (innerHeight * 0.8)));
    anim.setScroll(scrollV);
  }, { passive: true });

  /* ---------- render loop: only while visible ---------- */
  let running = false, raf = null, last = performance.now();
  let frames = 0, fpsT = 0, degraded = false;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    mouseCtl.update(dt);
    anim.hover(mouseCtl.mouse.inside, dt);
    anim.update(dt, mouseCtl.mouse);
    rigCam.update(dt, mouseCtl.mouse);

    particles && particles.userData.tick(dt);
    if (smoke) {
      const on = anim.state === "BIKE" || anim.state === "ARMED";
      const p = new THREE.Vector3();
      machine.nodes.exhaustTip.getWorldPosition(p);
      smoke.userData.tick(dt, p, on ? 1 : 0);
    }

    /* platform ring breathes with state */
    const ring = platform.userData.ring;
    ring.material.opacity = 0.32 + Math.sin(now / 700) * 0.12 +
      (anim.state === "ARMED" ? 0.3 : 0);

    composer ? composer.render() : renderer.render(scene, rigCam.camera);

    /* ---- adaptive quality: measure, then back off once ---- */
    frames++; fpsT += dt;
    if (fpsT >= 1.5) {
      const fps = frames / fpsT;
      frames = 0; fpsT = 0;
      if (fps < 40 && !degraded) {
        degraded = true;
        dpr = Math.max(1, dpr - 0.35);
        renderer.setPixelRatio(dpr);
        composer && composer.setPixelRatio(dpr);
        if (bloom) bloom.strength = 0.4;
      }
    }
  }

  function start() { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { running = false; raf && cancelAnimationFrame(raf); raf = null; }

  /* only spin up when the hero is actually on screen, and stop the
     moment it isn't — a hero that renders while you read the footer
     is just a battery leak */
  new IntersectionObserver((es) => {
    es.forEach((e) => (e.isIntersecting ? start() : stop()));
  }, { threshold: 0.05 }).observe(container);

  document.addEventListener("visibilitychange", () => {
    document.hidden ? stop() : start();
  });

  /* WebGL is live — retire the SVG fallback */
  if (svgStage) svgStage.setAttribute("data-superseded", "true");
  container.dataset.state = "BIKE";
  container.dataset.ready = "true";

  /* ---------- disposal ---------- */
  addEventListener("pagehide", () => {
    stop(); ro.disconnect(); anim.dispose();
    scene.traverse((o) => {
      if (o.isMesh || o.isPoints || o.isSprite) {
        o.geometry && o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (!m) return;
          for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); }
          m.dispose();
        });
      }
    });
    platform.userData.mirror && platform.userData.mirror.dispose();
    composer && composer.dispose();
    renderer.dispose();
  });
}
