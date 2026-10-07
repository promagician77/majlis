// node tests/run.mjs  — runs the real server code with no browser.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as R from '../site/src/engine/rules.js';
import { sha256hex } from '../site/src/engine/sha256.js';
import { Ledger } from '../site/src/engine/ledger.js';
import { MatchServer } from '../site/src/engine/server.js';
import { runMatches, mulberry32 } from '../site/src/engine/sim.js';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n    ', e.message); }
}

console.log('rules + crypto');
await test('SHA-256 matches node:crypto on 300 inputs (0..300 bytes, Arabic text)', () => {
  const rng = mulberry32(1);
  for (let i = 0; i < 300; i++) {
    const s = Array.from({ length: i }, () => String.fromCharCode(32 + Math.floor(rng() * 90))).join('') + (i % 7 === 0 ? 'مجلس' : '');
    assert.equal(sha256hex(s), createHash('sha256').update(s).digest('hex'));
  }
});
await test('deck has 32 unique cards, 8 per seat', () => {
  const d = R.makeDeck(); assert.ok(R.isValidDeck(d));
  const h = R.deal(R.shuffle(d, () => (Math.random() * 2 ** 32) >>> 0));
  assert.deepEqual(h.map((x) => x.length), [8, 8, 8, 8]);
  assert.equal(new Set(h.flat()).size, 32);
});
await test('shuffle is unbiased (ace of spades lands evenly, 64k shuffles)', () => {
  const rng = mulberry32(42); const counts = new Array(32).fill(0);
  for (let i = 0; i < 64000; i++) counts[R.shuffle(R.makeDeck(), () => (rng() * 2 ** 32) >>> 0).indexOf('AS')]++;
  for (const c of counts) assert.ok(c > 1700 && c < 2300, 'position count ' + c);
});
await test('follow-suit and trick winner', () => {
  assert.deepEqual(R.legalCards(['AS', '7H', 'KD'], [{ seat: 1, card: '9H' }]), ['7H']);
  assert.deepEqual(R.legalCards(['AS', 'KD'], [{ seat: 1, card: '9H' }]).length, 2);
  assert.equal(R.trickWinner([{ seat: 0, card: 'KH' }, { seat: 1, card: 'TH' }, { seat: 2, card: 'AS' }, { seat: 3, card: 'QH' }]), 1);
  assert.equal(R.makeDeck().reduce((s, c) => s + R.pointsOf(c), 0) + R.LAST_TRICK_BONUS, 130);
});

console.log('ledger');
await test('rejects unbalanced, overdraft, duplicate and cash-out', () => {
  const L = new Ledger();
  assert.ok(L.transfer('g1', 'mint', 'user:a', 100).ok);
  assert.equal(L.post('x', [{ acct: 'user:a', delta: -10 }, { acct: 'escrow:m:r1', delta: 9 }]).error, 'unbalanced');
  assert.equal(L.transfer('x2', 'user:a', 'escrow:m:r1', 101).error, 'insufficient_funds');
  assert.equal(L.transfer('g1', 'mint', 'user:a', 100).error, 'duplicate_tx');
  assert.equal(L.transfer('c1', 'user:a', 'bank:a', 50).error, 'closed_loop_no_external_account');
  assert.equal(L.balance('user:a'), 100);
  assert.ok(L.invariants().sumZero);
});

console.log('server');
function mk(extra = {}) {
  const inbox = { 0: [], 1: [], 2: [], 3: [], spectator: [] };
  const rng = mulberry32(5);
  const srv = new MatchServer({ matchId: 't', rand: rng, randomU32: () => (rng() * 2 ** 32) >>> 0, send: (to, m) => inbox[to].push(m),
    players: [{ id: 'a', name: 'A', bot: false }, { id: 'b', name: 'B', bot: true }, { id: 'c', name: 'C', bot: true }, { id: 'd', name: 'D', bot: true }],
    timings: { botMin: 0, botMax: 0, humanTurn: 5000, grace: 1000, trickPause: 10, nextRound: 100000, spectatorDelay: 500, chatGap: 1000 }, ...extra });
  return { srv, inbox };
}
const step = (srv, until, ms = 10) => { let g = 0; while (!until() && g++ < 100000) srv.tick(srv.now + ms); };

await test('server rejects out-of-turn, wrong card, replays, peeks, settlement and cash-out', () => {
  const { srv, inbox } = mk();
  srv.start(0);
  step(srv, () => srv.turn === 0 && (srv.phase === 'play' || srv.phase === 'challenge' || srv.phase === 'respond'));
  const other = srv.seats[1].hand[0];
  assert.equal(srv.handle(0, { t: 'peek', seat: 1, cseq: 1 }).reason, 'hidden_information');
  assert.equal(srv.handle(0, { t: 'settle', cseq: 2 }).reason, 'server_only');
  assert.equal(srv.handle(0, { t: 'cashout', cseq: 3 }).reason, 'closed_loop_no_external_account');
  assert.equal(srv.handle(0, { t: 'pass', cseq: 3 }).reason, 'replayed_or_stale');
  assert.equal(srv.handle(0, { t: 'chat', phrase: 99, cseq: 4 }).reason, 'phrase_not_allowed');
  assert.equal(srv.handle(0, { t: 'chat', phrase: 1, cseq: 5 }).ok, true);
  assert.equal(srv.handle(0, { t: 'chat', phrase: 1, cseq: 6 }).reason, 'rate_limited');
  // get to a play turn
  let c = 10;
  step(srv, () => { if (srv.turn === 0 && srv.phase === 'challenge') srv.handle(0, { t: 'pass', cseq: c++ }); if (srv.turn === 0 && srv.phase === 'respond') srv.handle(0, { t: 'accept', cseq: c++ }); return srv.phase === 'play' && srv.turn === 0; });
  assert.equal(srv.handle(0, { t: 'play', card: other, cseq: c++ }).reason, 'card_not_in_hand');
  const rej = inbox[0].filter((m) => m.type === 'reject').map((m) => m.reason);
  assert.ok(rej.includes('card_not_in_hand') && rej.includes('hidden_information'));
  assert.ok(!JSON.stringify(inbox[0].filter((m) => m.type !== 'reveal')).includes(`"${other}"`), 'seat 0 must never receive seat 1 card ids');
});

await test('disconnect -> bot covers after grace -> reconnect gets exact hand back', () => {
  const { srv, inbox } = mk();
  srv.start(0);
  srv.disconnect(0);
  const before = inbox[0].length;
  step(srv, () => srv.seats[0].autoplay);
  assert.equal(inbox[0].length, before, 'nothing delivered to a dropped socket');
  step(srv, () => srv.seats[0].hand.length <= 6 || srv.phase === 'settled');
  const snap = srv.reconnect(0);
  assert.deepEqual(snap.hand, srv.seats[0].hand);
  assert.equal(srv.seats[0].autoplay, false);
  assert.equal(snap.seats.length, 4);
  assert.ok(!('hand' in srv.snapshot('spectator')) || srv.snapshot('spectator').hand === undefined);
});

await test('spectator feed is delayed and carries no private hands', () => {
  const { srv, inbox } = mk();
  srv.start(0);
  srv.tick(100);
  assert.equal(inbox.spectator.length, 0, 'not yet: 500 ms delay');
  srv.tick(600);
  assert.ok(inbox.spectator.length > 0);
  assert.ok(inbox.spectator.every((m) => !('hand' in m) && !('legal' in m)));
});

await test('every snapshot accounts for exactly 32 cards (hands + table + won piles)', () => {
  const rng = mulberry32(3);
  const srv = new MatchServer({ rand: rng, randomU32: () => (rng() * 2 ** 32) >>> 0, players: [0, 1, 2, 3].map((i) => ({ id: 'p' + i, name: 'P' + i, bot: true })), timings: { botMin: 0, botMax: 40, trickPause: 50, nextRound: 50 } });
  srv.start(0);
  for (let t = 10; t < 120000; t += 10) {
    srv.tick(t);
    const m = srv.snapshot('spectator');
    const active = m.seats.filter((x) => !x.folded).length;
    const piles = m.seats.map((x) => x.tricks * active);
    if (m.phase === 'collect') piles[m.turn] -= m.trick.length;
    const total = m.seats.reduce((a, x) => a + x.count, 0) + piles.reduce((a, b) => a + b, 0) + m.trick.length;
    assert.equal(total, 32, `t=${t} phase=${m.phase}`);
  }
});

console.log('referee: full matches against the real server');
await test('400 bot matches x 3 rounds: no leaks, every play legal, commit verified, ledger balanced', async () => {
  const M = await runMatches({ matches: 400, rounds: 3, seed: 11 });
  console.log('     ', JSON.stringify({ rounds: M.rounds, plays: M.plays, challenges: M.challenges, withdrawals: M.withdrawals, commitChecked: M.commitChecked, ms: M.durationMs }));
  for (const k of ['leaks', 'spectatorLeaks', 'illegalAccepted', 'wrongWinner', 'pointMismatch', 'payoutMismatch', 'commitFailed', 'handMismatch', 'ledgerFailures', 'exceptions']) assert.equal(M[k], 0, k);
  assert.equal(M.rounds, 1200); assert.equal(M.commitChecked, 1200);
  assert.ok(M.challenges > 50 && M.withdrawals > 20, 'challenge/withdraw paths exercised');
});
await test('200 matches with a hostile client on seat 0 (forged cards, replays, drops)', async () => {
  const M = await runMatches({ matches: 200, rounds: 2, seed: 99, fuzz: true });
  console.log('     ', JSON.stringify({ fuzzSent: M.fuzzSent, rejected: M.rejected, resyncs: M.resyncs, takeovers: M.autoplayTakeovers, desync: M.desync }));
  for (const k of ['leaks', 'spectatorLeaks', 'illegalAccepted', 'wrongWinner', 'pointMismatch', 'payoutMismatch', 'commitFailed', 'ledgerFailures', 'exceptions', 'desync']) assert.equal(M[k], 0, k);
  assert.ok(M.rejected.card_not_in_hand > 0 && M.rejected.replayed_or_stale > 0 && M.resyncs > 0);
});

console.log('negative controls: the referee must catch a broken server');
await test('a server that leaks hands inside turn events is caught', async () => {
  const M = await runMatches({ matches: 5, rounds: 1, seed: 3, patch: (srv) => { const o = srv.emit.bind(srv); srv.emit = (type, pub, priv) => o(type, type === 'turn' ? { ...pub, debug: srv.seats.map((s) => s.hand) } : pub, priv); } });
  assert.ok(M.leaks > 0 && M.spectatorLeaks > 0, 'leaks ' + M.leaks);
});
await test('a server that lets bots ignore follow-suit is caught', async () => {
  const M = await runMatches({ matches: 5, rounds: 1, seed: 3, patch: (srv) => { const o = srv.botAct.bind(srv); srv.botAct = (s, to) => (srv.phase === 'play' ? srv.doPlay(s.seat, s.hand[s.hand.length - 1]) : o(s, to)); } });
  assert.ok(M.illegalAccepted > 0, 'illegal ' + M.illegalAccepted);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
