// Pure card rules. Shared by the authoritative server, the bots and the tests.
// NOTE: these are stand-in rules so the demo is playable. The client's own rule
// book replaces this file; nothing else in the server depends on the details.

export const SUITS = ['S', 'H', 'D', 'C'];             // spades, hearts, diamonds, clubs
export const RANKS = ['7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
// Trick strength inside a suit (Baloot-style non-trump order: A > 10 > K > Q > J > 9 > 8 > 7)
const STRENGTH = { '7': 0, '8': 1, '9': 2, J: 3, Q: 4, K: 5, T: 6, A: 7 };
export const POINTS = { A: 11, T: 10, K: 4, Q: 3, J: 2, '9': 0, '8': 0, '7': 0 };
export const LAST_TRICK_BONUS = 10;
export const HAND_SIZE = 8;
export const SEATS = 4;

export const rankOf = (c) => c[0];
export const suitOf = (c) => c[1];
export const pointsOf = (c) => POINTS[rankOf(c)];
export const strengthOf = (c) => STRENGTH[rankOf(c)];
export const CARD_RE = /\b[789TJQKA][SHDC]\b/g;

export function makeDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push(r + s);
  return d;                       // 32 unique ids, e.g. "AS", "TH", "7C"
}

export function isValidDeck(deck) {
  if (!Array.isArray(deck) || deck.length !== 32) return false;
  const all = new Set(makeDeck());
  const seen = new Set();
  for (const c of deck) { if (!all.has(c) || seen.has(c)) return false; seen.add(c); }
  return true;
}

// Unbiased Fisher-Yates driven by a byte source (crypto.getRandomValues in production).
export function shuffle(deck, randomU32) {
  const a = deck.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const n = i + 1;
    const limit = Math.floor(0x100000000 / n) * n;   // rejection sampling: no modulo bias
    let x; do { x = randomU32(); } while (x >= limit);
    const j = x % n;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function deal(deck) {
  const hands = [[], [], [], []];
  for (let i = 0; i < 32; i++) hands[i % 4].push(deck[i]);
  return hands.map(sortHand);
}

export function sortHand(h) {
  return h.slice().sort((a, b) => SUITS.indexOf(suitOf(a)) - SUITS.indexOf(suitOf(b)) || strengthOf(b) - strengthOf(a));
}

// trick: [{seat, card}] in play order
export function legalCards(hand, trick) {
  if (!trick.length) return hand.slice();
  const led = suitOf(trick[0].card);
  const follow = hand.filter((c) => suitOf(c) === led);
  return follow.length ? follow : hand.slice();
}

export function trickWinner(trick) {
  const led = suitOf(trick[0].card);
  let best = trick[0];
  for (const p of trick) if (suitOf(p.card) === led && strengthOf(p.card) > strengthOf(best.card)) best = p;
  return best.seat;
}

export const trickPoints = (trick) => trick.reduce((s, p) => s + pointsOf(p.card), 0);

export function handStrength(hand) {
  // rough value used by bots for challenge / accept / withdraw decisions
  let v = 0;
  const bySuit = {};
  for (const c of hand) { v += pointsOf(c); (bySuit[suitOf(c)] ||= []).push(c); }
  for (const s in bySuit) {
    const cards = bySuit[s];
    if (cards.some((c) => rankOf(c) === 'A')) v += 6;
    if (cards.some((c) => rankOf(c) === 'A') && cards.some((c) => rankOf(c) === 'T')) v += 6;
    if (cards.length >= 4) v += 3;
  }
  return v;
}
