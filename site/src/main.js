import { i18n } from './i18n.js';
import { Net } from './net.js';
import { Game } from './game.js';
import { CARD_RE } from './engine/rules.js';
import { unlock, setMuted, isMuted } from './sfx.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const chip = (c, dim) => `<span class="chip${c[1] === 'H' || c[1] === 'D' ? ' r' : ''}${dim ? ' dim' : ''}">${c[0] === 'T' ? '10' : c[0]}${{ S: '♠', H: '♥', D: '♦', C: '♣' }[c[1]]}</span>`;

let lang = 'en';
try { lang = localStorage.getItem('majlis-lang') || (navigator.language.startsWith('ar') ? 'ar' : 'en'); } catch {}
i18n.set(lang);
$$('.lang button').forEach((b) => b.classList.toggle('on', b.dataset.lang === lang));

const net = new Net();
let table = null, game = null;

// ---------------- tabs ----------------
let current = 'play';
function showTab(name) {
  current = name;
  $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  $$('.tab').forEach((t) => t.classList.toggle('on', t.id === 'tab-' + name));
  if (table) { table.active = name === 'play'; if (name === 'play') table.resize(); }
  if (name === 'truth') renderFeeds();
  if (name === 'ledger') pollLedger();
  try { history.replaceState(null, '', '#' + name); } catch {}
}
$$('.tabs button').forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
const fromHash = location.hash.slice(1);

$$('.lang button').forEach((b) => (b.onclick = () => {
  i18n.set(b.dataset.lang);
  $$('.lang button').forEach((x) => x.classList.toggle('on', x === b));
  game && game.relabel();
  renderLobbySlots();
}));

// ---------------- 3D + game ----------------
async function boot() {
  try {
    const { Table3D } = await import('./table3d.js');
    table = new Table3D($('#gl'));
    game = new Game(net, table);
    window.__game = game;
    hookInspector();
    await table.load((p) => { $('#loadBar i').style.width = `${Math.round(p * 100)}%`; });
    $('#loadBar').classList.add('done');
    $('#findBtn').disabled = false;
    table.active = current === 'play';
    document.body.dataset.ready = '1';
  } catch (err) {
    console.error(err);
    $('#loadBar span').textContent = 'WebGL could not start on this device. The other tabs still work.';
    $('#loadBar').classList.add('err');
  }
}

// ---------------- lobby / matchmaking ----------------
let ante = 10, joined = 0;
$$('#stakeSeg button').forEach((b) => (b.onclick = () => { ante = +b.dataset.ante; $$('#stakeSeg button').forEach((x) => x.classList.toggle('on', x === b)); }));
function renderLobbySlots() {
  $('#mm').innerHTML = [0, 1, 2, 3].map((i) => i < joined
    ? `<div class="in"><b>${i18n.t('names')[i][0]}</b>${i18n.t('names')[i]}${i ? `<small class="muted">${i18n.t('bot')}</small>` : ''}</div>` : '<div>…</div>').join('');
}
renderLobbySlots();
$('#muteBtn').classList.toggle('muted', isMuted());
$('#muteBtn').onclick = () => { unlock(); setMuted(!isMuted()); $('#muteBtn').classList.toggle('muted', isMuted()); };
document.addEventListener('pointerdown', unlock, { once: true });
$('#findBtn').onclick = async () => {
  unlock();
  $('#findBtn').disabled = true; $('#findBtn').textContent = i18n.t('matching');
  for (joined = 1; joined <= 4; joined++) { renderLobbySlots(); await new Promise((r) => setTimeout(r, joined === 1 ? 250 : 420)); }
  joined = 4;
  const names = i18n.t('names');
  net.start({ ante, players: [0, 1, 2, 3].map((i) => ({ id: ['you', 'fahad', 'noura', 'salman'][i], name: names[i], bot: i > 0 })) });
  game.started = true;
  $('#lobby').classList.remove('show');
};
$('#dropBtn').onclick = () => game && game.drop();
$('#reconBtn').onclick = () => game && game.reconnect();
$('#specBtn').onclick = () => game && game.started && game.setSpectator(!game.spectator);

// ---------------- Server truth tab ----------------
const feeds = { 0: [], 2: [], spectator: [] };
const feedEl = { 0: '#feed0', 2: '#feed2', spectator: '#feedS' };
const stats = { pk: 0, bytes: 0, rej: 0, leak: 0 };
let known = new Set();
function fmt(to, data, up) {
  let m; try { m = JSON.parse(data); } catch { m = {}; }
  let body = esc(data.length > 260 ? data.slice(0, 260) + '…' : data);
  body = body.replace(/("hand":\[[^\]]*\]|"legal":\[[^\]]*\])/g, '<span class="pv">$1</span>');
  const cls = up ? 'up' : m.type === 'reject' ? 'rej' : '';
  return `<li class="${cls}"><span class="ty">${up ? '↑ ' + esc(String(m.t ?? '?')) : '#' + m.n + ' ' + m.type}</span><span class="by">${data.length} B</span><br>${body}</li>`;
}
function pushFeed(key, html) {
  feeds[key].push(html);
  if (feeds[key].length > 140) feeds[key].shift();
  if (current === 'truth') {
    const ol = $(feedEl[key]);
    ol.insertAdjacentHTML('afterbegin', html);
    while (ol.children.length > 140) ol.lastChild.remove();
  }
}
function renderFeeds() {
  for (const k of Object.keys(feeds)) $(feedEl[k]).innerHTML = feeds[k].slice().reverse().join('');
  renderStats();
}
function renderStats() {
  $('#stLeak').textContent = stats.leak;
  $('#stLeak').parentElement.classList.toggle('good', stats.leak === 0);
  $('#stPk').textContent = stats.pk;
  $('#stAvg').textContent = stats.pk ? `${Math.round(stats.bytes / stats.pk)} B` : '0 B';
  $('#stRej').textContent = stats.rej;
}
const responses = [];
function hookInspector() {
  net.tap((to, data) => {
    if (to === 'up') { pushFeed(0, fmt(0, data, true)); return; }
    if (!(to in feeds)) return;
    pushFeed(to, fmt(to, data));
    if (to !== 0) return;
    const m = JSON.parse(data);
    stats.pk++; stats.bytes += data.length;
    if (m.type === 'reject') stats.rej++;
    responses.push({ at: performance.now(), m });
    // leak scan: anything that looks like a card id must already be known to this seat
    if (m.type === 'round') known = new Set(m.hand || []);
    if (m.type === 'snapshot') { for (const c of m.hand || []) known.add(c); for (const p of m.trick) known.add(p.card); }
    if (m.type === 'play') known.add(m.card);
    if (m.type !== 'reveal') for (const c of data.match(CARD_RE) || []) if (!known.has(c)) stats.leak++;
    if (current === 'truth') renderStats();
  });
  game.hooks.round.push((m) => {
    $('#cmRound').textContent = m.round; $('#cmHash').textContent = m.commit;
    $('#cmSalt').textContent = 'revealed when the round ends'; $('#cmDeck').innerHTML = ''; $('#cmVerdict').textContent = '';
  });
  game.hooks.reveal.push((m, ok, h) => {
    $('#cmSalt').textContent = m.salt;
    $('#cmDeck').innerHTML = m.deck.map((c) => chip(c)).join('');
    $('#cmVerdict').innerHTML = ok
      ? `<span class="v-ok">✓ WebCrypto SHA-256 = ${h.slice(0, 16)}… matches the commit · deal(deck) matches every hand dealt</span>`
      : `<span class="v-bad">✕ Commit mismatch</span>`;
  });
  setInterval(async () => {
    if (current !== 'truth' || !game?.started) return;
    const { state: st } = await net.ask('debug');
    const names = i18n.t('names');
    $('#srvMem').innerHTML = `<div class="muted">debug view for this demo only · production has no such endpoint</div>
      <div>phase <b>${st.phase}</b> · round ${st.round} · turn seat ${st.turn + 1}</div>
      <div>salt <code>${st.salt || '–'}</code></div>
      ${st.hands.map((h, i) => `<div>${names[i]}</div><div class="hand">${h.map((c) => chip(c)).join('') || '<span class="muted">–</span>'}</div>`).join('')}
      <div>deck order</div><div class="hand">${(st.deck || []).map((c) => chip(c, true)).join('')}</div>
      <div>${st.escrow || ''} = ● ${st.pot}</div>`;
  }, 700);
}

// cheat panel
const CHEATS = [
  ['notmine', 'Play a card I do not hold'],
  ['outturn', 'Play while it is not my turn'],
  ['suit', 'Ignore follow-suit'],
  ['peek', 'Ask for the other hands'],
  ['replay', 'Replay my last message'],
  ['settle', 'Settle the round myself'],
  ['cash', 'Cash out 100 coins'],
  ['spam', 'Spam chat ×5'],
  ['junk', 'Send a malformed packet'],
];
$('#cheats').innerHTML = CHEATS.map(([k, label]) => `<button data-k="${k}">${label}</button>`).join('');
$$('#cheats button').forEach((b) => (b.onclick = () => cheat(b.dataset.k, b.textContent)));
async function cheat(k, label) {
  if (!game?.started) return logCheat(label, '–', '<span class="muted">start a match on the Play tab first</span>', '');
  const s = game.s;
  let sent;
  const t0 = performance.now(), before = responses.length;
  if (k === 'notmine') {
    const seen = new Set([...s.hand, ...s.trick.map((p) => p.card)]);
    const guess = ['AS', 'AH', 'AD', 'AC', 'TS', 'TH', 'TD', 'TC', 'KS', 'KH'].find((c) => !seen.has(c)) || 'AS';
    sent = net.send({ t: 'play', card: guess });
  } else if (k === 'outturn') {
    if (s.turn === 0) return logCheat(label, '–', '<span class="muted">it is your turn right now; try again in a moment</span>', '');
    sent = net.send({ t: 'play', card: s.hand[0] || '7S' });
  } else if (k === 'suit') {
    const bad = s.legal && s.hand.find((c) => !s.legal.includes(c));
    if (!(s.turn === 0 && s.phase === 'play' && bad)) return logCheat(label, '–', '<span class="muted">available on your turn when you hold the led suit</span>', '');
    sent = net.send({ t: 'play', card: bad });
  } else if (k === 'peek') sent = net.send({ t: 'peek', seat: 2 });
  else if (k === 'replay') { if (!net.lastSent) return logCheat(label, '–', '<span class="muted">make a move first</span>', ''); sent = net.lastSent.intent; net.raw(sent); }
  else if (k === 'settle') sent = net.send({ t: 'settle', winner: 0 });
  else if (k === 'cash') sent = net.send({ t: 'cashout', amount: 100 });
  else if (k === 'spam') { for (let i = 0; i < 5; i++) sent = net.send({ t: 'chat', phrase: 2 }); }
  else if (k === 'junk') { sent = { t: 42, card: { $gt: '' } }; net.raw(sent); }
  if (!sent) return logCheat(label, '–', '<span class="muted">offline</span>', '');
  await new Promise((r) => setTimeout(r, Math.max(500, net.latency * 2 + 200)));
  const got = responses.slice(before).filter((x) => x.m.type === 'reject' || (k === 'spam' && x.m.type === 'chat' && x.m.seat === 0) || (x.m.type === 'play' && x.m.seat === 0 && sent && x.m.card === sent.card));
  const verdict = got.length ? got.map((x) => x.m.type === 'reject' ? `<span class="v-bad">refused: ${x.m.reason}</span>` : `<span class="v-ok">accepted (${x.m.type})</span>`).join('<br>') : '<span class="muted">no reply</span>';
  const rtt = got.length ? `${Math.round(got[0].at - t0)} ms` : '';
  logCheat(label, `<code>${esc(JSON.stringify(sent))}</code>`, verdict, rtt);
}
function logCheat(a, sent, verdict, rtt) {
  $('#cheatLog').insertAdjacentHTML('afterbegin', `<tr><td>${a}</td><td>${sent}</td><td>${verdict}</td><td>${rtt}</td></tr>`);
}
$('#lat').oninput = (e) => { net.latency = +e.target.value; $('#latV').textContent = net.latency + ' ms'; game && game.updateTop(); };
$('#jit').oninput = (e) => { net.jitter = +e.target.value; $('#jitV').textContent = net.jitter + ' ms'; };

// ---------------- Ledger tab ----------------
const acctName = (a) => { const n = i18n.t('names'); const m = { 'user:you': n[0], 'user:fahad': n[1], 'user:noura': n[2], 'user:salman': n[3] }; return m[a] ? `${m[a]} <span class="muted">${a}</span>` : a; };
async function pollLedger() {
  if (current !== 'ledger') return;
  if (game?.started) {
    const { view: v } = await net.ask('ledger');
    const inv = v.inv;
    const openOther = inv.openEscrow.filter(([a]) => a !== v.escrow);
    $('#inv').innerHTML = [
      [inv.sumZero, `Σ all accounts = 0`], [inv.unbalancedTx === 0, `${v.count} transactions, every one sums to 0`], [inv.negative === 0, 'no negative wallet'],
      [openOther.length === 0, `settled escrows closed${v.pot ? ` · current round holds ● ${v.pot}` : ''}`], [true, 'external payout accounts: none'],
    ].map(([ok, t]) => `<span class="${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✕'} ${t}</span>`).join('');
    const users = Object.entries(v.balances).filter(([a]) => a.startsWith('user:'));
    $('#flWallets').textContent = `4 players · ● ${users.reduce((s, [, b]) => s + b, 0)}`;
    $('#flEscrow').textContent = v.pot ? `● ${v.pot} held this round` : 'empty between rounds';
    $('#balTable').innerHTML = `<tr><th>Account</th><th>Balance</th></tr>` + Object.entries(v.balances).filter(([a, b]) => b !== 0 || a.startsWith('user:')).map(([a, b]) => `<tr><td>${acctName(a)}</td><td><b>${b}</b></td></tr>`).join('');
    $('#jCount').textContent = `· ${v.count} total, latest first`;
    $('#jTable').innerHTML = `<tr><th>#</th><th>Transaction</th><th>Legs</th></tr>` + v.journal.slice().reverse().map((t) =>
      `<tr><td>${t.at}</td><td><code>${t.txId}</code><div class="muted">${t.memo}</div></td><td><div class="legs">${t.entries.map((e) => `<span class="${e.delta < 0 ? 'neg' : 'pos'}">${e.delta > 0 ? '+' : ''}${e.delta} ${e.acct}</span>`).join('')}</div></td></tr>`).join('');
  } else {
    $('#inv').innerHTML = '<span>start a match on the Play tab to fill the ledger</span>';
  }
  clearTimeout(pollLedger.t); pollLedger.t = setTimeout(pollLedger, 1000);
}
$('#replayBtn').onclick = async () => {
  if (!game?.started) return;
  const { result: r } = await net.ask('replaySettle');
  $('#ledgerMsg').innerHTML = r.ok ? '<span class="v-bad">accepted twice?!</span>'
    : r.error === 'no_settlement_yet' ? '<span class="muted">No round has settled yet. Finish a round, then try again.</span>'
    : `<span class="v-ok">refused: ${r.error}</span> <code>${r.txId || ''}</code> · settlement is idempotent`;
};
$('#cashBtn').onclick = async () => {
  if (!game?.started) return;
  const before = responses.length;
  net.send({ t: 'cashout', amount: 100 });
  await new Promise((r) => setTimeout(r, net.latency * 2 + 300));
  const rj = responses.slice(before).find((x) => x.m.type === 'reject');
  $('#ledgerMsg').innerHTML = rj ? `<span class="v-ok">refused: ${rj.m.reason}</span> · there is no account a coin could leave to` : '<span class="muted">no reply (offline?)</span>';
};

// ---------------- Stress tab ----------------
let nMatches = 400;
$$('#nSeg button').forEach((b) => (b.onclick = () => { nMatches = +b.dataset.n; $$('#nSeg button').forEach((x) => x.classList.toggle('on', x === b)); }));
let sw = null;
function runStress(leaky) {
  if (sw) sw.terminate();
  sw = new Worker(new URL('./stress-worker.js', import.meta.url), { type: 'module' });
  const n = leaky ? 20 : nMatches;
  $('#runBtn').disabled = $('#leakBtn').disabled = true;
  $('#checks').innerHTML = `<p class="muted">${leaky ? 'Running 20 matches against a server that sneaks hands into turn events…' : `Running ${n} matches × 3 rounds…`}</p>`;
  $('#prog i').style.width = '0%';
  sw.onmessage = (e) => {
    const d = e.data;
    if (d.k === 'progress') $('#prog i').style.width = `${(d.done / d.total) * 100}%`;
    if (d.k === 'error') { $('#checks').innerHTML = `<p class="v-bad">${d.message}</p>`; $('#runBtn').disabled = $('#leakBtn').disabled = false; }
    if (d.k === 'done') { $('#prog i').style.width = '100%'; renderStress(d.M, d.leaky); $('#runBtn').disabled = $('#leakBtn').disabled = false; }
  };
  sw.postMessage({ matches: n, fuzz: !leaky && $('#hostile').checked, leaky });
}
function renderStress(M, leaky) {
  const rows = [
    ['Rounds played', M.rounds, null], ['Cards played and re-checked', M.plays, null], ['Challenges / withdrawals', `${M.challenges} / ${M.withdrawals}`, null],
    ['Opponent cards seen by a player', M.leaks, 0], ['Hidden cards seen by spectators', M.spectatorLeaks, 0], ['Illegal plays accepted', M.illegalAccepted, 0],
    ['Wrong trick winners', M.wrongWinner, 0], ['Point mismatches', M.pointMismatch, 0], ['Payout mismatches', M.payoutMismatch, 0],
    ['Commit-reveal verified (WebCrypto)', `${M.commitChecked - M.commitFailed} / ${M.commitChecked}`, M.commitFailed === 0 ? 'ok' : 'bad'],
    ['Ledger invariant failures', M.ledgerFailures, 0], ['Reconnects / client desyncs', `${M.resyncs} / ${M.desync}`, M.desync === 0 ? 'ok' : 'bad'],
    ['Seats taken over by bot after drop', M.autoplayTakeovers, null], ['Server exceptions', M.exceptions, 0],
  ];
  $('#checks').innerHTML = (leaky ? '<p class="v-bad">Control run: the referee must flag this server.</p>' : '') + rows.map(([label, v, want]) => {
    const st = want === null ? '' : want === 'ok' || want === 'bad' ? want : v === want ? 'ok' : 'bad';
    return `<div class="ck ${st}"><span>${label}</span><b>${typeof v === 'number' ? v.toLocaleString() : v}${st === 'ok' ? ' ✓' : st === 'bad' ? ' ✕' : ''}</b></div>`;
  }).join('');
  const rej = Object.entries(M.rejected).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rej.map((r) => r[1]));
  $('#rejBars').innerHTML = rej.length ? rej.map(([k, v]) => `<div class="bar"><span>${k}</span><i style="width:${(v / max) * 100}%"></i><b>${v.toLocaleString()}</b></div>`).join('') : '<p class="muted">No forged traffic in this run.</p>';
  $('#thru').innerHTML = `<div><b>${(M.rounds / (M.durationMs / 1000)).toFixed(0)}</b><span>rounds / second, one thread</span></div>
    <div><b>${M.messages.toLocaleString()}</b><span>messages</span></div><div><b>${Math.round(M.bytes / M.messages)} B</b><span>avg message</span></div>`;
}
$('#runBtn').onclick = () => runStress(false);
$('#leakBtn').onclick = () => runStress(true);

if (fromHash && $('#tab-' + fromHash)) showTab(fromHash);
boot();
