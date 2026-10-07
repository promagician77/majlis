// three.js table: scene, card objects, layouts, tweening, picking, coins.
// The 3D layer is a pure *view*: it never decides anything about the game.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import * as T from './textures.js';
import * as P from './props.js';
import { drawFace, drawBack, cardTexture, CW, CH } from './cards.js';
import { makeDeck } from './engine/rules.js';

const { TABLE_Y } = P;
const CARD_W = 0.25, CARD_H = (CARD_W * CH) / CW;
const ANG = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
export const dirOf = (s) => new THREE.Vector3(Math.sin(ANG[s]), 0, Math.cos(ANG[s]));
const perpOf = (s) => new THREE.Vector3(Math.cos(ANG[s]), 0, -Math.sin(ANG[s]));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const qFromEuler = (x, y, z, order = 'XYZ') => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, order));

class CardObj {
  constructor(geo, backMat, backTex) {
    this.group = new THREE.Group();
    this.frontMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.55, alphaTest: 0.5, emissive: 0x000000 });
    this.front = new THREE.Mesh(geo, this.frontMat);
    this.back = new THREE.Mesh(geo, backMat);
    this.back.rotation.y = Math.PI; this.back.position.z = -0.0012;
    this.front.castShadow = this.back.castShadow = true;
    this.group.add(this.front, this.back);
    this.id = null; this.anim = null;
    this.front.userData.card = this;
  }
}

export class Table3D {
  constructor(host) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x140c07);
    this.scene.fog = new THREE.Fog(0x140c07, 5.5, 13);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 40);
    this.camBase = { pos: new THREE.Vector3(0, 2.32, 2.62), look: new THREE.Vector3(0, 0.26, 0.22) };
    this.mouse = new THREE.Vector2(0, 0); this.par = new THREE.Vector2(0, 0);
    this.anims = new Set();
    this.cards = []; this.mine = []; this.opp = [[], [], [], []]; this.trickObjs = []; this.piles = [[], [], [], []]; this.revealed = [[], [], [], []];
    this.coins = []; this.potCoins = [];
    this.hovered = null; this.legal = null; this.pending = null;
    this.onCardClick = null; this.onFrame = null;
    this.active = true; this.spectator = false;
    this.clock = new THREE.Clock();
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.renderer.domElement.addEventListener('pointermove', (e) => this.pointer(e));
    this.renderer.domElement.addEventListener('pointerdown', (e) => this.pointer(e, true));
    this.renderer.domElement.addEventListener('pointerleave', () => { this.mouse.set(0, 0); this.setHover(null); });
  }

  resize() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    const a = w / h, portrait = a < 1;
    this.portrait = portrait;
    // fit the table to the screen: wide screens use a low seated view, phones a steeper one
    const vfov = portrait ? 60 : 42, elev = THREE.MathUtils.degToRad(portrait ? 56 : 40.6), fitW = portrait ? 2.55 : 2.75;
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(vfov / 2)) * a);
    const D = Math.max(3.16, fitW / 2 / Math.tan(hfov / 2));
    this.camera.aspect = a; this.camera.fov = vfov;
    this.camBase.look.set(0, portrait ? 0.1 : 0.26, portrait ? 0.12 : 0.22);
    this.camBase.pos.set(0, this.camBase.look.y + D * Math.sin(elev), this.camBase.look.z + D * Math.cos(elev));
    // my hand hangs in front of the camera, at the bottom of the view, on any aspect ratio
    const dist = portrait ? 1.85 : 1.95;
    const vh = 2 * dist * Math.tan(THREE.MathUtils.degToRad(vfov / 2)), vw = vh * a;
    this.handSpread = Math.min(0.14, (vw * 0.84 - CARD_W) / 7);
    this.handLocal = { y: -vh / 2 + CARD_H * (portrait ? 0.62 : 0.72), z: -dist };
    this.camera.updateProjectionMatrix();
    this.layoutMine(true);
  }

  async load(progress = () => {}) {
    await document.fonts.load('800 58px Tajawal', '10AKQJ').catch(() => {});
    await document.fonts.load('700 64px "Reem Kufi"', '٣٢JQK').catch(() => {});
    const parts = { hdr: 0, glb: 0 };
    const report = () => progress((parts.hdr + parts.glb) / 2);
    // ---- environment light (CC0 HDRI) ----
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const hdrP = new RGBELoader().loadAsync('assets/royal_esplanade_1k.hdr', (e) => { if (e.total) { parts.hdr = e.loaded / e.total; report(); } })
      .then((t) => { t.mapping = THREE.EquirectangularReflectionMapping; this.scene.environment = pmrem.fromEquirectangular(t).texture; this.scene.environmentIntensity = 0.32; t.dispose(); })
      .catch(() => { this.envFailed = true; })
      .finally(() => { parts.hdr = 1; report(); });
    const glbP = new GLTFLoader().loadAsync('assets/pouf.glb', (e) => { if (e.total) { parts.glb = e.loaded / e.total; report(); } })
      .then((g) => g.scene).catch(() => null).finally(() => { parts.glb = 1; report(); });

    // ---- lights ----
    const hemi = new THREE.HemisphereLight(0xffe0bd, 0x2a160b, 0.38); this.scene.add(hemi);
    const key = new THREE.SpotLight(0xffd6a0, 34, 9, 0.62, 0.65, 2);
    key.position.set(0.3, 3.4, 0.9); key.target.position.set(0, TABLE_Y, 0);
    key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.camera.near = 1; key.shadow.camera.far = 6;
    this.scene.add(key, key.target); this.key = key;
    const rimL = new THREE.PointLight(0xff9a50, 4, 7, 2); rimL.position.set(-2.4, 1.6, -2.2); this.scene.add(rimL);

    // ---- set ----
    P.buildRoom(this.scene);
    P.buildTable(this.scene);
    const coffee = P.buildCoffeeSet(); coffee.position.set(1.95, 0, -1.55); coffee.rotation.y = -0.5; this.scene.add(coffee);
    this.mabkhara = P.buildMabkhara(T.smokeTexture()); this.mabkhara.position.set(-2.05, 0, -1.45); this.scene.add(this.mabkhara);
    const panel = T.lanternPanel();
    this.lanterns = [];
    for (const [x, z, s] of [[-3.2, -4.4, 1.25], [3.3, -4.3, 1.25], [-1.4, -5.6, 1], [1.5, -5.6, 1]]) {
      const l = P.buildLantern(panel); l.position.set(x, 0, z); l.scale.setScalar(s); this.scene.add(l); this.lanterns.push(l);
    }
    const hang = P.buildLantern(panel); hang.position.set(0, 2.85, -0.6); hang.scale.setScalar(0.9); this.scene.add(hang); this.lanterns.push(hang);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0x8a6a30, metalness: 1, roughness: 0.4 }));
    chain.position.set(0, 4.3, -0.6); this.scene.add(chain);

    // ---- cards ----
    const backTex = cardTexture(drawBack());
    this.backTex = backTex;
    this.faceTex = {};
    for (const c of makeDeck()) this.faceTex[c] = cardTexture(drawFace(c));
    const geo = new THREE.PlaneGeometry(CARD_W, CARD_H);
    const backMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.6, alphaTest: 0.5 });
    this.cardGeo = geo; this.backMat = backMat;
    for (let i = 0; i < 32; i++) { const c = new CardObj(geo, backMat, backTex); c.group.visible = false; this.scene.add(c.group); this.cards.push(c); }
    // ---- coins ----
    const coinGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.011, 28);
    const coinTop = new THREE.MeshStandardMaterial({ map: T.coinTexture(), metalness: 0.9, roughness: 0.3 });
    const coinSide = new THREE.MeshStandardMaterial({ color: 0xc8962f, metalness: 1, roughness: 0.35 });
    for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(coinGeo, [coinSide, coinTop, coinTop]); m.castShadow = true; m.visible = false; this.scene.add(m); this.coins.push(m); }
    // seat markers on the felt
    this.seatGlow = [];
    for (let s = 0; s < 4; s++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.0, 0.2, 40), new THREE.MeshBasicMaterial({ map: T.glowTexture('rgba(255,210,130,0.9)', 'rgba(255,170,60,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      ring.rotation.x = -Math.PI / 2; const p = dirOf(s).multiplyScalar(1.08); ring.position.set(p.x, TABLE_Y + 0.004, p.z); ring.scale.set(2.2, 1, 1);
      ring.rotation.z = -ANG[s] + Math.PI / 2; this.scene.add(ring); this.seatGlow.push(ring);
    }

    // hand pivot (my cards)
    this.handPivot = new THREE.Object3D(); this.scene.add(this.handPivot);
    this.helper = new THREE.Object3D(); this.handPivot.add(this.helper);

    const [, pouf] = await Promise.all([hdrP, glbP]);
    for (let s = 0; s < 4; s++) {
      let seat;
      if (pouf) {
        seat = pouf.clone(true);
        const box = new THREE.Box3().setFromObject(seat); const size = box.getSize(new THREE.Vector3());
        const k = 0.95 / Math.max(size.x, size.z); seat.scale.setScalar(k);
        seat.position.y = -box.min.y * k;
        seat.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        const wrap = new THREE.Group(); wrap.add(seat); seat = wrap;
      } else seat = P.cushionFallback();
      const p = dirOf(s).multiplyScalar(1.95); seat.position.set(p.x, 0, p.z); this.scene.add(seat);
    }
    this.poufLoaded = !!pouf;
    if (/[?&]lite\b/.test(location.search)) this.setQuality(2);
    this.renderer.compile(this.scene, this.camera);
    this.loop();
  }

  // ---------------- layout targets ----------------
  updatePivot() {
    const base = (this.baseCam ||= new THREE.Object3D());
    base.position.copy(this.camBase.pos); base.lookAt(this.camBase.look);
    // Object3D.lookAt points +z at the target; flip so -z looks forward like a camera
    base.rotateY(Math.PI);
    base.updateMatrixWorld(true);
    const l = this.handLocal || { y: -0.6, z: -2 };
    this.handPivot.position.copy(base.localToWorld(new THREE.Vector3(0, l.y, l.z)));
    this.handPivot.quaternion.copy(base.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.34, 0, 0)));
    this.handPivot.updateMatrixWorld(true);
  }
  slotMine(i, n, lift = 0) {
    this.updatePivot();
    const mid = (n - 1) / 2, d = i - mid;
    this.helper.position.set(d * (this.handSpread || 0.15), -0.01 * d * d + lift, i * 0.003);
    this.helper.rotation.set(0, 0, -d * 0.055);
    this.helper.updateMatrixWorld(true);
    return { pos: this.helper.getWorldPosition(new THREE.Vector3()), quat: this.helper.getWorldQuaternion(new THREE.Quaternion()) };
  }
  slotOpp(s, i, n) {
    const mid = (n - 1) / 2, d = i - mid;
    if (s === 0) return { pos: new THREE.Vector3(-d * 0.075, TABLE_Y + 0.006 + i * 0.0015, 1.0), quat: qFromEuler(Math.PI / 2, 0, d * 0.04) };   // spectator view of seat 1
    const base = dirOf(s).multiplyScalar(this.portrait && s !== 2 ? 0.9 : 1.07);
    const pos = base.add(perpOf(s).multiplyScalar(-d * 0.06)).setY(TABLE_Y + 0.16 + 0.004 * -Math.abs(d));
    const q = qFromEuler(0.42, ANG[s], d * 0.06, 'YXZ');
    return { pos, quat: q };
  }
  slotTrick(s, k) {
    const p = dirOf(s).multiplyScalar(0.42);
    const j = ((k * 37) % 11) / 11 - 0.5;
    return { pos: new THREE.Vector3(p.x, TABLE_Y + 0.004 + k * 0.002, p.z), quat: qFromEuler(-Math.PI / 2, 0, ANG[s] + j * 0.25), scale: 1.2 };
  }
  slotPile(s, k) {
    const p = dirOf(s).multiplyScalar(0.84).add(perpOf(s).multiplyScalar(s === 0 ? 0.62 : 0.5));
    return { pos: new THREE.Vector3(p.x, TABLE_Y + 0.004 + k * 0.0022, p.z), quat: qFromEuler(Math.PI / 2, 0, ANG[s] + 0.25 + (k % 3) * 0.04) };
  }
  slotDeck(dealer, k) {
    const p = dirOf(dealer).multiplyScalar(0.62);
    return { pos: new THREE.Vector3(p.x, TABLE_Y + 0.004 + k * 0.0022, p.z), quat: qFromEuler(Math.PI / 2, 0, ANG[dealer]) };
  }
  slotReveal(s, i, n) {
    const mid = (n - 1) / 2;
    const p = dirOf(s).multiplyScalar(0.7).add(perpOf(s).multiplyScalar((mid - i) * 0.13));
    return { pos: new THREE.Vector3(p.x, TABLE_Y + 0.006 + i * 0.001, p.z), quat: qFromEuler(-Math.PI / 2, 0, ANG[s]), scale: 0.9 };
  }

  // ---------------- tweening ----------------
  tween(obj, to, ms = 420, { delay = 0, arc = 0, onMid = null, easeFn = ease } = {}) {
    const o3 = obj.group || obj;
    if (obj.anim) { this.anims.delete(obj.anim); obj.anim.resolve(); }
    return new Promise((resolve) => {
      const a = { o3, obj, from: { pos: o3.position.clone(), quat: o3.quaternion.clone(), scale: o3.scale.x }, to, ms: Math.max(1, ms), start: performance.now() + delay, arc, onMid, mid: false, resolve, easeFn };
      obj.anim = a; this.anims.add(a);
    });
  }
  place(obj, to) { const o3 = obj.group || obj; if (obj.anim) { this.anims.delete(obj.anim); obj.anim.resolve(); obj.anim = null; } o3.position.copy(to.pos); o3.quaternion.copy(to.quat); o3.scale.setScalar(to.scale ?? 1); }
  stepAnims(now) {
    for (const a of this.anims) {
      let t = (now - a.start) / a.ms;
      if (t < 0) continue;
      if (t >= 1) t = 1;
      const e = a.easeFn(t);
      a.o3.position.lerpVectors(a.from.pos, a.to.pos, e);
      if (a.arc) a.o3.position.y += Math.sin(Math.PI * e) * a.arc;
      a.o3.quaternion.slerpQuaternions(a.from.quat, a.to.quat, e);
      const sc = a.from.scale + ((a.to.scale ?? 1) - a.from.scale) * e; a.o3.scale.setScalar(sc);
      if (!a.mid && t >= 0.5) { a.mid = true; a.onMid && a.onMid(); }
      if (t >= 1) { this.anims.delete(a); if (a.obj.anim === a) a.obj.anim = null; a.resolve(); }
    }
  }

  // ---------------- card identity ----------------
  setFace(card, id) { card.id = id; card.frontMat.map = id ? this.faceTex[id] : this.backTex; card.frontMat.needsUpdate = true; }

  // full reset from a server snapshot or a new round
  clearTable() {
    for (const c of this.cards) { c.group.visible = false; this.setFace(c, null); this.setTint(c, 'normal'); if (c.anim) { this.anims.delete(c.anim); c.anim = null; } }
    this.mine = []; this.opp = [[], [], [], []]; this.trickObjs = []; this.piles = [[], [], [], []]; this.revealed = [[], [], [], []];
    this.hovered = null; this.legal = null; this.pending = null; this.folded0 = false;
  }
  takeFree() {
    let c = this.cards.find((x) => !x.group.visible);
    if (!c) { c = new CardObj(this.cardGeo, this.backMat, this.backTex); this.scene.add(c.group); this.cards.push(c); }
    c.group.visible = true; return c;
  }

  // build state instantly (used by reconnect + spectator)
  buildFrom({ hand, counts, trick, piles, you }) {
    this.clearTable();
    const mineHidden = you == null;
    for (let s = 0; s < 4; s++) {
      if (s === 0 && !mineHidden) {
        for (const id of hand) { const c = this.takeFree(); this.setFace(c, id); this.mine.push(c); }
      } else {
        for (let i = 0; i < counts[s]; i++) this.opp[s].push(this.takeFree());
      }
      for (let k = 0; k < (piles?.[s] || 0); k++) { const c = this.takeFree(); this.place(c, this.slotPile(s, k)); this.piles[s].push(c); }
    }
    trick.forEach((p, k) => { const c = this.takeFree(); this.setFace(c, p.card); this.place(c, this.slotTrick(p.seat, k)); this.trickObjs.push({ seat: p.seat, obj: c }); });
    this.layoutMine(true); for (let s = 0; s < 4; s++) this.layoutOpp(s, true);
  }

  async dealRound(dealer, hand, mineHidden = false) {
    this.clearTable();
    const deck = [];
    for (let k = 0; k < 32; k++) { const c = this.takeFree(); this.place(c, this.slotDeck(dealer, k)); deck.push(c); }
    const jobs = [];
    for (let k = 0; k < 32; k++) {
      const c = deck[31 - k];
      const seat = (dealer + 1 + k) % 4;
      if (seat === 0 && !mineHidden) this.mine.push(c); else this.opp[seat].push(c);
    }
    if (!mineHidden) this.mine.forEach((c, i) => this.setFace(c, hand[i]));
    let k = 0;
    for (let round = 0; round < 8; round++) {
      for (let j = 0; j < 4; j++) {
        const seat = (dealer + 1 + j) % 4;
        const list = seat === 0 && !mineHidden ? this.mine : this.opp[seat];
        const c = list[round];
        const to = seat === 0 && !mineHidden ? this.slotMine(round, 8) : this.slotOpp(seat, round, 8);
        jobs.push(this.tween(c, to, 380, { delay: k * 32, arc: 0.16 }));
        k++;
      }
    }
    await Promise.all(jobs);
    this.layoutMine(); for (let s = 0; s < 4; s++) this.layoutOpp(s);
  }

  layoutMine(instant = false) {
    if (!this.handPivot) return;
    const n = this.mine.length;
    this.mine.forEach((c, i) => {
      const lift = (c === this.hovered ? 0.075 : 0) + (this.legal && this.legal.includes(c.id) ? 0.03 : 0) + (c === this.pending ? 0.12 : 0) - (this.folded0 ? 0.09 : 0);
      const to = this.slotMine(i, n, lift);
      instant ? this.place(c, to) : this.tween(c, to, 160, { easeFn: easeOut });
    });
  }
  layoutOpp(s, instant = false) {
    const list = this.opp[s];
    list.forEach((c, i) => { const to = this.slotOpp(s, i, list.length); instant ? this.place(c, to) : this.tween(c, to, 220); });
  }

  setTint(c, mode) {
    c.frontMat.color.setHex(mode === 'dim' ? 0x8c8378 : mode === 'fold' ? 0x5e574f : 0xffffff);
    c.frontMat.emissive.setHex(mode === 'lit' ? 0x6b4a10 : 0x000000);
  }
  setLegal(ids) {
    this.legal = ids;
    for (const c of this.mine) this.setTint(c, this.folded0 ? 'fold' : !ids ? 'normal' : ids.includes(c.id) ? 'lit' : 'dim');
    this.layoutMine();
  }

  // ---------------- game moves ----------------
  async play(seat, id, mineHidden = false) {
    let c;
    if (seat === 0 && !mineHidden) {
      c = this.mine.find((x) => x.id === id) || this.mine[0];
      this.mine.splice(this.mine.indexOf(c), 1);
      if (this.pending === c) this.pending = null;
      this.setTint(c, 'normal');
    } else {
      const list = this.opp[seat];
      c = list.splice(Math.floor(list.length / 2), 1)[0] || this.takeFree();
    }
    const k = this.trickObjs.length;
    this.trickObjs.push({ seat, obj: c });
    const p = this.tween(c, this.slotTrick(seat, k), 430, { arc: 0.22, onMid: () => this.setFace(c, id) });
    if (seat === 0 && !mineHidden) { this.setLegal(null); } else this.layoutOpp(seat);
    return p;
  }

  async collect(winner) {
    const objs = this.trickObjs.splice(0);
    const jobs = objs.map(({ obj }, i) => {
      const k = this.piles[winner].length; this.piles[winner].push(obj);
      return this.tween(obj, this.slotPile(winner, k), 420, { delay: i * 45, arc: 0.08, onMid: () => this.setFace(obj, null) });
    });
    await Promise.all(jobs);
  }

  reveal(seat, ids) {
    // folded players' unplayed cards are turned face up at round end
    const list = seat === 0 && this.mine.length ? this.mine : this.opp[seat];
    const n = list.length;
    list.slice().forEach((c, i) => { this.setTint(c, 'normal'); this.tween(c, this.slotReveal(seat, i, n), 520, { delay: i * 60, arc: 0.1, onMid: () => this.setFace(c, ids[i] || c.id) }); });
    this.revealed[seat] = list.splice(0);
  }

  foldSeat(s) {
    if (s === 0 && this.mine.length) { for (const c of this.mine) this.setTint(c, 'fold'); this.legal = null; this.folded0 = true; this.layoutMine(); return; }
    const list = this.opp[s];
    list.forEach((c, i) => {
      const p = dirOf(s).multiplyScalar(0.92).add(perpOf(s).multiplyScalar(-0.42));
      this.tween(c, { pos: new THREE.Vector3(p.x, TABLE_Y + 0.004 + i * 0.0022, p.z), quat: qFromEuler(Math.PI / 2, 0, ANG[s] - 0.2) }, 380, { delay: i * 30, arc: 0.05 });
    });
  }

  setPending(id) { this.pending = this.mine.find((c) => c.id === id) || null; this.layoutMine(); }

  // ---------------- coins ----------------
  coinFree() { return this.coins.find((c) => !c.visible); }
  potSlot(i) {
    const col = i % 4, row = Math.floor(i / 4);
    const a = col * (Math.PI / 2) + 0.4;
    return { pos: new THREE.Vector3(Math.cos(a) * 0.075, TABLE_Y + 0.006 + row * 0.012, Math.sin(a) * 0.075), quat: new THREE.Quaternion() };
  }
  coinsTo(seat, n) {
    const jobs = [];
    for (let i = 0; i < n; i++) {
      const c = this.coinFree(); if (!c) break;
      const from = dirOf(seat).multiplyScalar(1.15).setY(TABLE_Y + 0.25);
      c.position.copy(from); c.quaternion.identity(); c.visible = true;
      const slot = this.potSlot(this.potCoins.length); this.potCoins.push(c);
      jobs.push(this.tween(c, slot, 520, { delay: i * 70, arc: 0.25 }));
    }
    return Promise.all(jobs);
  }
  setPot(n) {
    // instant (snapshot)
    for (const c of this.potCoins) c.visible = false;
    this.potCoins = [];
    for (let i = 0; i < n; i++) { const c = this.coinFree(); if (!c) break; c.visible = true; this.place(c, this.potSlot(i)); this.potCoins.push(c); }
  }
  async payout(shares) {
    // shares: [{seat, coins}] — fly pot coins to winners
    const coins = this.potCoins.splice(0);
    const jobs = []; let i = 0;
    for (const { seat, coins: n } of shares) {
      for (let k = 0; k < n && i < coins.length; k++, i++) {
        const c = coins[i];
        const to = { pos: dirOf(seat).multiplyScalar(1.5).setY(TABLE_Y + 0.35), quat: qFromEuler(Math.PI / 2, 0, 0) };
        jobs.push(this.tween(c, to, 650, { delay: i * 60, arc: 0.35 }).then(() => { c.visible = false; }));
      }
    }
    for (; i < coins.length; i++) coins[i].visible = false;
    await Promise.all(jobs);
  }

  // ---------------- turn glow ----------------
  setTurn(seat) { this.turnSeat = seat; }

  // ---------------- input ----------------
  pointer(e, click = false) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    if (!this.mine.length) return this.setHover(null);
    const ray = new THREE.Raycaster(); ray.setFromCamera(this.mouse, this.camera);
    const hit = ray.intersectObjects(this.mine.map((c) => c.front), false)[0];
    const card = hit ? hit.object.userData.card : null;
    if (e.pointerType !== 'touch') { this.setHover(card); if (click && card && this.onCardClick) this.onCardClick(card.id); return; }
    // touch: first tap lifts the card, second tap plays it
    if (!click) return;
    if (card && card === this.hovered) { this.onCardClick && this.onCardClick(card.id); return; }
    this.setHover(card);
  }
  setHover(c) { if (c === this.hovered) return; this.hovered = c; this.renderer.domElement.style.cursor = c ? 'pointer' : 'default'; this.layoutMine(); }

  project(v) {
    const p = v.clone().project(this.camera);
    const r = this.renderer.domElement;
    return { x: ((p.x + 1) / 2) * r.clientWidth, y: ((1 - p.y) / 2) * r.clientHeight, behind: p.z > 1 };
  }
  anchor(s) {
    const w = s === 2 ? new THREE.Vector3(1.08, 0.45, -1.25) : dirOf(s).multiplyScalar(1.95).setY(0.5);
    const p = this.project(w);
    const r = this.renderer.domElement;
    p.x = Math.min(r.clientWidth - 70, Math.max(70, p.x)); p.y = Math.min(r.clientHeight - 140, Math.max(150, p.y));
    return p;
  }
  handTop() {
    // highest screen point of my hand, so the HUD can sit just above it
    let top = Infinity;
    const v = new THREE.Vector3();
    for (const c of this.mine) { v.set(0, CARD_H / 2, 0); c.group.localToWorld(v); top = Math.min(top, this.project(v).y); }
    return top;
  }
  pileAnchor(s) { const p = this.slotPile(s, 0).pos; return this.project(p.setY(p.y + 0.05)); }

  // drop quality on slow GPUs (old phones): pixel ratio first, then shadows
  adapt(dt) {
    // skip warm-up (shader compiles), then judge by the median frame time
    const q = (this.fq ||= { seen: 0, buf: [], level: 0 });
    if (++q.seen < 90 || q.level >= 2) return;
    q.buf.push(dt);
    if (q.buf.length < 45) return;
    const med = q.buf.sort((a, b) => a - b)[22]; q.buf = [];
    if (med > 30) this.setQuality(q.level + 1, med);
  }
  setQuality(level, med = 0) {
    const q = (this.fq ||= { seen: 0, buf: [], level: 0 });
    q.level = level;
    if (level >= 1) { this.renderer.setPixelRatio(Math.min(1, window.devicePixelRatio)); this.key.shadow.mapSize.set(1024, 1024); this.key.shadow.map?.dispose(); this.key.shadow.map = null; }
    if (level >= 2) { this.renderer.setPixelRatio(0.75); this.renderer.shadowMap.enabled = false; this.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); }); }
    this.resize();
    console.info('quality level', level, med ? 'median frame ' + med.toFixed(1) + ' ms' : '');
  }

  loop() {
    let last = performance.now();
    const tick = () => {
      requestAnimationFrame(tick);
      if (!this.active) return;
      const now = performance.now(), t = this.clock.getElapsedTime();
      this.adapt(now - last); last = now;
      this.stepAnims(now);
      // camera: gentle parallax towards the pointer
      this.par.lerp(this.mouse, 0.04);
      const cp = this.camBase.pos;
      this.camera.position.set(cp.x + this.par.x * 0.12, cp.y + this.par.y * 0.05 + Math.sin(t * 0.3) * 0.01, cp.z);
      this.camera.lookAt(this.camBase.look);
      // lanterns flicker, incense smoke rises
      for (const [i, l] of this.lanterns.entries()) {
        const f = 0.85 + 0.1 * Math.sin(t * 7.3 + i) + 0.05 * Math.sin(t * 13.1 + i * 2);
        l.userData.light.intensity = 2.2 * f; l.userData.metal.emissiveIntensity = 2.2 * f; l.userData.glow.material.opacity = 0.5 * f;
      }
      if (this.mabkhara) {
        this.mabkhara.userData.coal.emissiveIntensity = 1.4 + 0.4 * Math.sin(t * 2.1);
        for (const s of this.mabkhara.userData.puffs) {
          const u = (s.userData.t + t * 0.07) % 1;
          s.position.set(Math.sin(u * 9 + s.userData.t * 20) * 0.08 * u, 0.32 + u * 1.5, Math.cos(u * 7) * 0.05 * u);
          const sc = 0.12 + u * 0.55; s.scale.set(sc, sc, 1);
          s.material.opacity = 0.55 * Math.sin(Math.PI * u) * (1 - u * 0.4);
        }
      }
      for (let s = 0; s < 4; s++) {
        const m = this.seatGlow[s].material;
        const target = this.turnSeat === s ? 0.55 + 0.25 * Math.sin(t * 4) : 0;
        m.opacity += (target - m.opacity) * 0.15;
      }
      this.renderer.render(this.scene, this.camera);
      this.onFrame && this.onFrame();
    };
    tick();
  }
}
