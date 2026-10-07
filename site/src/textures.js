// Procedural textures drawn at load time: no image files to license, nothing
// that looks like a stock asset, and every motif is a Saudi/Najdi reference
// (Al Sadu weaving, Najdi triangle friezes, 8-point star geometry).
import * as THREE from 'three';

export function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function rnd(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
export function tex(c, { repeat, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

export function star8(g, x, y, r, rot = 0) {
  // two interlocked squares
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = rot + (i * Math.PI) / 8;
    const rr = i % 2 === 0 ? r : r * 0.7654;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.closePath();
}

function fibers(g, w, h, n, seed, light = 'rgba(255,255,255,0.05)', dark = 'rgba(0,0,0,0.06)', len = 6) {
  const r = rnd(seed);
  g.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, a = r() * Math.PI;
    g.strokeStyle = r() < 0.5 ? light : dark;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
}

export function feltTexture() {
  const S = 2048, R = S / 2;
  const [c, g] = cv(S, S);
  const grd = g.createRadialGradient(R, R, 50, R, R, R);
  grd.addColorStop(0, '#17614f'); grd.addColorStop(0.7, '#0f4a3d'); grd.addColorStop(1, '#0a3329');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  fibers(g, S, S, 90000, 7, 'rgba(255,255,255,0.035)', 'rgba(0,0,0,0.07)', 5);
  const gold = '#d9ae5f';
  g.strokeStyle = gold; g.lineWidth = 5;
  for (const rr of [0.955, 0.905]) { g.beginPath(); g.arc(R, R, R * rr, 0, Math.PI * 2); g.stroke(); }
  // star band between the two rings
  g.fillStyle = 'rgba(217,174,95,0.85)';
  for (let i = 0; i < 56; i++) {
    const a = (i / 56) * Math.PI * 2;
    star8(g, R + Math.cos(a) * R * 0.93, R + Math.sin(a) * R * 0.93, 15, a); g.fill();
  }
  // trick area ring
  g.setLineDash([18, 14]); g.lineWidth = 3; g.strokeStyle = 'rgba(217,174,95,0.45)';
  g.beginPath(); g.arc(R, R, R * 0.5, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  // central medallion: interlaced 8-point star
  g.lineWidth = 6; g.strokeStyle = 'rgba(217,174,95,0.55)';
  star8(g, R, R, 170, Math.PI / 8); g.stroke();
  star8(g, R, R, 120, 0); g.stroke();
  g.beginPath(); g.arc(R, R, 205, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    g.beginPath(); g.arc(R + Math.cos(a) * 205, R + Math.sin(a) * 205, 22, 0, Math.PI * 2); g.stroke();
  }
  return tex(c, { aniso: 16 });
}

export function woodTexture(seed = 3, base = '#4a2a17') {
  const [c, g] = cv(1024, 256);
  g.fillStyle = base; g.fillRect(0, 0, 1024, 256);
  const r = rnd(seed);
  for (let i = 0; i < 220; i++) {
    const y0 = r() * 256, amp = 2 + r() * 6, f = 0.004 + r() * 0.01, ph = r() * 7;
    g.strokeStyle = r() < 0.5 ? `rgba(20,8,2,${0.12 + r() * 0.2})` : `rgba(150,90,50,${0.06 + r() * 0.1})`;
    g.lineWidth = 0.6 + r() * 2.2;
    g.beginPath();
    for (let x = 0; x <= 1024; x += 8) { const y = y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3.1 + ph) * amp * 0.3; x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  return tex(c, { repeat: [3, 1] });
}

// Al Sadu: Bedouin weaving (UNESCO intangible heritage) — red/black/white bands
export function saduTexture(seed = 11, scale = 1) {
  const W = 1024, H = 512;
  const [c, g] = cv(W, H);
  const red = '#a3221c', blk = '#1d1512', wht = '#efe2c8', ochre = '#c98a2e', dred = '#6e1712';
  g.fillStyle = red; g.fillRect(0, 0, W, H);
  const bands = [
    [0, 24, blk], [24, 10, wht], [34, 70, 'tri'], [104, 10, wht], [114, 22, blk], [136, 112, 'dia'], [248, 22, blk],
    [270, 10, wht], [280, 60, 'zig'], [340, 10, wht], [350, 26, ochre], [376, 90, 'eye'], [466, 12, wht], [478, 34, blk],
  ];
  for (const [y, h, kind] of bands) {
    if (kind.startsWith('#')) { g.fillStyle = kind; g.fillRect(0, y, W, h); continue; }
    if (kind === 'tri') {
      g.fillStyle = blk; g.fillRect(0, y, W, h);
      const n = 32, w = W / n;
      for (let i = 0; i < n; i++) {
        g.fillStyle = i % 2 ? red : wht;
        g.beginPath(); g.moveTo(i * w, y + h); g.lineTo(i * w + w / 2, y + 6); g.lineTo(i * w + w, y + h); g.fill();
      }
    }
    if (kind === 'dia') {
      g.fillStyle = dred; g.fillRect(0, y, W, h);
      const n = 8, w = W / n;
      for (let i = 0; i < n; i++) {
        const cx = i * w + w / 2, cy = y + h / 2;
        for (const [s, col] of [[h * 0.48, wht], [h * 0.36, blk], [h * 0.24, red], [h * 0.11, wht]]) {
          g.fillStyle = col; g.beginPath(); g.moveTo(cx, cy - s); g.lineTo(cx + s * 1.1, cy); g.lineTo(cx, cy + s); g.lineTo(cx - s * 1.1, cy); g.fill();
        }
        g.fillStyle = wht;
        for (const dx of [-w / 2, w / 2]) { g.beginPath(); g.moveTo(cx + dx, cy - 14); g.lineTo(cx + dx + 14, cy); g.lineTo(cx + dx, cy + 14); g.lineTo(cx + dx - 14, cy); g.fill(); }
      }
    }
    if (kind === 'zig') {
      g.fillStyle = blk; g.fillRect(0, y, W, h);
      g.strokeStyle = wht; g.lineWidth = 9;
      g.beginPath();
      const n = 32, w = W / n;
      for (let i = 0; i <= n; i++) g.lineTo(i * w, y + (i % 2 ? 12 : h - 12));
      g.stroke();
      g.fillStyle = red;
      for (let i = 0; i < n; i++) { g.beginPath(); g.arc(i * w + w / 2, y + (i % 2 ? h - 16 : 16), 6, 0, 7); g.fill(); }
    }
    if (kind === 'eye') {
      g.fillStyle = wht; g.fillRect(0, y, W, h);
      const n = 16, w = W / n;
      for (let i = 0; i < n; i++) {
        const cx = i * w + w / 2, cy = y + h / 2;
        g.fillStyle = blk; g.fillRect(cx - 26, cy - 26, 52, 52);
        g.fillStyle = red; g.fillRect(cx - 15, cy - 15, 30, 30);
        g.fillStyle = wht; g.fillRect(cx - 6, cy - 6, 12, 12);
        g.fillStyle = ochre; g.fillRect(i * w, cy - 3, 6, 6);
      }
    }
  }
  fibers(g, W, H, 26000, seed, 'rgba(255,255,255,0.06)', 'rgba(0,0,0,0.12)', 4);
  // weft lines
  g.fillStyle = 'rgba(0,0,0,0.07)';
  for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
  return tex(c, { repeat: [scale, scale] });
}

export function plasterTexture() {
  const W = 1024, H = 512;
  const [c, g] = cv(W, H);
  g.fillStyle = '#cfb48c'; g.fillRect(0, 0, W, H);
  const r = rnd(5);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '255,240,215' : '120,85,50'},${0.03 + r() * 0.05})`;
    g.beginPath(); g.ellipse(r() * W, r() * H, 10 + r() * 60, 6 + r() * 30, r() * 3, 0, 7); g.fill();
  }
  // Najdi frieze: band of stepped white triangles near the top of the wall
  const y = 58, h = 40;
  g.fillStyle = '#8e4f2a'; g.fillRect(0, y - 8, W, h + 16);
  const n = 32, w = W / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = '#f2e6cf';
    g.beginPath(); g.moveTo(i * w + 2, y + h); g.lineTo(i * w + w / 2, y); g.lineTo(i * w + w - 2, y + h); g.fill();
    g.fillStyle = '#8e4f2a';
    g.beginPath(); g.moveTo(i * w + w / 2 - 6, y + h - 4); g.lineTo(i * w + w / 2, y + h - 16); g.lineTo(i * w + w / 2 + 6, y + h - 4); g.fill();
  }
  g.fillStyle = '#f2e6cf'; g.fillRect(0, y + h + 12, W, 4); g.fillRect(0, y - 14, W, 4);
  fibers(g, W, H, 12000, 9, 'rgba(255,255,255,0.05)', 'rgba(0,0,0,0.05)', 3);
  return tex(c, { repeat: [5, 1] });
}

export function lattice(cell = 64, size = 512) {
  // mashrabiya alpha: white = wood, black = hole
  const [c, g] = cv(size, size);
  g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
  g.fillStyle = '#000';
  for (let y = 0; y < size; y += cell) for (let x = 0; x < size; x += cell) {
    star8(g, x + cell / 2, y + cell / 2, cell * 0.36, Math.PI / 8); g.fill();
    for (const [dx, dy] of [[0, 0], [cell, 0], [0, cell], [cell, cell]]) { g.beginPath(); g.arc(x + dx, y + dy, cell * 0.09, 0, 7); g.fill(); }
  }
  const t = tex(c, { srgb: false });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function glowTexture(inner = 'rgba(255,190,110,1)', outer = 'rgba(255,120,40,0)') {
  const [c, g] = cv(128, 128);
  const grd = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grd.addColorStop(0, inner); grd.addColorStop(1, outer);
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return tex(c);
}

export function smokeTexture() {
  const [c, g] = cv(128, 128);
  const r = rnd(4);
  for (let i = 0; i < 24; i++) {
    const x = 64 + (r() - 0.5) * 50, y = 64 + (r() - 0.5) * 50, rr = 16 + r() * 30;
    const grd = g.createRadialGradient(x, y, 0, x, y, rr);
    grd.addColorStop(0, 'rgba(235,230,225,0.10)'); grd.addColorStop(1, 'rgba(235,230,225,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  }
  return tex(c);
}

export function coinTexture() {
  const [c, g] = cv(128, 128);
  const grd = g.createRadialGradient(54, 50, 6, 64, 64, 64);
  grd.addColorStop(0, '#ffe7a3'); grd.addColorStop(0.6, '#d9a640'); grd.addColorStop(1, '#a8741d');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(110,70,10,0.8)'; g.lineWidth = 4;
  g.beginPath(); g.arc(64, 64, 52, 0, 7); g.stroke();
  g.lineWidth = 3; star8(g, 64, 64, 30, Math.PI / 8); g.stroke();
  return tex(c);
}

export function porcelainTexture() {
  const [c, g] = cv(512, 128);
  g.fillStyle = '#f7f2ea'; g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#c99a3a'; g.fillRect(0, 4, 512, 8); g.fillRect(0, 112, 512, 5);
  g.strokeStyle = '#2f6b5a'; g.lineWidth = 2;
  for (let i = 0; i < 16; i++) { star8(g, 16 + i * 32, 46, 9, 0); g.stroke(); }
  return tex(c);
}

export function lanternPanel() {
  const [c, g] = cv(256, 256);
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#fff';
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { star8(g, 32 + x * 64, 32 + y * 64, 20, Math.PI / 8); g.fill(); }
  g.beginPath(); g.arc(128, 128, 9, 0, 7); g.fill();
  return tex(c);
}
