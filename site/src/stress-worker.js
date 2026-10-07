import { runMatches } from './engine/sim.js';

onmessage = async (e) => {
  const { matches, fuzz, leaky } = e.data;
  const patch = leaky ? (srv) => {
    // deliberately broken server: sneaks every hand into each turn event
    const o = srv.emit.bind(srv);
    srv.emit = (type, pub, priv) => o(type, type === 'turn' ? { ...pub, debug: srv.seats.map((s) => s.hand) } : pub, priv);
  } : undefined;
  try {
    const M = await runMatches({ matches, rounds: 3, seed: (Math.random() * 1e6) | 0, fuzz, patch,
      onProgress: (done, m) => postMessage({ k: 'progress', done, total: matches, rounds: m.rounds }) });
    postMessage({ k: 'done', M, leaky });
  } catch (err) { postMessage({ k: 'error', message: String(err) }); }
};
