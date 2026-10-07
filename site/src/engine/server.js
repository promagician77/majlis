// Authoritative match loop. In production this is a Nakama TypeScript match
// handler; here it runs in a Web Worker (browser) or plain Node (tests).
// Clients send *intents*; only the server decides what happened.
import * as R from './rules.js';
import { Ledger } from './ledger.js';
import { sha256hex } from './sha256.js';

export const CHAT_PHRASES = 8;      // preset quick-chat only: nothing to moderate
const DEFAULT_TIMINGS = { botMin: 650, botMax: 1300, humanTurn: 20000, grace: 8000, trickPause: 1150, nextRound: 9000, spectatorDelay: 2500, chatGap: 1500 };

function cryptoU32() {
  const pool = new Uint32Array(64); let i = 64;
  return () => { if (i >= 64) { crypto.getRandomValues(pool); i = 0; } return pool[i++]; };
}

export class MatchServer {
  constructor(opts = {}) {
    this.matchId = opts.matchId || 'm' + Date.now().toString(36);
    this.ante = opts.ante || 10;
    this.t = { ...DEFAULT_TIMINGS, ...(opts.timings || {}) };
    this.randomU32 = opts.randomU32 || cryptoU32();
    this.rand = opts.rand || Math.random;
    this.ledger = opts.ledger || new Ledger();
    this.send = opts.send || (() => {});
    this.now = opts.startTime || 0;
    const players = opts.players || [
      { id: 'you', name: 'You', bot: false }, { id: 'fahad', name: 'Fahad', bot: true },
      { id: 'noura', name: 'Noura', bot: true }, { id: 'salman', name: 'Salman', bot: true },
    ];
    this.seats = players.map((p, i) => ({ ...p, seat: i, acct: 'user:' + p.id, connected: true, autoplay: false, disconnectedAt: null,
      hand: [], folded: false, points: 0, tricks: 0, cseq: 0, lastChat: -1e12, ready: false }));
    this.round = 0; this.dealer = 3; this.phase = 'idle'; this.turn = -1; this.deadline = 0; this.botAt = 0;
    this.trick = []; this.trickNo = 0; this.challenge = null; this.asked = 0; this.responders = [];
    this.commit = null; this.secret = null; this.dealt = null; this.collectAt = 0; this.nextAt = 0;
    this.n = { 0: 0, 1: 0, 2: 0, 3: 0, spectator: 0 };
    this.specQueue = [];
    this.stats = { intents: 0, accepted: 0, rejected: {}, rounds: 0 };
    for (const s of this.seats) if (this.ledger.balance(s.acct) === 0) this.ledger.transfer(`welcome:${s.id}`, 'mint', s.acct, 1000, 'welcome coins');
  }

  // ---------- outbound ----------
  emit(type, pub = {}, priv = null) {
    for (const s of this.seats) {
      const msg = { n: ++this.n[s.seat], type, ...pub, ...(priv && priv[s.seat] ? priv[s.seat] : {}) };
      if (s.connected) this.send(s.seat, msg);       // a dropped socket simply misses it; reconnect resyncs
    }
    this.specQueue.push({ at: this.now + this.t.spectatorDelay, type, pub });
  }
  reply(seat, msg) { msg.n = ++this.n[seat]; if (this.seats[seat].connected) this.send(seat, msg); }
  flushSpectators() {
    while (this.specQueue.length && this.specQueue[0].at <= this.now) {
      const e = this.specQueue.shift();
      this.send('spectator', { n: ++this.n.spectator, type: e.type, ...e.pub });
    }
  }

  balances() { return this.seats.map((s) => this.ledger.balance(s.acct)); }
  escrow() { return `escrow:${this.matchId}:r${this.round}`; }
  pot() { return this.ledger.balance(this.escrow()); }
  active() { return this.seats.filter((s) => !s.folded); }
  nextActive(from) { for (let i = 1; i <= 4; i++) { const s = (from + i) % 4; if (!this.seats[s].folded) return s; } return -1; }

  setTurn(seat) {
    this.turn = seat;
    this.deadline = this.now + this.t.humanTurn;
    this.botAt = this.now + this.t.botMin + this.rand() * (this.t.botMax - this.t.botMin);
    const legal = this.phase === 'play' ? { [seat]: { legal: R.legalCards(this.seats[seat].hand, this.trick) } } : null;
    this.emit('turn', { phase: this.phase, turn: seat, msLeft: this.t.humanTurn, challenge: this.challenge }, legal);
  }

  // ---------- round lifecycle ----------
  startRound() {
    this.round++; this.stats.rounds++;
    this.dealer = (this.dealer + 1) % 4;
    for (const s of this.seats) {
      Object.assign(s, { hand: [], folded: false, points: 0, tricks: 0, ready: false });
      if (this.ledger.balance(s.acct) < this.ante * 2) this.ledger.transfer(`grant:${s.id}:r${this.round}`, 'mint', s.acct, 500, 'daily grant');
    }
    const esc = this.escrow();
    const ante = this.ledger.post(`ante:${this.matchId}:r${this.round}`,
      [...this.seats.map((s) => ({ acct: s.acct, delta: -this.ante })), { acct: esc, delta: this.ante * 4 }], `ante round ${this.round}`);
    if (!ante.ok) throw new Error('ante failed: ' + ante.error);

    const deck = R.shuffle(R.makeDeck(), this.randomU32);
    const salt = Array.from({ length: 4 }, () => this.randomU32().toString(16).padStart(8, '0')).join('');
    this.secret = { salt, deck };
    this.commit = sha256hex(`${salt}|${deck.join(',')}`);
    this.dealt = R.deal(deck);
    this.dealt.forEach((h, i) => { this.seats[i].hand = h.slice(); });
    this.challenge = null; this.trick = []; this.trickNo = 0; this.asked = 0; this.responders = [];
    this.phase = 'challenge';
    const priv = {}; this.seats.forEach((s) => { priv[s.seat] = { hand: s.hand.slice() }; });
    this.emit('round', { round: this.round, dealer: this.dealer, commit: this.commit, ante: this.ante, pot: this.pot(),
      counts: this.seats.map((s) => s.hand.length), balances: this.balances() }, priv);
    this.setTurn((this.dealer + 1) % 4);
  }

  startPlay() {
    this.phase = 'play'; this.trick = []; this.trickNo = 0;
    this.setTurn(this.nextActive(this.dealer));
  }

  endRound(reason) {
    this.phase = 'reveal'; this.turn = -1;
    // card reveal: salt + deck let every client re-hash and check the commit
    this.emit('reveal', { reason, salt: this.secret.salt, deck: this.secret.deck, commit: this.commit, dealt: this.dealt,
      unplayed: this.seats.map((s) => s.hand.slice()) });
    const act = this.active();
    let winners;
    if (act.length === 1) winners = [act[0].seat];
    else {
      const best = Math.max(...act.map((s) => s.points));
      winners = [];
      for (let i = 1; i <= 4; i++) { const s = this.seats[(this.dealer + i) % 4]; if (!s.folded && s.points === best) winners.push(s.seat); }
    }
    const pot = this.pot();
    const share = Math.floor(pot / winners.length);
    let rem = pot - share * winners.length;
    const payouts = winners.map((w) => { const amt = share + (rem > 0 ? rem : 0); rem = 0; return { seat: w, amount: amt }; });
    const txId = `settle:${this.matchId}:r${this.round}`;
    const res = this.ledger.post(txId, [{ acct: this.escrow(), delta: -pot }, ...payouts.map((p) => ({ acct: this.seats[p.seat].acct, delta: p.amount }))], `settle round ${this.round}`);
    if (!res.ok) throw new Error('settlement failed: ' + res.error);
    this.phase = 'settled';
    this.nextAt = this.now + this.t.nextRound;
    this.emit('settle', { txId, pot, winners, payouts, points: this.seats.map((s) => s.points), folded: this.seats.map((s) => s.folded),
      balances: this.balances(), nextIn: this.t.nextRound });
    // a little table talk from a bot (preset phrases only)
    const talkers = this.seats.filter((x) => x.bot && !winners.includes(x.seat));
    if (talkers.length && this.rand() < 0.55) this.emit('chat', { seat: talkers[Math.floor(this.rand() * talkers.length)].seat, phrase: this.rand() < 0.5 ? 5 : 6 });
  }

  // ---------- actions (already validated) ----------
  doPass(seat) {
    this.emit('pass', { seat });
    this.asked++;
    if (this.asked >= 4) return this.startPlay();
    this.setTurn((seat + 1) % 4);
  }
  doChallenge(seat) {
    const r = this.ledger.transfer(`challenge:${this.matchId}:r${this.round}`, this.seats[seat].acct, this.escrow(), this.ante, `challenge by seat ${seat}`);
    if (!r.ok) return this.reject(seat, 'insufficient_funds', 'challenge');
    this.challenge = { by: seat, mult: 2 };
    this.phase = 'respond';
    this.responders = [1, 2, 3].map((i) => (seat + i) % 4);
    this.emit('challenge', { seat, pot: this.pot(), balances: this.balances() });
    this.setTurn(this.responders.shift());
  }
  doRespond(seat, accept) {
    if (accept) {
      const r = this.ledger.transfer(`accept:${this.matchId}:r${this.round}:s${seat}`, this.seats[seat].acct, this.escrow(), this.ante, `accept by seat ${seat}`);
      if (!r.ok) accept = false;
    }
    if (!accept) this.seats[seat].folded = true;
    this.emit(accept ? 'accept' : 'withdraw', { seat, pot: this.pot(), balances: this.balances() });
    if (this.responders.length) return this.setTurn(this.responders.shift());
    if (this.active().length === 1) return this.endRound('all_withdrew');
    this.startPlay();
  }
  doPlay(seat, card) {
    const s = this.seats[seat];
    s.hand.splice(s.hand.indexOf(card), 1);
    this.trick.push({ seat, card });
    this.emit('play', { seat, card, trickNo: this.trickNo, counts: this.seats.map((x) => x.hand.length) });
    if (this.trick.length < this.active().length) return this.setTurn(this.nextActive(seat));
    const winner = R.trickWinner(this.trick);
    let pts = R.trickPoints(this.trick);
    const last = s.hand.length === 0;
    if (last) pts += R.LAST_TRICK_BONUS;
    this.seats[winner].points += pts; this.seats[winner].tricks++;
    this.phase = 'collect'; this.turn = winner;
    this.collectAt = this.now + this.t.trickPause;
    this.emit('trick', { winner, cards: this.trick.slice(), points: pts, last, totals: this.seats.map((x) => x.points), trickNo: this.trickNo });
  }
  afterCollect() {
    if (this.seats[this.turn].hand.length === 0) { this.trick = []; return this.endRound('tricks_done'); }
    this.phase = 'play'; this.trick = []; this.trickNo++;
    this.setTurn(this.turn);
  }

  // ---------- inbound ----------
  reject(seat, reason, t) {
    this.stats.rejected[reason] = (this.stats.rejected[reason] || 0) + 1;
    this.reply(seat, { type: 'reject', reason, intent: t });
    return { ok: false, reason };
  }

  handle(seat, intent) {
    this.stats.intents++;
    if (!(seat in this.seats)) return { ok: false, reason: 'no_such_seat' };
    const s = this.seats[seat];
    if (!intent || typeof intent !== 'object' || typeof intent.t !== 'string') return this.reject(seat, 'malformed', '?');
    const t = intent.t;
    if (!Number.isInteger(intent.cseq) || intent.cseq <= s.cseq) return this.reject(seat, 'replayed_or_stale', t);
    s.cseq = intent.cseq;
    const myTurn = this.turn === seat;
    switch (t) {
      case 'pass': case 'challenge':
        if (this.phase !== 'challenge') return this.reject(seat, 'wrong_phase', t);
        if (!myTurn) return this.reject(seat, 'not_your_turn', t);
        this.stats.accepted++;
        t === 'pass' ? this.doPass(seat) : this.doChallenge(seat);
        return { ok: true };
      case 'accept': case 'withdraw':
        if (this.phase !== 'respond') return this.reject(seat, 'wrong_phase', t);
        if (!myTurn) return this.reject(seat, 'not_your_turn', t);
        this.stats.accepted++;
        this.doRespond(seat, t === 'accept');
        return { ok: true };
      case 'play': {
        if (this.phase !== 'play') return this.reject(seat, 'wrong_phase', t);
        if (!myTurn) return this.reject(seat, 'not_your_turn', t);
        if (typeof intent.card !== 'string' || !s.hand.includes(intent.card)) return this.reject(seat, 'card_not_in_hand', t);
        if (!R.legalCards(s.hand, this.trick).includes(intent.card)) return this.reject(seat, 'must_follow_suit', t);
        this.stats.accepted++;
        this.doPlay(seat, intent.card);
        return { ok: true };
      }
      case 'chat': {
        const p = intent.phrase;
        if (!Number.isInteger(p) || p < 0 || p >= CHAT_PHRASES) return this.reject(seat, 'phrase_not_allowed', t);
        if (this.now - s.lastChat < this.t.chatGap) return this.reject(seat, 'rate_limited', t);
        s.lastChat = this.now; this.stats.accepted++;
        this.emit('chat', { seat, phrase: p });
        return { ok: true };
      }
      case 'ready':
        s.ready = true;
        if (this.phase === 'settled' && this.seats.every((x) => x.bot || x.ready)) this.nextAt = this.now;
        return { ok: true };
      case 'resync':
        this.reply(seat, this.snapshot(seat));
        return { ok: true };
      case 'peek': return this.reject(seat, 'hidden_information', t);
      case 'settle': return this.reject(seat, 'server_only', t);
      case 'cashout': {
        // the ledger has no account kind that leaves the game: try it and show the refusal
        const r = this.ledger.transfer(`cashout:${s.id}:${intent.cseq}`, s.acct, 'bank:' + s.id, 100, 'cash-out attempt');
        return this.reject(seat, r.error, t);
      }
      default: return this.reject(seat, 'unknown_intent', t);
    }
  }

  disconnect(seat) {
    const s = this.seats[seat];
    if (!s.connected) return;
    s.connected = false; s.disconnectedAt = this.now;
    this.emit('presence', { seat, connected: false, autoplay: false });
  }
  reconnect(seat) {
    const s = this.seats[seat];
    s.connected = true; s.disconnectedAt = null;
    const was = s.autoplay; s.autoplay = false;
    this.emit('presence', { seat, connected: true, autoplay: false, wasAutoplay: was });
    const snap = this.snapshot(seat);
    this.reply(seat, snap);
    return snap;
  }

  snapshot(who) {
    const isSeat = who !== 'spectator';
    return {
      type: 'snapshot', matchId: this.matchId, round: this.round, dealer: this.dealer, phase: this.phase, turn: this.turn,
      msLeft: Math.max(0, this.deadline - this.now), commit: this.commit, ante: this.ante, pot: this.round ? this.pot() : 0,
      challenge: this.challenge, trick: this.trick.slice(), trickNo: this.trickNo,
      seats: this.seats.map((s) => ({ seat: s.seat, name: s.name, bot: s.bot, connected: s.connected, autoplay: s.autoplay, folded: s.folded,
        points: s.points, tricks: s.tricks, count: s.hand.length, balance: this.ledger.balance(s.acct) })),
      you: isSeat ? who : null,
      hand: isSeat ? this.seats[who].hand.slice() : undefined,
      legal: isSeat && this.phase === 'play' && this.turn === who ? R.legalCards(this.seats[who].hand, this.trick) : undefined,
    };
  }

  // ---------- clock ----------
  tick(now) {
    this.now = now;
    this.flushSpectators();
    if (this.phase === 'idle') return;
    if (this.phase === 'collect') { if (now >= this.collectAt) this.afterCollect(); return; }
    if (this.phase === 'settled') { if (now >= this.nextAt) this.startRound(); return; }
    for (const s of this.seats) {
      if (!s.bot && !s.connected && !s.autoplay && now - s.disconnectedAt >= this.t.grace) {
        s.autoplay = true;
        this.emit('presence', { seat: s.seat, connected: false, autoplay: true });
      }
    }
    if (this.turn < 0) return;
    const s = this.seats[this.turn];
    if (s.bot || s.autoplay) { if (now >= this.botAt) this.botAct(s, false); }
    else if (now >= this.deadline) this.botAct(s, true);
  }

  start(now = this.now) { this.now = now; if (this.phase === 'idle') this.startRound(); }

  // ---------- bots: see only their own hand and the public trick ----------
  botAct(s, timeout) {
    if (timeout) this.emit('timeout', { seat: s.seat });
    const v = R.handStrength(s.hand);
    if (this.phase === 'challenge') {
      if (!this.challenge && v > 52 + this.rand() * 12) this.doChallenge(s.seat); else this.doPass(s.seat);
      return;
    }
    if (this.phase === 'respond') { this.doRespond(s.seat, v > 33 + this.rand() * 10); return; }
    if (this.phase !== 'play') return;
    const legal = R.legalCards(s.hand, this.trick);
    let card;
    const low = (cs) => cs.slice().sort((a, b) => R.pointsOf(a) - R.pointsOf(b) || R.strengthOf(a) - R.strengthOf(b))[0];
    if (!this.trick.length) {
      const aces = legal.filter((c) => R.rankOf(c) === 'A');
      card = aces.length ? aces[0] : low(legal);
    } else {
      const led = R.suitOf(this.trick[0].card);
      const top = this.trick.filter((p) => R.suitOf(p.card) === led).reduce((a, b) => (R.strengthOf(b.card) > R.strengthOf(a.card) ? b : a));
      const winners = legal.filter((c) => R.suitOf(c) === led && R.strengthOf(c) > R.strengthOf(top.card));
      const lastToPlay = this.trick.length === this.active().length - 1;
      if (winners.length && (lastToPlay || R.trickPoints(this.trick) >= 10 || this.rand() < 0.5))
        card = lastToPlay ? winners.sort((a, b) => R.strengthOf(a) - R.strengthOf(b))[0] : winners.sort((a, b) => R.strengthOf(b) - R.strengthOf(a))[0];
      else card = low(legal);
    }
    this.doPlay(s.seat, card);
  }

  // server memory: never serialised to a client channel
  debugState() {
    return { phase: this.phase, round: this.round, turn: this.turn, commit: this.commit, salt: this.secret?.salt,
      deck: this.secret?.deck, hands: this.seats.map((s) => s.hand.slice()), pot: this.round ? this.pot() : 0,
      escrow: this.round ? this.escrow() : null, stats: this.stats };
  }
}
