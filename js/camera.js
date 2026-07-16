/* ============================================================
   camera.js — a camera rig, not a camera.

   The camera is parented to a yaw/pitch pivot so mouse parallax
   and idle "breathing" compose without fighting each other, and
   so the look-at target can drift independently.
   ============================================================ */
import * as THREE from "three";

/* framing per breakpoint — a phone can't afford the same wide plate as a desktop */
const FRAMING = {
  desktop: { fov: 34, dist: 6.4, height: 1.25, target: 1.05 },
  tablet:  { fov: 40, dist: 6.8, height: 1.2,  target: 1.0 },
  mobile:  { fov: 48, dist: 7.2, height: 1.1,  target: 0.95 },
};

export function createCameraRig(container) {
  const pivot = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  pivot.add(camera);

  const target = new THREE.Vector3(0, 1.05, 0);
  let mode = "desktop";

  function pick() {
    const w = container.clientWidth;
    return w < 560 ? "mobile" : w < 900 ? "tablet" : "desktop";
  }

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    mode = pick();
    const f = FRAMING[mode];
    camera.fov = f.fov;
    camera.aspect = w / h;
    camera.position.set(0, f.height, f.dist);
    target.set(0, f.target, 0);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    return { w, h };
  }
  resize();

  /* mouse adds a small orbit + tilt; spec caps camera at ±4° and that
     restraint is the whole reason it reads as expensive rather than gimmicky */
  const MAX_YAW = THREE.MathUtils.degToRad(4);
  const MAX_PITCH = THREE.MathUtils.degToRad(2.6);

  let t = 0;
  function update(dt, mouse) {
    t += dt;
    const yaw = -mouse.x * MAX_YAW;
    const pitch = mouse.y * MAX_PITCH;
    pivot.rotation.y += (yaw - pivot.rotation.y) * 0.045;
    pivot.rotation.x += (pitch - pivot.rotation.x) * 0.045;

    /* breathing: two prime-ish frequencies so the loop never visibly repeats */
    const f = FRAMING[mode];
    camera.position.y = f.height + Math.sin(t * 0.55) * 0.028 + Math.sin(t * 0.23) * 0.014;
    camera.position.x = Math.sin(t * 0.31) * 0.022;
    camera.lookAt(target);
  }

  return { camera, pivot, update, resize, get mode() { return mode; } };
}
