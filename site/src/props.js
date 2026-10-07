// Majlis set dressing, all procedural except the silk pouf (CC BY 4.0, Wayfair /
// Eric Chadwick via Khronos glTF-Sample-Assets) and the CC0 HDRI (Poly Haven).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as T from './textures.js';

export const TABLE_R = 1.25, TABLE_Y = 0.42;

const brass = () => new THREE.MeshStandardMaterial({ color: 0xc9a04a, metalness: 1, roughness: 0.3 });

export function buildRoom(scene) {
  const g = new THREE.Group();
  // stone floor + Sadu carpet
  const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 6.2), new THREE.MeshStandardMaterial({ map: T.saduTexture(11, 2), color: 0x8a7468, roughness: 0.95 }));
  carpet.rotation.x = -Math.PI / 2; carpet.position.y = 0.004; carpet.receiveShadow = true; g.add(carpet);
  // walls with the Najdi frieze
  const wallTex = T.plasterTexture();
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 6.6, 4.4, 64, 1, true), new THREE.MeshStandardMaterial({ map: wallTex, side: THREE.BackSide, roughness: 0.95 }));
  wall.position.y = 2.2; g.add(wall);
  const ceil = new THREE.Mesh(new THREE.CircleGeometry(6.6, 48), new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 1 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = 4.4; g.add(ceil);
  // continuous floor seating (jalsa) along the wall, Sadu upholstery
  const sadu = T.saduTexture(23, 0.6);
  const seatMat = new THREE.MeshStandardMaterial({ map: sadu, roughness: 0.9 });
  const backMat = new THREE.MeshStandardMaterial({ map: T.saduTexture(31, 0.5), roughness: 0.9 });
  const armMat = new THREE.MeshStandardMaterial({ color: 0x7b1a14, roughness: 0.75 });
  for (let i = -9; i <= 9; i++) {
    const a = Math.PI + i * 0.255;                 // around the far side of the room
    if (Math.abs(i) > 8) continue;
    const r = 6.05;
    const seat = new THREE.Mesh(new RoundedBoxGeometry(1.45, 0.24, 0.72, 3, 0.07), seatMat);
    seat.position.set(Math.sin(a) * r, 0.12, Math.cos(a) * r); seat.rotation.y = a; seat.castShadow = seat.receiveShadow = true; g.add(seat);
    const back = new THREE.Mesh(new RoundedBoxGeometry(1.45, 0.62, 0.2, 3, 0.07), backMat);
    back.position.set(Math.sin(a) * (r + 0.3), 0.52, Math.cos(a) * (r + 0.3)); back.rotation.y = a; back.rotation.x = 0.12; g.add(back);
    if (i % 2 === 0) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.5, 20), armMat);
      arm.rotation.z = Math.PI / 2; arm.rotation.y = a;
      arm.position.set(Math.sin(a + 0.127) * (r - 0.05), 0.34, Math.cos(a + 0.127) * (r - 0.05));
      arm.rotation.set(0, a + Math.PI / 2, Math.PI / 2); g.add(arm);
    }
  }
  // mashrabiya screens with warm light behind
  const latticeA = T.lattice(64, 512);
  latticeA.repeat.set(2, 3);
  const scrMat = new THREE.MeshStandardMaterial({ color: 0x3a2213, roughness: 0.7, alphaMap: latticeA, alphaTest: 0.5, side: THREE.DoubleSide });
  const glowMat = new THREE.MeshBasicMaterial({ map: T.glowTexture('rgba(255,196,120,1)', 'rgba(255,140,60,0.05)'), toneMapped: false });
  for (const a of [Math.PI - 0.5, Math.PI + 0.5, Math.PI]) {
    const r = 6.5;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.3), scrMat);
    scr.position.set(Math.sin(a) * r, 2.05, Math.cos(a) * r); scr.lookAt(0, 2.05, 0); g.add(scr);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.3), glowMat);
    glow.position.set(Math.sin(a) * (r + 0.06), 2.05, Math.cos(a) * (r + 0.06)); glow.lookAt(0, 2.05, 0); g.add(glow);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.66, 2.46, 0.08), new THREE.MeshStandardMaterial({ color: 0x2b170c, roughness: 0.6 }));
    frame.position.set(Math.sin(a) * (r + 0.1), 2.05, Math.cos(a) * (r + 0.1)); frame.lookAt(0, 2.05, 0); g.add(frame);
  }
  scene.add(g);
  return g;
}

export function buildTable(scene) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ map: T.woodTexture(3), roughness: 0.45, metalness: 0.05 });
  const felt = new THREE.MeshStandardMaterial({ map: T.feltTexture(), roughness: 0.92 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R, TABLE_R, 0.05, 96), [wood, felt, wood]);
  top.position.y = TABLE_Y - 0.025; top.receiveShadow = true; top.castShadow = true; g.add(top);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(TABLE_R + 0.035, 0.05, 16, 120), wood);
  rim.rotation.x = Math.PI / 2; rim.position.y = TABLE_Y + 0.005; rim.castShadow = true; rim.receiveShadow = true; g.add(rim);
  const inlay = new THREE.Mesh(new THREE.TorusGeometry(TABLE_R + 0.035, 0.008, 8, 120), brass());
  inlay.rotation.x = Math.PI / 2; inlay.position.y = TABLE_Y + 0.052; g.add(inlay);
  const prof = [[0.0, 0], [0.62, 0], [0.62, 0.03], [0.45, 0.06], [0.24, 0.12], [0.2, 0.22], [0.22, 0.3], [0.5, 0.36], [0.55, 0.39], [0, 0.39]].map(([x, y]) => new THREE.Vector2(x, y));
  const base = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), wood);
  base.castShadow = true; base.receiveShadow = true; g.add(base);
  scene.add(g);
  return g;
}

export function buildCoffeeSet() {
  const g = new THREE.Group();
  const b = brass();
  const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.32, 0.022, 48), b);
  tray.position.y = 0.011; tray.receiveShadow = true; tray.castShadow = true; g.add(tray);
  const trayRim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.012, 8, 48), b); trayRim.rotation.x = Math.PI / 2; trayRim.position.y = 0.024; g.add(trayRim);
  // dallah (Arabic coffee pot)
  const P = [[0, 0], [0.075, 0], [0.08, 0.012], [0.068, 0.026], [0.07, 0.04], [0.092, 0.075], [0.095, 0.105], [0.082, 0.135], [0.05, 0.16], [0.036, 0.18], [0.04, 0.2],
    [0.058, 0.215], [0.062, 0.228], [0.05, 0.24], [0.036, 0.268], [0.014, 0.292], [0.012, 0.31], [0.024, 0.322], [0.016, 0.338], [0, 0.35]].map(([x, y]) => new THREE.Vector2(x * 1.25, y * 1.25));
  const dallah = new THREE.Group();
  const body = new THREE.Mesh(new THREE.LatheGeometry(P, 40), b); body.castShadow = true; dallah.add(body);
  const spout = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.09, 0.11, 0), new THREE.Vector3(0.15, 0.17, 0), new THREE.Vector3(0.2, 0.27, 0), new THREE.Vector3(0.27, 0.33, 0), new THREE.Vector3(0.31, 0.335, 0)]), 24, 0.013, 10), b);
  spout.castShadow = true; dallah.add(spout);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.009, 8, 24, Math.PI * 1.15), b);
  handle.position.set(-0.1, 0.19, 0); handle.rotation.z = Math.PI * 0.42; dallah.add(handle);
  dallah.position.set(0.06, 0.022, -0.06); dallah.rotation.y = 2.3; g.add(dallah);
  // finjan cups
  const porcelain = new THREE.MeshStandardMaterial({ map: T.porcelainTexture(), roughness: 0.25 });
  const C = [[0, 0], [0.018, 0], [0.02, 0.004], [0.026, 0.02], [0.031, 0.04], [0.03, 0.041], [0.025, 0.02], [0.016, 0.006], [0, 0.006]].map(([x, y]) => new THREE.Vector2(x * 1.3, y * 1.3));
  for (let i = 0; i < 4; i++) {
    const cup = new THREE.Mesh(new THREE.LatheGeometry(C, 28), porcelain);
    const a = -0.6 + i * 0.5; cup.position.set(Math.cos(a) * 0.22, 0.022, Math.sin(a) * 0.22 + 0.04); cup.castShadow = true; g.add(cup);
  }
  // dates bowl
  const bowlP = [[0, 0], [0.05, 0], [0.06, 0.01], [0.1, 0.04], [0.11, 0.055], [0.104, 0.056], [0.09, 0.04], [0.05, 0.016], [0, 0.016]].map(([x, y]) => new THREE.Vector2(x, y));
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(bowlP, 36), new THREE.MeshStandardMaterial({ map: T.woodTexture(9, '#6b3b1f'), roughness: 0.5 }));
  bowl.position.set(-0.17, 0.022, -0.1); bowl.castShadow = true; g.add(bowl);
  const dateMat = new THREE.MeshPhysicalMaterial({ color: 0x4a1f0c, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.4 });
  const dg = new THREE.SphereGeometry(0.018, 14, 10);
  for (let i = 0; i < 11; i++) {
    const d = new THREE.Mesh(dg, dateMat);
    const a = i * 2.4, r = 0.02 + (i % 4) * 0.014;
    d.scale.set(1.6, 0.9, 0.9); d.position.set(-0.17 + Math.cos(a) * r, 0.045 + (i > 6 ? 0.016 : 0), -0.1 + Math.sin(a) * r); d.rotation.y = a; g.add(d);
  }
  return g;
}

export function buildMabkhara(smokeTex) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ map: T.woodTexture(5, '#2e1a10'), roughness: 0.5 });
  const b = brass();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.05, 4), wood); base.rotation.y = Math.PI / 4; base.position.y = 0.025; g.add(base);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.085, 0.16, 4), wood); stem.rotation.y = Math.PI / 4; stem.position.y = 0.13; g.add(stem);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.07, 0.07, 4), wood); cup.rotation.y = Math.PI / 4; cup.position.y = 0.245; g.add(cup);
  for (const y of [0.05, 0.21, 0.28]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(y === 0.28 ? 0.118 : 0.09, 0.006, 6, 4), b); ring.rotation.x = Math.PI / 2; ring.rotation.z = Math.PI / 4; ring.position.y = y; g.add(ring); }
  const coalMat = new THREE.MeshStandardMaterial({ color: 0x1a0f0a, emissive: 0xff5a1a, emissiveIntensity: 1.6, roughness: 1 });
  for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.022, 0), coalMat); c.position.set((Math.random() - 0.5) * 0.08, 0.285, (Math.random() - 0.5) * 0.08); g.add(c); }
  g.userData.coal = coalMat;
  // smoke
  const puffs = [];
  const sm = new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0.5 });
  for (let i = 0; i < 26; i++) { const s = new THREE.Sprite(sm.clone()); s.userData.t = i / 26; g.add(s); puffs.push(s); }
  g.userData.puffs = puffs;
  return g;
}

export function buildLantern(panelTex) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a2a18, metalness: 0.9, roughness: 0.45, emissive: 0xffa040, emissiveMap: panelTex, emissiveIntensity: 2.2, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.42, 6, 1, true), metal); body.position.y = 0.21; g.add(body);
  const capMat = new THREE.MeshStandardMaterial({ color: 0x8a6a30, metalness: 1, roughness: 0.35 });
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.22, 6), capMat); roof.position.y = 0.53; g.add(roof);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.04, 6), capMat); foot.position.y = 0.0; g.add(foot);
  const fin = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), capMat); fin.position.y = 0.66; g.add(fin);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 16), capMat); ring.position.y = 0.71; g.add(ring);
  const light = new THREE.PointLight(0xffa24a, 2.2, 5, 2); light.position.y = 0.22; g.add(light);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glowTexture(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.55 }));
  glow.scale.set(1.0, 1.0, 1); glow.position.y = 0.24; g.add(glow);
  g.userData = { light, metal, glow };
  return g;
}

export function cushionFallback() {
  const m = new THREE.Mesh(new RoundedBoxGeometry(0.85, 0.3, 0.85, 4, 0.12), new THREE.MeshStandardMaterial({ map: T.saduTexture(41, 0.4), roughness: 0.9 }));
  m.position.y = 0.15; m.castShadow = true;
  const g = new THREE.Group(); g.add(m); return g;
}
