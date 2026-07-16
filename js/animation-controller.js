/* ============================================================
   animation-controller.js — the state machine.

     BIKE ──hover 2s──> ARMED ──click──> MORPHING ──> ROBOT
      ^                   |                             |
      |                   └── unhover ──────────────────┘
      └──────────── 20s idle ────────────────────────────┘

   Per-frame behaviour is additive on TOP of the pose the timeline
   wrote. That's why look-at doesn't fight the transformation:
   the timeline owns base rotation, this owns the offset.
   ============================================================ */
import * as THREE from "three";
import { gsap } from "gsap";

const DEG = THREE.MathUtils.degToRad;
const LIMIT = { head: DEG(35), chest: DEG(10), shoulder: DEG(8) };

export function createAnimationController(rig, opts = {}) {
  const { nodes, POSES } = rig;
  const onState = opts.onState || (() => {});
  const sfx = opts.sfx || null;

  let state = "BIKE";
  let tl = null;
  let hoverT = 0, idleT = 0, t = 0;
  let scrollLean = 0;

  /* base rotations captured per frame from the pose, so additive
     offsets never accumulate */
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();

  function setState(s) { state = s; onState(s); }

  /* ---------- the transformation ---------- */
  function buildTimeline(to) {
    const pose = to === "ROBOT" ? POSES.ROBOT : POSES.BIKE;
    const t0 = to === "ROBOT";
    const tl = gsap.timeline({
      defaults: { duration: 1.15, ease: "power3.inOut" },
      onComplete: () => setState(to),
    });

    const at = (name, time, over = {}) => {
      const n = nodes[name]; const p = pose[name];
      if (!n || !p) return;
      tl.to(n.position, { x: p[0], y: p[1], z: p[2], ...over }, time);
      tl.to(n.rotation, { x: p[3], y: p[4], z: p[5], ...over }, time);
    };

    /* choreography: unlock → unfold limbs → stand → head last.
       Reversed for the way back, so it never looks like a rewind. */
    const seq = t0
      ? [["swing", 0], ["frontEnd", 0.05], ["tail", 0.1],
         ["hipL", 0.2], ["hipR", 0.24], ["thighL", 0.3], ["thighR", 0.34],
         ["shinL", 0.4], ["shinR", 0.44], ["footL", 0.5], ["footR", 0.54],
         ["pelvis", 0.45], ["core", 0.55], ["tank", 0.6], ["ribs", 0.6],
         ["shoulderL", 0.7], ["shoulderR", 0.74], ["armUpL", 0.8], ["armUpR", 0.84],
         ["armLoL", 0.9], ["armLoR", 0.94], ["handL", 1.0], ["handR", 1.04],
         ["exhaust", 0.8], ["lamp", 0.9], ["neck", 1.1], ["head", 1.2]]
      : [["head", 0], ["neck", 0.05], ["armLoL", 0.15], ["armLoR", 0.18],
         ["armUpL", 0.25], ["armUpR", 0.28], ["handL", 0.15], ["handR", 0.18],
         ["shoulderL", 0.35], ["shoulderR", 0.38], ["lamp", 0.3],
         ["core", 0.45], ["tank", 0.45], ["ribs", 0.45], ["tail", 0.5],
         ["pelvis", 0.55], ["exhaust", 0.5],
         ["footL", 0.6], ["footR", 0.62], ["shinL", 0.68], ["shinR", 0.7],
         ["thighL", 0.75], ["thighR", 0.78], ["hipL", 0.85], ["hipR", 0.88],
         ["frontEnd", 0.95], ["swing", 1.0]];

    for (const [name, time] of seq) at(name, time);

    /* the 90° swing to face the camera — the beat that sells it */
    tl.to(nodes.root.rotation, {
      y: pose.root[4], duration: 1.5, ease: "power2.inOut",
    }, t0 ? 0.5 : 0.4);

    /* a small crouch-and-rise rather than a linear lift */
    if (t0) {
      tl.to(nodes.pelvis.position, { y: 0.72, duration: 0.5, ease: "power2.out" }, 0.35)
        .to(nodes.pelvis.position, { y: 1.04, duration: 0.85, ease: "back.out(1.5)" }, 0.85);
    }

    /* eyes ignite on the last beat, not the first */
    const eyes = nodes.eyes || [];
    tl.to(eyes.map((m) => m), {
      emissiveIntensity: t0 ? 2.6 : 0, duration: t0 ? 0.5 : 0.3, ease: "power2.out",
    }, t0 ? 1.55 : 0);

    return tl;
  }

  function transform(to) {
    if (state === "MORPHING") return;
    if (tl) tl.kill();
    setState("MORPHING");
    sfx && sfx.transform();
    tl = buildTimeline(to);
  }

  function toRobot() { if (state === "BIKE" || state === "ARMED") transform("ROBOT"); }
  function toBike() { if (state === "ROBOT") transform("BIKE"); }
  function toggle() { state === "ROBOT" ? toBike() : toRobot(); }

  /* ---------- hover arming ---------- */
  function hover(isOver, dt) {
    if (state !== "BIKE" && state !== "ARMED") return;
    if (isOver) {
      hoverT += dt;
      if (hoverT > 2 && state === "BIKE") { setState("ARMED"); sfx && sfx.arm(); }
    } else {
      hoverT = 0;
      if (state === "ARMED") setState("BIKE");
    }
  }

  function setScroll(v) { scrollLean = THREE.MathUtils.clamp(v, -1, 1); }

  /* ---------- per-frame additive behaviour ---------- */
  function update(dt, mouse) {
    t += dt;

    /* auto-revert after inactivity */
    if (state === "ROBOT") {
      idleT += dt;
      if (idleT > 20) { idleT = 0; toBike(); }
      if (mouse.idle < 0.1) idleT = 0;
    } else idleT = 0;

    const armed = state === "ARMED";
    const isRobot = state === "ROBOT";
    const morphing = state === "MORPHING";

    /* LED / lamp response — brighter when armed, pulsing always */
    const pulse = 0.5 + Math.sin(t * 1.9) * 0.5;
    for (const m of nodes.lamps || []) {
      m.emissiveIntensity = (isRobot ? 0.35 : 1.0) + pulse * (armed ? 1.5 : 0.45);
    }
    if (rig.materials.led) {
      rig.materials.led.emissiveIntensity = 1.0 + pulse * (armed ? 2.2 : 0.6);
    }

    if (morphing) return;   /* the timeline owns everything mid-morph */

    if (isRobot) {
      /* head / eyes track the cursor, damped, clamped */
      const yaw = -mouse.x * LIMIT.head;
      const pitch = mouse.y * LIMIT.head * 0.45;
      const head = nodes.head;
      e.set(pitch, yaw, 0);
      q.setFromEuler(e);
      head.quaternion.slerp(q, 0.07);

      const neck = nodes.neck;
      e.set(pitch * 0.3, yaw * 0.3, 0);
      neck.quaternion.slerp(q.setFromEuler(e), 0.05);

      /* chest follows a fraction, delayed — that lag is what makes it
         feel like a body rather than a turret */
      const core = nodes.core;
      e.set(0, -mouse.x * LIMIT.chest, scrollLean * 0.14);
      core.quaternion.slerp(q.setFromEuler(e), 0.035);

      /* shoulders counter-rotate slightly against the chest */
      const sw = mouse.x * LIMIT.shoulder;
      nodes.shoulderL.rotation.x += (-sw - nodes.shoulderL.rotation.x) * 0.05;
      nodes.shoulderR.rotation.x += (sw - nodes.shoulderR.rotation.x) * 0.05;

      /* breathing + micro balance — nothing is ever static */
      const br = Math.sin(t * 1.15) * 0.012;
      nodes.pelvis.position.y = 1.04 + br + Math.sin(t * 0.37) * 0.006;
      nodes.core.position.y = 0.44 - br * 0.5;
      nodes.pelvis.rotation.z = Math.sin(t * 0.29) * 0.008 + scrollLean * 0.05;

      /* fingers curl on a slow, offset loop */
      for (const side of ["L", "R"]) {
        const fs = nodes["fingers" + side] || [];
        fs.forEach((f, i) => {
          f.rotation.z = -0.25 + Math.sin(t * 0.8 + i * 0.5 + (side === "R" ? 1.4 : 0)) * 0.18;
        });
        const th = nodes["thumb" + side];
        if (th) th.rotation.x = Math.sin(t * 0.7) * 0.12;
      }
      nodes.armLoL.rotation.z = 0.18 + Math.sin(t * 0.6) * 0.03;
      nodes.armLoR.rotation.z = 0.18 + Math.sin(t * 0.6 + 1) * 0.03;

    } else {
      /* bike idle: engine vibration + suspension breathing + steering */
      const vib = Math.sin(t * 46) * 0.0016 + Math.sin(t * 71) * 0.0009;
      nodes.core.position.y = 0.06 + vib + Math.sin(t * 1.3) * 0.008;
      nodes.pelvis.position.y = 0.86 + vib * 0.6 + Math.sin(t * 1.3 + 0.4) * 0.006;

      /* suspension: the fork compresses on the bob, out of phase */
      nodes.frontEnd.position.y = -0.1 + Math.sin(t * 1.3 + 1.1) * 0.014;
      nodes.swing.rotation.z = 0.04 + Math.sin(t * 1.3 + 0.8) * 0.012;

      /* the whole bike leans toward the cursor, bars steer harder */
      nodes.root.rotation.y = THREE.MathUtils.lerp(
        nodes.root.rotation.y, -mouse.x * 0.3, 0.05);
      nodes.root.rotation.z = THREE.MathUtils.lerp(
        nodes.root.rotation.z, mouse.x * 0.07 + scrollLean * 0.04, 0.05);
      nodes.frontEnd.rotation.y = THREE.MathUtils.lerp(
        nodes.frontEnd.rotation.y, -mouse.x * 0.34, 0.07);

      /* headlight tracks the cursor a little on its own */
      nodes.lamp.rotation.y = THREE.MathUtils.lerp(
        nodes.lamp.rotation.y, -mouse.x * 0.3, 0.06);

      /* wheels idle-spin a touch when armed, like it wants to go */
      if (armed) {
        nodes.wheelFront.rotation.z -= dt * 1.2;
        nodes.wheelRear.rotation.z -= dt * 1.2;
      }
    }
  }

  return {
    update, hover, toggle, toRobot, toBike, setScroll,
    get state() { return state; },
    dispose() { tl && tl.kill(); },
  };
}
