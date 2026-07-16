/* ============================================================
   effects.js — environment, platform, particles, post.

   Everything here is generated. There is no HDR file and no
   texture download: RoomEnvironment renders a studio cube once
   into a PMREM and we throw the source away.
   ============================================================ */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const ACCENT = 0xff6a00;   /* the site's orange — used only as rim light */
const LIME = 0x6cf000;

export function buildEnvironment(renderer, scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = env.texture;
  pmrem.dispose();

  scene.fog = new THREE.FogExp2(0x0e0e10, 0.055);

  /* key */
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(3.2, 5.2, 3.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1; key.shadow.camera.far = 16;
  key.shadow.camera.left = -4; key.shadow.camera.right = 4;
  key.shadow.camera.top = 4; key.shadow.camera.bottom = -4;
  key.shadow.bias = -0.0012;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  /* rim in the brand orange — this is the only place the site's accent
     touches the machine, and it's what ties the green to the page */
  const rim = new THREE.DirectionalLight(ACCENT, 3.2);
  rim.position.set(-4.4, 2.4, -3.2);
  scene.add(rim);

  /* lime kicker from below, sells the "powered" read */
  const kick = new THREE.PointLight(LIME, 6, 8, 2);
  kick.position.set(0.6, 0.5, 1.6);
  scene.add(kick);

  const fill = new THREE.HemisphereLight(0x35404a, 0x08090a, 0.5);
  scene.add(fill);

  return { key, rim, kick };
}

export function buildPlatform(scene) {
  const group = new THREE.Group();

  /* real mirror, not a fake gradient — the reflection is what makes
     the platform read as glossy black rather than dark grey */
  const mirror = new Reflector(new THREE.CircleGeometry(3.4, 64), {
    textureWidth: 1024, textureHeight: 1024, color: 0x1c1e20,
  });
  mirror.rotation.x = -Math.PI / 2;
  mirror.position.y = 0.001;
  group.add(mirror);
  group.userData.mirror = mirror;

  /* the mirror is 100% reflective; this veil knocks it back to a sheen */
  const veil = new THREE.Mesh(
    new THREE.CircleGeometry(3.4, 64),
    new THREE.MeshBasicMaterial({ color: 0x0e0e10, transparent: true, opacity: 0.62 })
  );
  veil.rotation.x = -Math.PI / 2; veil.position.y = 0.002;
  group.add(veil);

  const ringGeo = new THREE.RingGeometry(3.32, 3.42, 96);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
    color: LIME, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
  }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.004;
  group.add(ring);
  group.userData.ring = ring;

  /* contact shadow — a cheap radial blob under the machine, kept
     because the real shadow map alone doesn't ground it enough */
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d");
  const rg = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  rg.addColorStop(0, "rgba(0,0,0,0.85)"); rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 2.6),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.9, depthWrite: false,
    })
  );
  contact.rotation.x = -Math.PI / 2; contact.position.y = 0.006;
  group.add(contact);
  group.userData.contact = contact;

  scene.add(group);
  return group;
}

export function buildParticles(scene) {
  const COUNT = 220;
  const pos = new Float32Array(COUNT * 3);
  const vel = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    const a = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * 3.1;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = Math.random() * 3.2;
    pos[i * 3 + 2] = Math.sin(a) * r;
    vel[i] = 0.04 + Math.random() * 0.13;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.022, color: 0xbfe9a0, transparent: true, opacity: 0.5,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);

  pts.userData.tick = (dt) => {
    const p = geo.attributes.position.array;
    for (let i = 0; i < COUNT; i++) {
      p[i * 3 + 1] += vel[i] * dt;
      if (p[i * 3 + 1] > 3.4) p[i * 3 + 1] = 0;
    }
    geo.attributes.position.needsUpdate = true;
  };
  return pts;
}

/* exhaust smoke — additive sprites, only alive in bike form */
export function buildSmoke(scene) {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d");
  const rg = g.createRadialGradient(32, 32, 1, 32, 32, 31);
  rg.addColorStop(0, "rgba(190,200,210,0.5)"); rg.addColorStop(1, "rgba(190,200,210,0)");
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);

  const group = new THREE.Group();
  const puffs = [];
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    s.scale.setScalar(0.14);
    group.add(s);
    puffs.push({ s, life: Math.random() });
  }
  scene.add(group);

  group.userData.tick = (dt, origin, strength) => {
    for (const p of puffs) {
      p.life += dt * 0.5;
      if (p.life > 1) {
        p.life = 0;
        p.s.position.copy(origin);
        p.s.position.x += (Math.random() - 0.5) * 0.05;
      }
      p.s.position.x -= dt * 0.35;
      p.s.position.y += dt * 0.16;
      p.s.scale.setScalar(0.12 + p.life * 0.42);
      p.s.material.opacity = (1 - p.life) * 0.3 * strength;
    }
  };
  return group;
}

export function buildComposer(renderer, scene, camera, size) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(size.w, size.h),
    0.62,   /* strength — restrained; the LEDs should glow, not smear */
    0.5,    /* radius */
    0.82    /* threshold — only genuinely bright pixels bloom */
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return { composer, bloom };
}
