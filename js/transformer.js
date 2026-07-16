/* ============================================================
   transformer.js — the machine itself.

   Geometry is built in code, not loaded from a GLB. Every panel
   is a mesh on a named node; every node has two poses (BIKE and
   ROBOT). Nothing cross-fades — the same parts physically move,
   which is what makes it read as a transformation rather than a
   dissolve.

   Local convention: the bike faces +X. The root yaws -90° in
   robot form so the robot ends up facing the camera (+Z).
   ============================================================ */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/* ---------- materials ---------- */
function buildMaterials() {
  const paint = new THREE.MeshPhysicalMaterial({
    color: 0x46b400, metalness: 0.42, roughness: 0.26,
    clearcoat: 1, clearcoatRoughness: 0.06,
  });
  const paintDark = new THREE.MeshPhysicalMaterial({
    color: 0x1d6b0c, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1,
  });
  const carbon = new THREE.MeshPhysicalMaterial({
    color: 0x141618, metalness: 0.72, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.25,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: 0x9aa2aa, metalness: 1, roughness: 0.24,
  });
  const chrome = new THREE.MeshStandardMaterial({
    color: 0xd8dee4, metalness: 1, roughness: 0.06,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x0b0c0d, metalness: 0.4, roughness: 0.7,
  });
  const rubber = new THREE.MeshStandardMaterial({
    color: 0x0d0e10, metalness: 0, roughness: 0.94,
  });
  const white = new THREE.MeshPhysicalMaterial({
    color: 0xeceae7, metalness: 0.3, roughness: 0.3, clearcoat: 1,
  });
  /* emissive parts drive the bloom pass — brightness is animated, not baked */
  const led = new THREE.MeshStandardMaterial({
    color: 0x0a0a0a, emissive: 0x6cf000, emissiveIntensity: 1.4,
    metalness: 0.4, roughness: 0.35,
  });
  const lamp = new THREE.MeshStandardMaterial({
    color: 0x0a0a0a, emissive: 0xd8ffe4, emissiveIntensity: 1.1,
    metalness: 0.3, roughness: 0.18,
  });
  const eye = new THREE.MeshStandardMaterial({
    color: 0x0a0a0a, emissive: 0x8dff2a, emissiveIntensity: 0.0,
    metalness: 0.4, roughness: 0.2,
  });
  const brake = new THREE.MeshStandardMaterial({
    color: 0x0a0a0a, emissive: 0xff2b1c, emissiveIntensity: 0.5,
    metalness: 0.3, roughness: 0.4,
  });
  return { paint, paintDark, carbon, steel, chrome, dark, rubber, white, led, lamp, eye, brake };
}

const box = (w, h, d, r = 0.03, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, r);

function mesh(geo, mat, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/* a wheel: tire + rim + spokes + disc. Built once, cloned twice. */
function buildWheel(M, radius) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.86, radius * 0.16, 12, 40), M.rubber);
  tire.castShadow = true;
  g.add(tire);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.74, radius * 0.74, 0.11, 32, 1, true), M.paint);
  rim.rotation.x = Math.PI / 2; rim.castShadow = true;
  g.add(rim);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.44, radius * 0.44, 0.02, 24), M.chrome);
  disc.rotation.x = Math.PI / 2;
  g.add(disc);
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(box(radius * 1.3, 0.07, 0.05, 0.02), M.carbon);
    s.rotation.z = (i / 5) * Math.PI * 2;
    g.add(s);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.16, 16), M.steel);
  hub.rotation.x = Math.PI / 2;
  g.add(hub);
  return g;
}

/* a hydraulic ram: outer sleeve + inner polished rod that slides */
function buildRam(M, len) {
  const g = new THREE.Group();
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, len * 0.55, 12), M.carbon);
  sleeve.position.y = -len * 0.22; sleeve.castShadow = true;
  g.add(sleeve);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, len * 0.6, 10), M.chrome);
  rod.position.y = len * 0.2;
  g.add(rod);
  g.userData.rod = rod;
  return g;
}

export function buildTransformer() {
  const M = buildMaterials();
  const nodes = {};
  const N = (name, parent) => {
    const g = new THREE.Group();
    g.name = name; nodes[name] = g;
    (parent || null) && parent.add(g);
    return g;
  };

  const root = N("root");

  /* ---------------- pelvis / hips ---------------- */
  const pelvis = N("pelvis", root);
  pelvis.add(mesh(box(0.34, 0.26, 0.52, 0.06), M.carbon));
  pelvis.add(mesh(box(0.2, 0.12, 0.44, 0.04), M.paint, [0.08, 0.06, 0]));

  /* rear swingarm carries the rear wheel — in robot form it folds
     up behind the pelvis, which is where the wheel visibly ends up */
  const swing = N("swing", pelvis);
  swing.add(mesh(box(0.86, 0.11, 0.1, 0.04), M.carbon, [-0.42, 0, 0.15]));
  swing.add(mesh(box(0.86, 0.11, 0.1, 0.04), M.carbon, [-0.42, 0, -0.15]));
  const wheelR = buildWheel(M, 0.42); wheelR.name = "wheelRear";
  wheelR.position.set(-0.86, 0, 0);
  swing.add(wheelR); nodes.wheelRear = wheelR;
  /* shock */
  const shock = buildRam(M, 0.34);
  shock.position.set(-0.3, 0.16, 0); shock.rotation.z = 0.7;
  swing.add(shock);

  /* ---------------- legs ---------------- */
  function leg(side) {
    const s = side === "L" ? 1 : -1;
    const hip = N("hip" + side, pelvis);
    hip.position.set(0, -0.08, 0.2 * s);
    hip.add(mesh(new THREE.SphereGeometry(0.1, 16, 12), M.steel));

    const thigh = N("thigh" + side, hip);
    thigh.position.set(0, -0.24, 0);
    thigh.add(mesh(box(0.24, 0.5, 0.26, 0.06), M.carbon));
    thigh.add(mesh(box(0.1, 0.34, 0.28, 0.04), M.paint, [0.09, 0.02, 0]));
    const tRam = buildRam(M, 0.42); tRam.position.set(-0.13, 0, 0.02);
    thigh.add(tRam);

    const shin = N("shin" + side, thigh);
    shin.position.set(0, -0.46, 0);
    shin.add(mesh(new THREE.SphereGeometry(0.085, 14, 10), M.steel, [0, 0.22, 0]));
    shin.add(mesh(box(0.2, 0.5, 0.22, 0.05), M.carbon));
    shin.add(mesh(box(0.09, 0.4, 0.24, 0.04), M.paint, [0.08, -0.02, 0]));
    const sRam = buildRam(M, 0.4); sRam.position.set(-0.11, 0.02, 0);
    shin.add(sRam);

    const foot = N("foot" + side, shin);
    foot.position.set(0.06, -0.3, 0);
    foot.add(mesh(box(0.38, 0.11, 0.24, 0.04), M.carbon));
    foot.add(mesh(box(0.14, 0.06, 0.2, 0.02), M.steel, [0.14, -0.03, 0]));
    return { hip, thigh, shin, foot };
  }
  leg("L"); leg("R");

  /* ---------------- torso ---------------- */
  const core = N("core", pelvis);
  core.position.set(0, 0.44, 0);
  /* the fuel tank IS the chest — same panel, different attitude */
  const tank = N("tank", core);
  tank.add(mesh(box(0.46, 0.62, 0.78, 0.14, 4), M.paint));
  tank.add(mesh(box(0.14, 0.5, 0.6, 0.06), M.white, [0.2, 0.05, 0]));
  tank.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 16), M.chrome, [0.18, 0.3, 0.16], [0, 0, 0]));
  /* chest vents read as machinery under the paint */
  for (let i = 0; i < 3; i++) tank.add(mesh(box(0.05, 0.03, 0.4, 0.01), M.dark, [0.24, -0.1 - i * 0.07, 0]));

  const ribs = N("ribs", core);
  ribs.add(mesh(box(0.3, 0.3, 0.56, 0.06), M.carbon, [-0.06, -0.3, 0]));

  /* ---------------- front end: fork + wheel + lamp ---------------- */
  const frontEnd = N("frontEnd", core);
  frontEnd.add(mesh(box(0.2, 0.26, 0.3, 0.05), M.carbon));
  const forkL = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.62, 12), M.chrome);
  forkL.position.set(0.06, -0.3, 0.16); forkL.castShadow = true;
  const forkR = forkL.clone(); forkR.position.z = -0.16;
  frontEnd.add(forkL, forkR);
  const wheelF = buildWheel(M, 0.42); wheelF.name = "wheelFront";
  wheelF.position.set(0.06, -0.62, 0);
  frontEnd.add(wheelF); nodes.wheelFront = wheelF;

  /* headlight cluster — twin lamps, the bike's "eyes" before it has any */
  const lampG = N("lamp", frontEnd);
  lampG.position.set(0.16, 0.12, 0);
  lampG.add(mesh(box(0.14, 0.2, 0.34, 0.05), M.carbon));
  const lensA = mesh(box(0.05, 0.09, 0.13, 0.03), M.lamp, [0.08, 0.03, 0.08]);
  const lensB = mesh(box(0.05, 0.09, 0.13, 0.03), M.lamp, [0.08, 0.03, -0.08]);
  lampG.add(lensA, lensB);
  nodes.lamps = [lensA.material];

  /* winglets — the one aggressive silhouette cue that survives both forms */
  frontEnd.add(mesh(box(0.22, 0.03, 0.14, 0.01), M.carbon, [0.05, -0.05, 0.26], [0, 0, -0.15]));
  frontEnd.add(mesh(box(0.22, 0.03, 0.14, 0.01), M.carbon, [0.05, -0.05, -0.26], [0, 0, -0.15]));

  /* ---------------- arms (handlebars in bike form) ---------------- */
  function arm(side) {
    const s = side === "L" ? 1 : -1;
    const sh = N("shoulder" + side, core);
    sh.position.set(0, 0.3, 0.44 * s);
    sh.add(mesh(box(0.26, 0.26, 0.22, 0.07), M.paint));
    sh.add(mesh(new THREE.SphereGeometry(0.1, 16, 12), M.steel, [0, -0.11, 0]));

    const up = N("armUp" + side, sh);
    up.position.set(0, -0.1, 0.06 * s);
    up.add(mesh(box(0.17, 0.4, 0.17, 0.05), M.carbon));
    const uRam = buildRam(M, 0.34); uRam.position.set(-0.1, 0, 0);
    up.add(uRam);

    const lo = N("armLo" + side, up);
    lo.position.set(0, -0.4, 0);
    lo.add(mesh(new THREE.SphereGeometry(0.075, 14, 10), M.steel, [0, 0.2, 0]));
    lo.add(mesh(box(0.15, 0.38, 0.15, 0.05), M.carbon));
    lo.add(mesh(box(0.06, 0.26, 0.16, 0.02), M.paint, [0.07, -0.02, 0]));

    const hand = N("hand" + side, lo);
    hand.position.set(0, -0.32, 0);
    hand.add(mesh(box(0.11, 0.13, 0.13, 0.04), M.steel));
    /* fingers curl — small, but it's the difference between a prop and a character */
    const fingers = [];
    for (let i = 0; i < 3; i++) {
      const f = N("finger" + side + i, hand);
      f.position.set(0.01, -0.08, (i - 1) * 0.045);
      f.add(mesh(box(0.04, 0.11, 0.032, 0.014), M.carbon, [0, -0.05, 0]));
      fingers.push(f);
    }
    const thumb = N("thumb" + side, hand);
    thumb.position.set(-0.04, -0.06, 0.055 * s);
    thumb.add(mesh(box(0.035, 0.09, 0.03, 0.012), M.carbon, [0, -0.04, 0]));
    nodes["fingers" + side] = fingers;
    return { sh, up, lo, hand };
  }
  arm("L"); arm("R");

  /* ---------------- neck + head ---------------- */
  const neck = N("neck", core);
  neck.position.set(0, 0.42, 0);
  neck.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.14, 12), M.steel));

  const head = N("head", neck);
  head.position.set(0, 0.17, 0);
  head.add(mesh(box(0.28, 0.26, 0.3, 0.08, 4), M.carbon));
  head.add(mesh(box(0.1, 0.16, 0.26, 0.05), M.paint, [-0.1, 0.04, 0]));
  /* visor */
  head.add(mesh(box(0.06, 0.09, 0.25, 0.03), M.dark, [0.13, 0.02, 0]));
  const eyeL = mesh(box(0.04, 0.045, 0.075, 0.018), M.eye.clone(), [0.15, 0.02, 0.07]);
  const eyeR = mesh(box(0.04, 0.045, 0.075, 0.018), M.eye.clone(), [0.15, 0.02, -0.07]);
  head.add(eyeL, eyeR);
  nodes.eyes = [eyeL.material, eyeR.material];
  /* crest / helmet fins */
  head.add(mesh(box(0.16, 0.04, 0.05, 0.015), M.paint, [-0.02, 0.15, 0.1], [0, 0, 0.1]));
  head.add(mesh(box(0.16, 0.04, 0.05, 0.015), M.paint, [-0.02, 0.15, -0.1], [0, 0, 0.1]));

  /* ---------------- tail + exhaust ---------------- */
  const tail = N("tail", core);
  tail.add(mesh(box(0.5, 0.16, 0.3, 0.05), M.paint, [-0.3, 0.1, 0]));
  tail.add(mesh(box(0.08, 0.05, 0.16, 0.02), M.brake, [-0.55, 0.12, 0]));

  const exhaust = N("exhaust", pelvis);
  exhaust.add(mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.42, 14), M.steel, [0, 0, 0], [0, 0, Math.PI / 2]));
  const tip = mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.06, 14), M.dark, [-0.22, 0, 0], [0, 0, Math.PI / 2]);
  exhaust.add(tip);
  nodes.exhaustTip = tip;

  /* ============================================================
     POSES — the whole transformation is this data.
     Each entry: [posX,posY,posZ, rotX,rotY,rotZ]
     ============================================================ */
  const BIKE = {
    root:      [0, 0, 0,            0, 0, 0],
    pelvis:    [-0.42, 0.86, 0,     0, 0, 0.06],
    swing:     [0, -0.34, 0,        0, 0, 0.04],
    core:      [0.5, 0.06, 0,       0, 0, -0.12],
    tank:      [0.1, 0.06, 0,       0, 0, Math.PI / 2],
    ribs:      [0, 0.06, 0,         0, 0, 0],
    tail:      [-0.34, 0.1, 0,      0, 0, 0.16],
    frontEnd:  [0.86, -0.1, 0,      0, 0, 0.22],
    lamp:      [0.16, 0.12, 0,      0, 0, -0.1],
    neck:      [0.1, 0.06, 0,       0, 0, -1.5],
    head:      [0, 0.1, 0,          0, 0, -0.4],
    exhaust:   [0.1, -0.3, 0.2,     0, 0, 0.1],

    /* arms fold forward and lock out as the handlebars */
    shoulderL: [0.3, 0.1, 0.3,      0, 0, -1.1],
    armUpL:    [0, -0.1, 0.04,      0.9, 0, -0.5],
    armLoL:    [0, -0.4, 0,         0, 0, -1.35],
    handL:     [0, -0.32, 0,        0, 0.4, 0],
    shoulderR: [0.3, 0.1, -0.3,     0, 0, -1.1],
    armUpR:    [0, -0.1, -0.04,     -0.9, 0, -0.5],
    armLoR:    [0, -0.4, 0,         0, 0, -1.35],
    handR:     [0, -0.32, 0,        0, -0.4, 0],

    /* legs fold back and under, knees closed */
    hipL:      [0, -0.08, 0.18,     0, 0, 2.5],
    thighL:    [0, -0.24, 0,        0, 0, -0.55],
    shinL:     [0, -0.46, 0,        0, 0, 1.75],
    footL:     [0.06, -0.3, 0,      0, 0, -0.5],
    hipR:      [0, -0.08, -0.18,    0, 0, 2.5],
    thighR:    [0, -0.24, 0,        0, 0, -0.55],
    shinR:     [0, -0.46, 0,        0, 0, 1.75],
    footR:     [0.06, -0.3, 0,      0, 0, -0.5],
  };

  const ROBOT = {
    root:      [0, 0, 0,            0, -Math.PI / 2, 0],
    pelvis:    [0, 1.04, 0,         0, 0, 0],
    swing:     [-0.12, -0.02, 0,    0, 0, 1.5],
    core:      [0, 0.44, 0,         0, 0, 0],
    tank:      [0.02, 0.06, 0,      0, 0, 0],
    ribs:      [0, 0, 0,            0, 0, 0],
    tail:      [-0.16, 0.3, 0,      0, 0, -1.3],
    frontEnd:  [-0.3, 0.34, 0,      0, 0, -1.9],
    lamp:      [0.16, 0.12, 0,      0, 0, 0],
    neck:      [0, 0.42, 0,         0, 0, 0],
    head:      [0, 0.17, 0,         0, 0, 0],
    exhaust:   [-0.2, 0.06, 0.26,   0, 0, 1.4],

    shoulderL: [0, 0.3, 0.44,       0, 0, 0],
    armUpL:    [0, -0.1, 0.06,      0.05, 0, 0.1],
    armLoL:    [0, -0.4, 0,         0, 0, 0.18],
    handL:     [0, -0.32, 0,        0, 0, 0],
    shoulderR: [0, 0.3, -0.44,      0, 0, 0],
    armUpR:    [0, -0.1, -0.06,     -0.05, 0, 0.1],
    armLoR:    [0, -0.4, 0,         0, 0, 0.18],
    handR:     [0, -0.32, 0,        0, 0, 0],

    hipL:      [0, -0.08, 0.2,      0, 0, 0],
    thighL:    [0, -0.24, 0,        0, 0, 0.02],
    shinL:     [0, -0.46, 0,        0, 0, 0.04],
    footL:     [0.06, -0.3, 0,      0, 0, -0.06],
    hipR:      [0, -0.08, -0.2,     0, 0, 0],
    thighR:    [0, -0.24, 0,        0, 0, 0.02],
    shinR:     [0, -0.46, 0,        0, 0, 0.04],
    footR:     [0.06, -0.3, 0,      0, 0, -0.06],
  };

  function applyPose(pose) {
    for (const k in pose) {
      const n = nodes[k]; if (!n) continue;
      const p = pose[k];
      n.position.set(p[0], p[1], p[2]);
      n.rotation.set(p[3], p[4], p[5]);
    }
  }

  applyPose(BIKE);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  return { root, nodes, materials: M, POSES: { BIKE, ROBOT }, applyPose };
}
