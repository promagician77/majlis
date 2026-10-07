// Headless referee: plays many matches against the real server code and checks,
// from the outside, everything a cheater or a buggy client could break.
// Used by `node tests/run.mjs` and by the "Stress test" tab in the browser.
import * as R from './rules.js';
import { MatchServer } from './server.js';
import { Ledger } from './ledger.js';

export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

async function sha256(str) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const FUZZ_TYPES = ['play', 'play', 'play', 'pass', 'challenge', 'accept', 'withdraw', 'chat', 'peek', 'settle', 'cashout', 'resync', 'ready', 'teleport'];

export async function runMatches({ matches = 100, rounds = 3, seed = 7, fuzz = false, onProgress, patch } = {}) {
  const t0 = Date.now();
  const M = { matches, rounds: 0, tricks: 0, plays: 0, messages: 0, bytes: 0, leaks: 0, spectatorLeaks: 0, illegalAccepted: 0,
    wrongWinner: 0, pointMismatch: 0, payoutMismatch: 0, commitChecked: 0, commitFailed: 0, handMismatch: 0, ledgerFailures: 0,
    desync: 0, resyncs: 0, autoplayTakeovers: 0, fuzzSent: 0, rejected: {}, exceptions: 0, challenges: 0, withdrawals: 0, cashoutBlocked: 0 };
  const pendingCommits = [];

  for (let m = 0; m < matches; m++) {
    const rng = mulberry32(seed * 7919 + m);
    const inbox = { 0: [], 1: [], 2: [], 3: [], spectator: [] };
    const ledger = new Ledger();
    const players = [
      { id: 'p0', name: 'P0', bot: !fuzz }, { id: 'p1', name: 'P1', bot: true }, { id: 'p2', name: 'P2', bot: true }, { id: 'p3', name: 'P3', bot: true },
    ];
    const srv = new MatchServer({ matchId: `sim${m}`, players, ledger, randomU32: () => (rng() * 4294967296) >>> 0, rand: rng,
      send: (to, msg) => { const s = JSON.stringify(msg); M.messages++; M.bytes += s.length; inbox[to].push(s); },
      timings: { botMin: 0, botMax: 30, humanTurn: 400, trickPause: 20, nextRound: 20, spectatorDelay: 0, grace: 150, chatGap: 50 } });
    if (patch) patch(srv);

    let now = 0, cseq = 0, guard = 0;
    const mirror = { hand: [], read: 0, connected: true };
    try {
      srv.start(0);
      while (!(srv.round >= rounds && srv.phase === 'settled') && guard++ < 200000) {
        now += 10;
        srv.tick(now);
        if (fuzz) {
          // what a hostile client would try, mixed with some honest moves so rounds progress
          if (rng() < 0.35 && mirror.connected) {
            M.fuzzSent++;
            const t = FUZZ_TYPES[Math.floor(rng() * FUZZ_TYPES.length)];
            const r = rng();
            let intent;
            if (r < 0.05) intent = null;
            else if (r < 0.08) intent = 'x'.repeat(50);
            else {
              const allCards = R.makeDeck();
              const cardPick = rng() < 0.5 ? srv.seats[0].hand[Math.floor(rng() * srv.seats[0].hand.length)] : allCards[Math.floor(rng() * 32)];
              intent = { t, card: rng() < 0.05 ? '<img onerror=1>' : cardPick, phrase: Math.floor(rng() * 12) - 2,
                cseq: rng() < 0.1 ? Math.max(0, cseq - 3) : rng() < 0.03 ? 1.5 : ++cseq };
            }
            srv.handle(0, intent);
          }
          if (rng() < 0.004 && mirror.connected) { srv.disconnect(0); mirror.connected = false; }
          else if (!mirror.connected && rng() < 0.01) { srv.reconnect(0); mirror.connected = true; M.resyncs++; }
          // client mirror for seat 0: rebuild hand only from what the server sent
          for (; mirror.read < inbox[0].length; mirror.read++) {
            const msg = JSON.parse(inbox[0][mirror.read]);
            if (msg.type === 'round') mirror.hand = msg.hand.slice();
            if (msg.type === 'play' && msg.seat === 0) mirror.hand.splice(mirror.hand.indexOf(msg.card), 1);
            if (msg.type === 'snapshot') mirror.hand = msg.hand.slice();
            if (msg.type === 'settle' && mirror.connected && JSON.stringify(R.sortHand(mirror.hand)) !== JSON.stringify(R.sortHand(srv.seats[0].hand))) M.desync++;
          }
        }
      }
      if (!mirror.connected) { srv.reconnect(0); }
      srv.now = now + 1e9; srv.flushSpectators();
    } catch (e) { M.exceptions++; console.error(e); }

    // ---------- independent checks ----------
    const inv = ledger.invariants();
    if (!inv.sumZero || inv.negative || inv.unbalancedTx || inv.openEscrow.length) M.ledgerFailures++;
    for (const [k, v] of Object.entries(srv.stats.rejected)) M.rejected[k] = (M.rejected[k] || 0) + v;
    M.cashoutBlocked += srv.stats.rejected.closed_loop_no_external_account || 0;

    // 1) hidden information: each seat may only ever see its own hand + publicly played cards
    for (const to of [0, 1, 2, 3, 'spectator']) {
      let known = new Set();
      let roundHands = [];
      for (const raw of inbox[to]) {
        const msg = JSON.parse(raw);
        if (msg.type === 'round') { known = new Set(msg.hand || []); roundHands.push(msg.hand); }
        if (msg.type === 'snapshot') { for (const c of msg.hand || []) known.add(c); for (const p of msg.trick) known.add(p.card); }
        if (msg.type === 'play') known.add(msg.card);
        if (msg.type === 'reveal') { for (let i = 0; i < 4; i++) if (to !== 'spectator' && roundHands.length && msg.dealt) { /* checked below */ } continue; }
        for (const c of raw.match(R.CARD_RE) || []) if (!known.has(c)) { to === 'spectator' ? M.spectatorLeaks++ : M.leaks++; }
      }
    }

    // 2) referee replay of every round from the public (spectator) stream
    const pub = inbox.spectator.map((s) => JSON.parse(s));
    const privRounds = inbox[1].map((s) => JSON.parse(s)).filter((x) => x.type === 'round');
    let buf = [], roundIdx = 0;
    for (const e of pub) {
      buf.push(e);
      if (e.type !== 'settle') continue;
      M.rounds++;
      const rev = buf.find((x) => x.type === 'reveal');
      const round = buf.find((x) => x.type === 'round');
      pendingCommits.push({ salt: rev.salt, deck: rev.deck, commit: rev.commit, roundCommit: round.commit });
      if (JSON.stringify(R.deal(rev.deck)) !== JSON.stringify(rev.dealt) || !R.isValidDeck(rev.deck)) M.commitFailed++;
      const pr = privRounds[roundIdx++];
      if (pr && JSON.stringify(pr.hand) !== JSON.stringify(rev.dealt[1])) M.handMismatch++;
      const hands = rev.dealt.map((h) => h.slice());
      const folded = [false, false, false, false];
      const pts = [0, 0, 0, 0];
      let trick = [];
      for (const x of buf) {
        if (x.type === 'challenge') M.challenges++;
        if (x.type === 'presence' && x.autoplay) M.autoplayTakeovers++;
        if (x.type === 'withdraw') { folded[x.seat] = true; M.withdrawals++; }
        if (x.type === 'play') {
          M.plays++;
          const h = hands[x.seat];
          if (!h.includes(x.card) || !R.legalCards(h, trick).includes(x.card) || folded[x.seat]) M.illegalAccepted++;
          h.splice(h.indexOf(x.card), 1);
          trick.push({ seat: x.seat, card: x.card });
        }
        if (x.type === 'trick') {
          M.tricks++;
          if (R.trickWinner(trick) !== x.winner) M.wrongWinner++;
          let p = R.trickPoints(trick); if (hands[x.winner].length === 0) p += R.LAST_TRICK_BONUS;
          if (p !== x.points) M.pointMismatch++;
          pts[x.winner] += p; trick = [];
        }
      }
      if (JSON.stringify(pts) !== JSON.stringify(e.points)) M.pointMismatch++;
      const activeSeats = [0, 1, 2, 3].filter((i) => !folded[i]);
      const best = Math.max(...activeSeats.map((i) => pts[i]));
      const expectWinners = activeSeats.length === 1 ? activeSeats : activeSeats.filter((i) => pts[i] === best);
      const paid = e.payouts.reduce((s, p) => s + p.amount, 0);
      if (paid !== e.pot || JSON.stringify([...e.winners].sort()) !== JSON.stringify(expectWinners.sort())) M.payoutMismatch++;
      if (rev.commit !== round.commit) M.commitFailed++;
      buf = [];
    }
    if (onProgress && (m % 10 === 9 || m === matches - 1)) await onProgress(m + 1, M);
  }

  // 3) commit-reveal checked with WebCrypto, independent of the server's own SHA-256
  for (const c of pendingCommits) {
    M.commitChecked++;
    if ((await sha256(`${c.salt}|${c.deck.join(',')}`)) !== c.roundCommit) M.commitFailed++;
  }
  M.durationMs = Date.now() - t0;
  return M;
}
