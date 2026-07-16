/* ============================================================
   mouse-controller.js — turns pointer position into a damped
   signal everything else reads from.

   Nothing downstream ever touches the raw event. They read
   `mouse.x/.y`, which are already smoothed, so no consumer can
   accidentally introduce a snap.
   ============================================================ */

export function createMouseController(container) {
  const raw = { x: 0, y: 0 };
  const mouse = { x: 0, y: 0, inside: false, idle: 0 };

  const fine = matchMedia("(hover:hover) and (pointer:fine)").matches;
  let gyro = false;

  function onMove(e) {
    /* normalized to the viewport, not the container — the robot should
       acknowledge the cursor even while it's over the hero copy */
    raw.x = (e.clientX / innerWidth - 0.5) * 2;
    raw.y = (e.clientY / innerHeight - 0.5) * 2;
    mouse.idle = 0;
  }

  if (fine) {
    addEventListener("pointermove", onMove, { passive: true });
    container.addEventListener("pointerenter", () => (mouse.inside = true));
    container.addEventListener("pointerleave", () => {
      mouse.inside = false;
      raw.x = 0; raw.y = 0;   /* cursor gone → return to centre, not freeze */
    });
  } else {
    addEventListener("deviceorientation", (e) => {
      if (e.gamma == null) return;
      gyro = true;
      raw.x = Math.max(-1, Math.min(1, e.gamma / 34));
      raw.y = Math.max(-1, Math.min(1, ((e.beta || 45) - 45) / 42));
      mouse.idle = 0;
    }, { passive: true });
  }

  let t = 0;
  function update(dt) {
    t += dt;
    mouse.idle += dt;

    /* touch, no gyro: sway on its own so it never looks dead */
    if (!fine && !gyro) {
      raw.x = Math.sin(t * 0.34) * 0.55;
      raw.y = Math.sin(t * 0.21) * 0.3;
    }

    mouse.x += (raw.x - mouse.x) * 0.06;
    mouse.y += (raw.y - mouse.y) * 0.06;
  }

  return { mouse, update, get isFine() { return fine; } };
}
