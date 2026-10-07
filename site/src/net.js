// Client transport. Wraps the server worker like a WebSocket: ordered delivery,
// simulated latency + jitter, a drop/reconnect switch and a packet recorder.
export class Net {
  constructor() {
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this.latency = 70;        // round trip, ms
    this.jitter = 25;
    this.online = true;
    this.feed = 'seat';       // 'seat' | 'spectator'
    this.cseq = 0;
    this.handlers = new Set();
    this.taps = new Set();    // packet recorders (inspector)
    this.replies = new Map();
    this.lastDeliver = { 0: 0, 1: 0, 2: 0, 3: 0, spectator: 0 };
    this.rtt = this.latency;
    this.worker.onmessage = (e) => this.fromServer(e.data);
  }

  oneWay() { return Math.max(0, this.latency / 2 + (Math.random() - 0.5) * this.jitter); }

  fromServer(m) {
    if (m.k !== 'msg') { const cb = this.replies.get(m.id); if (cb) { this.replies.delete(m.id); cb(m); } return; }
    // keep per-recipient order, like a TCP socket would
    const at = Math.max(performance.now() + this.oneWay(), this.lastDeliver[m.to] + 1);
    this.lastDeliver[m.to] = at;
    setTimeout(() => {
      for (const t of this.taps) t(m.to, m.data);
      const mine = (this.feed === 'seat' && m.to === 0) || (this.feed === 'spectator' && m.to === 'spectator');
      if (!mine) return;
      if (m.to === 0 && !this.online) return;
      const msg = JSON.parse(m.data);
      msg._bytes = m.data.length;
      for (const h of this.handlers) h(msg);
    }, at - performance.now());
  }

  on(h) { this.handlers.add(h); return () => this.handlers.delete(h); }
  tap(t) { this.taps.add(t); return () => this.taps.delete(t); }

  start(opts) { this.worker.postMessage({ k: 'start', ...opts }); }

  send(body) {
    if (!this.online) return false;
    const intent = { ...body, cseq: body.cseq ?? ++this.cseq };
    const sentAt = performance.now();
    this.up(intent);
    for (const t of this.taps) t('up', JSON.stringify(intent));
    this.lastSent = { intent, sentAt };
    return intent;
  }
  up(body) {
    // client -> server keeps order too (one socket), even with jitter
    const at = Math.max(performance.now() + this.oneWay(), (this.lastUp || 0) + 1);
    this.lastUp = at;
    setTimeout(() => this.worker.postMessage({ k: 'intent', seat: 0, body }), at - performance.now());
  }
  raw(body) {   // used by the cheat panel: sends exactly what it is given
    this.up(body);
    for (const t of this.taps) t('up', JSON.stringify(body));
  }

  drop() { this.online = false; this.worker.postMessage({ k: 'drop' }); }
  reconnect() {
    return new Promise((res) => setTimeout(() => { this.online = true; this.worker.postMessage({ k: 'reconnect' }); res(); }, 450 + this.latency));
  }
  spectate(on) {
    this.feed = on ? 'spectator' : 'seat';
    this.worker.postMessage({ k: on ? 'spectate' : 'sit' });
  }

  ask(k, extra = {}) {
    const id = Math.random().toString(36).slice(2);
    return new Promise((res) => { this.replies.set(id, res); this.worker.postMessage({ k, id, ...extra }); });
  }
}
