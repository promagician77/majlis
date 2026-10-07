// Original card faces drawn in code (suits are vector paths, not emoji glyphs,
// so they render identically on iOS, Android and desktop).
import * as THREE from 'three';
import { cv, star8 } from './textures.js';

export const CW = 320, CH = 448;
const RED = '#b0222c', INK = '#1b1a1f', PAPER = '#f7f0e2', GOLD = '#c6973f';
export const suitColor = (s) => (s === 'H' || s === 'D' ? RED : INK);
export const rankLabel = (r) => (r === 'T' ? '10' : r);

export function suitPath(g, s, x, y, k) {
  g.beginPath();
  if (s === 'H') {
    g.moveTo(x, y + 0.42 * k);
    g.bezierCurveTo(x - 0.18 * k, y + 0.22 * k, x - 0.52 * k, y + 0.02 * k, x - 0.5 * k, y - 0.2 * k);
    g.bezierCurveTo(x - 0.48 * k, y - 0.44 * k, x - 0.12 * k, y - 0.5 * k, x, y - 0.24 * k);
    g.bezierCurveTo(x + 0.12 * k, y - 0.5 * k, x + 0.48 * k, y - 0.44 * k, x + 0.5 * k, y - 0.2 * k);
    g.bezierCurveTo(x + 0.52 * k, y + 0.02 * k, x + 0.18 * k, y + 0.22 * k, x, y + 0.42 * k);
  } else if (s === 'D') {
    g.moveTo(x, y - 0.5 * k);
    g.quadraticCurveTo(x + 0.14 * k, y - 0.2 * k, x + 0.38 * k, y);
    g.quadraticCurveTo(x + 0.14 * k, y + 0.2 * k, x, y + 0.5 * k);
    g.quadraticCurveTo(x - 0.14 * k, y + 0.2 * k, x - 0.38 * k, y);
    g.quadraticCurveTo(x - 0.14 * k, y - 0.2 * k, x, y - 0.5 * k);
  } else if (s === 'S') {
    g.moveTo(x, y - 0.48 * k);
    g.bezierCurveTo(x + 0.14 * k, y - 0.28 * k, x + 0.52 * k, y - 0.1 * k, x + 0.48 * k, y + 0.14 * k);
    g.bezierCurveTo(x + 0.45 * k, y + 0.34 * k, x + 0.16 * k, y + 0.36 * k, x + 0.04 * k, y + 0.2 * k);
    g.quadraticCurveTo(x + 0.08 * k, y + 0.4 * k, x + 0.16 * k, y + 0.5 * k);
    g.lineTo(x - 0.16 * k, y + 0.5 * k);
    g.quadraticCurveTo(x - 0.08 * k, y + 0.4 * k, x - 0.04 * k, y + 0.2 * k);
    g.bezierCurveTo(x - 0.16 * k, y + 0.36 * k, x - 0.45 * k, y + 0.34 * k, x - 0.48 * k, y + 0.14 * k);
    g.bezierCurveTo(x - 0.52 * k, y - 0.1 * k, x - 0.14 * k, y - 0.28 * k, x, y - 0.48 * k);
  } else {
    const r = 0.215 * k;
    g.arc(x, y - 0.25 * k, r, 0, Math.PI * 2);
    g.moveTo(x - 0.2 * k + r, y + 0.07 * k); g.arc(x - 0.2 * k, y + 0.07 * k, r, 0, Math.PI * 2);
    g.moveTo(x + 0.2 * k + r, y + 0.07 * k); g.arc(x + 0.2 * k, y + 0.07 * k, r, 0, Math.PI * 2);
    g.moveTo(x - 0.1 * k, y - 0.05 * k); g.lineTo(x + 0.1 * k, y - 0.05 * k); g.lineTo(x + 0.1 * k, y + 0.12 * k); g.lineTo(x - 0.1 * k, y + 0.12 * k);
    g.moveTo(x, y); g.quadraticCurveTo(x + 0.04 * k, y + 0.38 * k, x + 0.17 * k, y + 0.5 * k); g.lineTo(x - 0.17 * k, y + 0.5 * k); g.quadraticCurveTo(x - 0.04 * k, y + 0.38 * k, x, y);
  }
  g.fill('nonzero');
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

const PIPS = {
  '7': [[0.22, 0.17], [0.78, 0.17], [0.5, 0.335], [0.22, 0.5], [0.78, 0.5], [0.22, 0.83], [0.78, 0.83]],
  '8': [[0.22, 0.17], [0.78, 0.17], [0.5, 0.335], [0.22, 0.5], [0.78, 0.5], [0.5, 0.665], [0.22, 0.83], [0.78, 0.83]],
  '9': [[0.22, 0.17], [0.78, 0.17], [0.22, 0.39], [0.78, 0.39], [0.5, 0.5], [0.22, 0.61], [0.78, 0.61], [0.22, 0.83], [0.78, 0.83]],
  T: [[0.22, 0.17], [0.78, 0.17], [0.5, 0.28], [0.22, 0.39], [0.78, 0.39], [0.22, 0.61], [0.78, 0.61], [0.5, 0.72], [0.22, 0.83], [0.78, 0.83]],
};

function paper(g) {
  g.clearRect(0, 0, CW, CH);
  roundRect(g, 2, 2, CW - 4, CH - 4, 22); g.fillStyle = PAPER; g.fill();
  const grd = g.createLinearGradient(0, 0, CW, CH);
  grd.addColorStop(0, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(160,120,60,0.10)');
  g.fillStyle = grd; g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.stroke();
  roundRect(g, 14, 14, CW - 28, CH - 28, 14); g.strokeStyle = GOLD; g.lineWidth = 2; g.stroke();
}

function corner(g, rank, s) {
  const col = suitColor(s);
  g.fillStyle = col;
  g.font = `800 ${rank === 'T' ? 50 : 58}px Tajawal, system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.fillText(rankLabel(rank), 48, 76);
  suitPath(g, s, 48, 106, 40);
}

export function drawFace(card) {
  const [c, g] = cv(CW, CH);
  const rank = card[0], s = card[1], col = suitColor(s);
  paper(g);
  corner(g, rank, s);
  g.save(); g.translate(CW, CH); g.rotate(Math.PI); corner(g, rank, s); g.restore();
  const ix = 60, iy = 40, iw = CW - 120, ih = CH - 80;
  if (PIPS[rank]) {
    g.fillStyle = col;
    for (const [px, py] of PIPS[rank]) {
      const x = ix + px * iw, y = iy + py * ih;
      if (py > 0.5) { g.save(); g.translate(x, y); g.rotate(Math.PI); suitPath(g, s, 0, 0, 52); g.restore(); } else suitPath(g, s, x, y, 52);
    }
  } else if (rank === 'A') {
    g.strokeStyle = GOLD; g.lineWidth = 3;
    star8(g, CW / 2, CH / 2, 112, Math.PI / 8); g.stroke();
    star8(g, CW / 2, CH / 2, 100, 0); g.stroke();
    g.fillStyle = col; suitPath(g, s, CW / 2, CH / 2 + 4, 120);
  } else {
    // court cards: original geometric panels instead of traditional portraits
    const tint = s === 'H' || s === 'D' ? 'rgba(176,34,44,0.09)' : 'rgba(20,70,60,0.10)';
    roundRect(g, ix + 10, iy + 18, iw - 20, ih - 36, 12); g.fillStyle = tint; g.fill(); g.strokeStyle = GOLD; g.lineWidth = 3; g.stroke();
    g.save(); g.clip();
    g.strokeStyle = 'rgba(198,151,63,0.35)'; g.lineWidth = 1.5;
    for (let y = iy + 18; y < iy + ih; y += 40) for (let x = ix + 10; x < ix + iw; x += 40) { star8(g, x + 20, y + 20, 14, Math.PI / 8); g.stroke(); }
    g.restore();
    g.fillStyle = PAPER; g.beginPath(); g.arc(CW / 2, CH / 2, 70, 0, 7); g.fill();
    g.strokeStyle = GOLD; g.lineWidth = 4; star8(g, CW / 2, CH / 2, 84, Math.PI / 8); g.stroke();
    g.fillStyle = col; g.font = '700 96px "Reem Kufi", Tajawal, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(rank, CW / 2, CH / 2 + 6);
    suitPath(g, s, CW / 2, iy + 62, 40);
    g.save(); g.translate(CW / 2, iy + ih - 62); g.rotate(Math.PI); suitPath(g, s, 0, 0, 40); g.restore();
  }
  return c;
}

export function drawBack() {
  const [c, g] = cv(CW, CH);
  g.clearRect(0, 0, CW, CH);
  roundRect(g, 2, 2, CW - 4, CH - 4, 22); g.fillStyle = '#0e4a3e'; g.fill();
  g.save(); g.clip();
  g.strokeStyle = 'rgba(214,170,90,0.28)'; g.lineWidth = 1.6;
  for (let y = -20; y < CH + 40; y += 36) for (let x = (y / 36) % 2 ? -18 : 0; x < CW + 40; x += 36) { star8(g, x, y, 12, Math.PI / 8); g.stroke(); }
  g.restore();
  roundRect(g, 16, 16, CW - 32, CH - 32, 14); g.strokeStyle = '#d6aa5a'; g.lineWidth = 4; g.stroke();
  roundRect(g, 26, 26, CW - 52, CH - 52, 10); g.lineWidth = 1.5; g.stroke();
  g.fillStyle = '#0e4a3e'; g.beginPath(); g.arc(CW / 2, CH / 2, 74, 0, 7); g.fill();
  g.strokeStyle = '#d6aa5a'; g.lineWidth = 4; star8(g, CW / 2, CH / 2, 86, Math.PI / 8); g.stroke();
  g.beginPath(); g.arc(CW / 2, CH / 2, 60, 0, 7); g.stroke();
  g.fillStyle = '#e8c27a'; g.font = '700 64px "Reem Kufi", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('٣٢', CW / 2, CH / 2 + 4);
  return c;
}

export function cardTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
