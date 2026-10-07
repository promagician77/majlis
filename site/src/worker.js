// The "server" for the demo: the same MatchServer the tests run, in its own
// thread. The page can only talk to it through messages, like a real socket.
import { MatchServer } from './engine/server.js';
import { Ledger } from './engine/ledger.js';

let srv = null, ledger = null, timer = null;

const out = (to, msg) => postMessage({ k: 'msg', to, data: JSON.stringify(msg) });

function ledgerView() {
  const bal = {};
  for (const [a, v] of ledger.balances) bal[a] = v;
  return { journal: ledger.journal.slice(-80), count: ledger.journal.length, balances: bal, inv: ledger.invariants(), pot: srv.round ? srv.pot() : 0, escrow: srv.round ? srv.escrow() : null };
}

onmessage = (e) => {
  const m = e.data;
  switch (m.k) {
    case 'start': {
      ledger = new Ledger();
      srv = new MatchServer({ matchId: 'riyadh-' + Math.random().toString(36).slice(2, 7), ante: m.ante, ledger, send: out, players: m.players,
        timings: m.timings || {}, startTime: performance.now() });
      srv.start(performance.now());
      clearInterval(timer);
      timer = setInterval(() => srv.tick(performance.now()), 50);
      postMessage({ k: 'started', matchId: srv.matchId });
      break;
    }
    case 'intent': if (srv && srv.seats[m.seat].connected) { srv.now = performance.now(); srv.handle(m.seat, m.body); } break;   // a dropped socket delivers nothing
    case 'drop': if (srv) { srv.now = performance.now(); srv.disconnect(0); } break;
    case 'reconnect': if (srv) { srv.now = performance.now(); srv.reconnect(0); } break;
    case 'spectate':
      if (srv) {
        srv.now = performance.now();
        srv.seats[0].bot = true;                                  // you leave the seat; a bot keeps it warm
        srv.specQueue.push({ at: srv.now + srv.t.spectatorDelay, type: 'snapshot', pub: srv.snapshot('spectator') });
      }
      break;
    case 'sit': if (srv) { srv.now = performance.now(); srv.seats[0].bot = false; srv.reply(0, srv.snapshot(0)); } break;
    case 'debug': if (srv) postMessage({ k: 'debug', state: srv.debugState(), id: m.id }); break;
    case 'ledger': if (srv) postMessage({ k: 'ledger', view: ledgerView(), id: m.id }); break;
    case 'replaySettle': {
      if (!srv) break;
      const last = [...ledger.journal].reverse().find((t) => t.txId.startsWith('settle:'));
      const r = last ? ledger.post(last.txId, last.entries, 'replayed settlement') : { ok: false, error: 'no_settlement_yet' };
      postMessage({ k: 'replaySettle', result: { txId: last?.txId, ok: r.ok, error: r.error }, id: m.id });
      break;
    }
  }
};
