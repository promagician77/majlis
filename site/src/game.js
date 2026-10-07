// Client controller: turns server messages into table animations + HUD.
// It never computes a game result; it only renders what the server said.
import { i18n } from './i18n.js';
import * as R from './engine/rules.js';
import { sfx } from './sfx.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s, el = document) => el.querySelector(s);
const RING = 188.5;
const COIN = '<i class="cn"></i>';
const sep = () => (i18n.lang === 'ar' ? ' — ' : ' · ');

export async function sha256(str) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export class Game {
  constructor(net, table) {
    this.net = net; this.table = table;
    this.s = this.blank();
    this.queue = []; this.busy = false; this.expectN = 0; this.awaitSnap = false;
    this.spectator = false; this.offline = false; this.started = false; this.epoch = 0;
    this.hooks = { reveal: [], round: [] };
    this.seatEls = [...document.querySelectorAll('.seat')];
    this.buildSeats();
    net.on((m) => this.onMsg(m));
    table.onCardClick = (id) => this.clickCard(id);
    table.onFrame = () => this.frame();
    this.buildChat();
  }
  blank() {
    return { round: 0, dealer: 0, phase: 'idle', turn: -1, turnEnds: 0, turnTotal: 20000, hand: [], dealtHand: [], legal: null, counts: [0, 0, 0, 0], trick: [],
      points: [0, 0, 0, 0], folded: [false, false, false, false], balances: [0, 0, 0, 0], pot: 0, ante: 10, challenge: null, commit: null,
      connected: [true, true, true, true], autoplay: [false, false, false, false], bots: [false, true, true, true], tricks: [0, 0, 0, 0], verified: null };
  }
  name(seat) { return i18n.t('names')[seat]; }

  // ---------------- inbound ----------------
  onMsg(m) {
    if (m.type === 'snapshot') { this.queue = [m]; this.awaitSnap = false; this.expectN = m.n + 1; this.pump(); return; }
    if (this.awaitSnap) return;
    if (this.expectN && m.n !== this.expectN) {
      this.toast(i18n.t('gap'));
      this.awaitSnap = true;
      if (!this.spectator) this.net.send({ t: 'resync' });
      return;
    }
    this.expectN = m.n + 1;
    this.queue.push(m);
    this.pump();
  }
  async pump() {
    if (this.busy) return;
    this.busy = true;
    while (this.queue.length) {
      const m = this.queue.shift();
      this.fast = this.queue.length > 3 || document.hidden;
      try { await this.apply(m); } catch (e) { console.error('apply failed', m.type, e); }
    }
    this.busy = false;
  }

  async apply(m) {
    const s = this.s, T = this.table, fast = this.fast;
    switch (m.type) {
      case 'round': {
        Object.assign(s, { round: m.round, dealer: m.dealer, commit: m.commit, ante: m.ante, pot: m.pot, counts: m.counts, balances: m.balances,
          hand: m.hand ? m.hand.slice() : [], dealtHand: m.hand ? m.hand.slice() : [], legal: null, trick: [], points: [0, 0, 0, 0],
          folded: [false, false, false, false], challenge: null, tricks: [0, 0, 0, 0], verified: null, phase: 'challenge' });
        this.hideResult();
        this.setSeal();
        T.setPot(0);
        for (let i = 0; i < 4; i++) T.coinsTo(i, 1);
        this.updateAll();
        this.hooks.round.forEach((h) => h(m));
        if (fast) T.buildFrom({ hand: s.hand, counts: s.counts, trick: [], piles: [0, 0, 0, 0], you: this.spectator ? null : 0 });
        else { sfx.coin(2); sfx.deal(); await T.dealRound(m.dealer, s.hand, this.spectator); }
        break;
      }
      case 'turn':
        s.phase = m.phase; s.turn = m.turn; s.turnTotal = m.msLeft; s.turnEnds = performance.now() + m.msLeft - this.net.latency / 2; s.challenge = m.challenge || s.challenge;
        s.legal = m.turn === 0 && m.legal && !this.spectator ? m.legal : null;
        T.setTurn(m.turn);
        if (!this.spectator) T.setLegal(s.legal);
        if (m.turn === 0 && !this.spectator && !fast) sfx.turn();
        this.updateAll();
        break;
      case 'pass': this.bubble(m.seat, i18n.t('s_pass')); break;
      case 'challenge': case 'accept': {
        this.bubble(m.seat, i18n.t(m.type === 'challenge' ? 's_challenge' : 's_accept'));
        if (m.type === 'challenge') s.challenge = { by: m.seat, mult: 2 };
        s.pot = m.pot; s.balances = m.balances;
        this.updateAll();
        const p = T.coinsTo(m.seat, 1); if (!fast) { sfx.coin(); await p; }
        break;
      }
      case 'withdraw':
        s.folded[m.seat] = true; s.pot = m.pot; s.balances = m.balances;
        this.bubble(m.seat, i18n.t('s_withdraw'));
        T.foldSeat(m.seat);
        this.updateAll();
        break;
      case 'play': {
        if (m.seat === 0 && !this.spectator) { const i = s.hand.indexOf(m.card); if (i >= 0) s.hand.splice(i, 1); s.legal = null; }
        s.counts = m.counts; s.trick.push({ seat: m.seat, card: m.card });
        const p = T.play(m.seat, m.card, this.spectator);
        if (!fast) sfx.card();
        this.updateAll();
        if (!fast) await p;
        break;
      }
      case 'trick': {
        s.points = m.totals; s.tricks[m.winner]++;
        if (!fast) await sleep(420);
        const a = T.pileAnchor(m.winner);
        this.pop(a.x, a.y, `+${i18n.num(m.points)}`);
        s.trick = [];
        const p = T.collect(m.winner);
        if (!fast) sfx.sweep();
        this.updateAll();
        if (!fast) await p;
        break;
      }
      case 'reveal': {
        const h = await sha256(`${m.salt}|${m.deck.join(',')}`);
        const dealOk = JSON.stringify(R.deal(m.deck)) === JSON.stringify(m.dealt) && R.isValidDeck(m.deck);
        const mineOk = this.spectator || !s.dealtHand.length || JSON.stringify(m.dealt[0]) === JSON.stringify(s.dealtHand);
        s.verified = h === s.commit && h === m.commit && dealOk && mineOk;
        this.setSeal();
        for (let seat = 0; seat < 4; seat++) {
          if (!s.folded[seat] || !m.unplayed[seat].length) continue;
          if (seat === 0 && !this.spectator) continue;
          T.reveal(seat, m.unplayed[seat]);
        }
        this.hooks.reveal.forEach((f) => f(m, s.verified, h));
        break;
      }
      case 'settle': {
        s.balances = m.balances; s.points = m.points; s.phase = 'settled'; s.turn = -1;
        T.setTurn(-1); T.setLegal(null);
        this.updateAll();
        const shares = m.payouts.map((p) => ({ seat: p.seat, coins: Math.max(1, Math.round(p.amount / s.ante)) }));
        const ep = this.epoch;
        const p = T.payout(shares);
        if (!fast) { sfx.coin(3); if (!this.spectator && m.winners.includes(0)) sfx.win(); await p; }
        if (ep !== this.epoch) break;          // view changed (spectate / reconnect) while animating
        this.nextAt = performance.now() + m.nextIn - 400;
        this.showResult(m);
        break;
      }
      case 'chat': this.bubble(m.seat, i18n.t('phrases')[m.phrase] || '…'); break;
      case 'timeout': this.bubble(m.seat, i18n.t('s_timeout')); break;
      case 'presence':
        s.connected[m.seat] = m.connected; s.autoplay[m.seat] = m.autoplay;
        this.updateSeats();
        break;
      case 'reject':
        this.toast(i18n.t('rej')[m.reason] || m.reason, 'bad'); sfx.reject();
        if (T.pending) { T.pending = null; T.layoutMine(); }
        break;
      case 'snapshot': this.applySnapshot(m); break;
    }
  }

  applySnapshot(m) {
    const s = this.s, T = this.table;
    this.epoch++; this.hideResult();
    Object.assign(s, { round: m.round, dealer: m.dealer, phase: m.phase, turn: m.turn, turnTotal: Math.max(m.msLeft, 1), turnEnds: performance.now() + m.msLeft,
      commit: m.commit, ante: m.ante, pot: m.pot, challenge: m.challenge, trick: m.trick.slice(),
      counts: m.seats.map((x) => x.count), points: m.seats.map((x) => x.points), folded: m.seats.map((x) => x.folded), balances: m.seats.map((x) => x.balance),
      connected: m.seats.map((x) => x.connected), autoplay: m.seats.map((x) => x.autoplay), bots: m.seats.map((x) => x.bot), tricks: m.seats.map((x) => x.tricks),
      hand: m.hand ? m.hand.slice() : [], legal: m.legal || null });
    const active = s.folded.filter((f) => !f).length;
    const piles = s.tricks.map((t) => t * active);
    if (m.phase === 'collect' && m.turn >= 0) piles[m.turn] = Math.max(0, piles[m.turn] - m.trick.length);
    T.buildFrom({ hand: s.hand, counts: s.counts, trick: s.trick, piles, you: this.spectator ? null : 0 });
    s.folded.forEach((f, i) => { if (f) T.foldSeat(i); });
    T.setPot(Math.round(s.pot / s.ante));
    T.setTurn(s.turn);
    T.setLegal(this.spectator ? null : s.legal);
    this.setSeal();
    if (this.offline === 'reconnecting') { this.offline = false; $('#offline').classList.remove('show'); this.toast(i18n.t('resynced'), 'ok'); }
    if (this.spectator) $('#specBanner').classList.add('show');
    this.started = true;
    this.updateAll();
  }

  // ---------------- outbound ----------------
  clickCard(id) {
    const s = this.s;
    if (this.spectator || this.offline) return;
    if (!(s.phase === 'play' && s.turn === 0)) { this.toast(i18n.t('rej').not_your_turn.split(':').pop().trim()); return; }
    if (s.legal && !s.legal.includes(id)) { this.toast(i18n.t('rej').must_follow_suit.split(':').pop().trim()); return; }
    if (this.table.pending) return;
    this.table.setPending(id);
    this.net.send({ t: 'play', card: id });
  }
  act(t) { if (this.offline) return; this.net.send({ t }); $('#btns').innerHTML = ''; }

  setSpectator(on) {
    this.spectator = on; this.awaitSnap = true; this.queue = []; this.epoch++;
    this.net.spectate(on);
    $('#specBtn span').textContent = i18n.t(on ? 'sit' : 'spectate');
    $('#specBtn').classList.toggle('on', on);
    $('#dropBtn').disabled = on;
    $('#specBanner').classList.toggle('show', false);
    this.table.setLegal(null);
    this.hideResult();
    this.updateActions();
  }
  drop() {
    if (this.offline || this.spectator) return;
    this.offline = true; this.awaitSnap = true; this.queue = []; this.epoch++;
    this.net.drop();
    $('#offline').classList.add('show');
    $('#reconBtn').disabled = false; $('#reconBtn').textContent = i18n.t('reconnect');
    this.updateTop(); this.updateActions();
  }
  async reconnect() {
    $('#reconBtn').disabled = true; $('#reconBtn').textContent = i18n.t('reconnecting');
    this.offline = 'reconnecting';
    await this.net.reconnect();
    this.updateTop();
  }

  // ---------------- HUD ----------------
  buildSeats() {
    this.seatEls.forEach((el) => {
      el.innerHTML = `<div class="av"><svg viewBox="0 0 66 66"><circle class="bgc" cx="33" cy="33" r="30"/><circle class="tm" cx="33" cy="33" r="30" stroke-dasharray="${RING}" stroke-dashoffset="${RING}"/></svg><div class="face"><span></span></div></div>
        <div class="tag"><div class="nm"></div><div class="meta"><span class="coins"></span><span class="pts"></span></div><span class="st"></span></div>`;
    });
  }
  updateSeats() {
    const s = this.s;
    this.seatEls.forEach((el, i) => {
      el.classList.toggle('show', this.started);
      el.classList.toggle('turn', s.turn === i && ['challenge', 'respond', 'play'].includes(s.phase));
      el.classList.toggle('folded', s.folded[i]);
      $('.face span', el).textContent = this.name(i)[0];
      $('.nm', el).innerHTML = `${this.name(i)}${s.bots[i] && i ? ` <small>${i18n.t('bot')}</small>` : ''}`;
      $('.coins', el).innerHTML = `${COIN}${i18n.num(s.balances[i])}`;
      $('.pts', el).textContent = `${i18n.num(s.points[i])} ${i18n.t('pts')}`;
      const st = $('.st', el);
      let cls = '', txt = '';
      if (!s.connected[i] && !s.autoplay[i]) { cls = 'off'; txt = i18n.t('offline_s'); }
      else if (s.autoplay[i] || (i === 0 && this.spectator)) { cls = 'bot'; txt = i18n.t('autoplay'); }
      else if (s.folded[i]) { cls = 'fold'; txt = i18n.t('folded'); }
      st.className = 'st' + (cls ? ' show ' + cls : ''); st.textContent = txt;
    });
  }
  updateTop() {
    const s = this.s;
    $('#roundPill').textContent = s.round ? `${i18n.t('round')} ${i18n.num(s.round)}${sep()}${i18n.t('phase_' + s.phase)}` : '—';
    $('#potPill').innerHTML = `${i18n.t('pot')} ${COIN}${i18n.num(s.pot)}`;
    const np = $('#netPill');
    np.classList.toggle('off', !!this.offline);
    $('span', np).textContent = this.offline ? i18n.t('offline') : `${i18n.num(this.net.latency)} ${i18n.t('ping')}`;
  }
  setSeal() {
    const s = this.s, el = $('#sealPill');
    el.classList.toggle('ok', s.verified === true); el.classList.toggle('bad', s.verified === false);
    const label = s.verified === true ? i18n.t('verified') : s.verified === false ? i18n.t('mismatch') : i18n.t('sealed');
    $('span', el).textContent = s.commit ? `${label}${sep()}${s.commit.slice(0, 10)}…` : '—';
  }
  updateActions() {
    const s = this.s, hint = $('#hint'), btns = $('#btns');
    const mine = !this.spectator && !this.offline && s.turn === 0;
    let text = '', html = '';
    if (s.phase === 'challenge') {
      if (mine) { text = i18n.t('your_turn_challenge'); html = `<button class="primary" data-a="challenge">${i18n.t('challenge')}${sep()}${COIN}${i18n.num(s.ante)}</button><button class="alt" data-a="pass">${i18n.t('pass')}</button>`; }
      else if (s.turn >= 0) text = `${i18n.t('wait_for')} ${this.name(s.turn)}…`;
    } else if (s.phase === 'respond') {
      const by = s.challenge ? this.name(s.challenge.by) : '';
      if (mine) { text = `${i18n.t('challenged_by')} ${by}: ${i18n.t('your_turn_respond')}`; html = `<button class="primary" data-a="accept">${i18n.t('accept')}${sep()}${COIN}${i18n.num(s.ante)}</button><button class="alt" data-a="withdraw">${i18n.t('withdraw')}</button>`; }
      else text = `${i18n.t('challenged_by')} ${by}${sep()}${i18n.t('wait_for')} ${this.name(s.turn)}…`;
    } else if (s.phase === 'play' || s.phase === 'collect') {
      text = mine && s.phase === 'play' ? i18n.t('your_turn_play') : s.turn >= 0 && s.phase === 'play' ? `${i18n.t('wait_for')} ${this.name(s.turn)}…` : '';
    }
    hint.textContent = text; hint.classList.toggle('show', !!text);
    if (btns.dataset.key !== html) {
      btns.innerHTML = html; btns.dataset.key = html;
      btns.querySelectorAll('button').forEach((b) => (b.onclick = () => this.act(b.dataset.a)));
    }
  }
  updateAll() { this.updateTop(); this.updateSeats(); this.updateActions(); }

  frame() {
    const s = this.s, now = performance.now();
    for (let i = 1; i < 4; i++) {
      const a = this.table.anchor(i), el = this.seatEls[i];
      el.style.left = `${a.x}px`; el.style.top = `${a.y}px`;
    }
    this.seatEls.forEach((el, i) => {
      const c = el.querySelector('.tm');
      const on = s.turn === i && ['challenge', 'respond', 'play'].includes(s.phase);
      const frac = on ? Math.max(0, Math.min(1, (s.turnEnds - now) / s.turnTotal)) : 0;
      c.setAttribute('stroke-dashoffset', String(RING * (1 - frac)));
      c.style.opacity = on ? '1' : '0';
      c.style.stroke = on && frac < 0.25 ? '#e0685c' : '';
    });
    const top = this.table.mine.length && !this.spectator ? this.table.handTop() : Infinity;
    const H = this.table.renderer.domElement.clientHeight, narrow = innerWidth <= 860;
    const row = top < Infinity ? Math.max(12, H - top + 8) : 18;
    const want = narrow ? row + 66 : row;
    if (Math.abs((this._barB || 0) - want) > 2) {
      this._barB = want;
      document.getElementById('actionBar').style.bottom = want + 'px';
      const b0 = narrow ? row + 'px' : '';
      this.seatEls[0].style.bottom = b0; document.getElementById('chatWrap').style.bottom = b0;
    }
    const rc = document.getElementById('resCount');
    if (rc && this.nextAt) rc.textContent = `${i18n.t('next_in')} ${i18n.num(Math.max(0, Math.ceil((this.nextAt - now) / 1000)))}`;
  }

  bubble(seat, text) {
    const el = this.seatEls[seat];
    el.querySelectorAll('.bubble').forEach((b) => b.remove());
    const b = document.createElement('div'); b.className = 'bubble'; b.textContent = text;
    el.appendChild(b); setTimeout(() => b.remove(), 2300);
  }
  toast(text, kind = '') {
    const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = text;
    const box = $('#toasts'); box.appendChild(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.remove(), 2800);
  }
  pop(x, y, text) {
    const p = document.createElement('div'); p.className = 'ptpop'; p.textContent = text; p.style.left = x + 'px'; p.style.top = y + 'px';
    $('#pops').appendChild(p); setTimeout(() => p.remove(), 1500);
  }

  showResult(m) {
    const s = this.s;
    this.lastSettle = m;
    const win = m.winners.map((w) => this.name(w)).join(i18n.lang === 'ar' ? ' و' : ' & ');
    const allOut = s.folded.filter((f) => !f).length === 1;
    const rows = [0, 1, 2, 3].map((i) => {
      const pay = m.payouts.find((p) => p.seat === i);
      return `<tr><td><b>${this.name(i)}</b>${s.folded[i] ? ` <span class="muted">${sep()}${i18n.t('folded')}</span>` : ''}</td><td>${s.folded[i] ? '–' : i18n.num(m.points[i])}</td>
        <td class="${pay ? 'plus' : ''}">${pay ? '+' + i18n.num(pay.amount) : '–'}</td><td>${COIN}${i18n.num(m.balances[i])}</td></tr>`;
    }).join('');
    $('#resultCard').innerHTML = `
      <div class="res-head"><h2>${i18n.t('result')}${sep()}${i18n.num(s.round)}</h2><span class="pill gold">${i18n.t('pot')} ${COIN}${i18n.num(m.pot)}</span></div>
      <div class="res-win">${i18n.t(m.winners.length > 1 ? 'winners' : 'winner')}: ${win}${allOut ? `${sep()}<span class="muted">${i18n.t('all_withdrew')}</span>` : ''}</div>
      <table class="res-tab"><tr><th></th><th>${i18n.t('points')}</th><th>${i18n.t('payout')}</th><th>${i18n.t('coins')}</th></tr>${rows}</table>
      <div class="res-ver">${s.verified ? '✓ ' + i18n.t('verified') : '… ' + i18n.t('sealed')} — ${i18n.t('verify_line')}</div>
      <div class="res-foot"><span class="muted" id="resCount"></span><button class="primary" id="nextBtn">${i18n.t('next_round')}</button></div>`;
    $('#nextBtn').onclick = () => { if (!this.spectator) this.net.send({ t: 'ready' }); this.hideResult(); };
    if (!this.spectator) $('#result').classList.add('show');
  }
  hideResult() { $('#result').classList.remove('show'); }

  buildChat() {
    const menu = $('#chatMenu');
    const render = () => { menu.innerHTML = i18n.t('phrases').map((p, i) => `<button data-p="${i}">${p}</button>`).join(''); menu.querySelectorAll('button').forEach((b) => (b.onclick = () => { this.net.send({ t: 'chat', phrase: +b.dataset.p }); menu.classList.remove('show'); })); };
    render(); this.renderChat = render;
    $('#chatBtn').onclick = () => menu.classList.toggle('show');
  }
  relabel() {
    this.renderChat();
    this.updateAll(); this.setSeal();
    $('#specBtn span').textContent = i18n.t(this.spectator ? 'sit' : 'spectate');
    if ($('#result').classList.contains('show') && this.lastSettle) this.showResult(this.lastSettle);
  }
}
