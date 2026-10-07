# Majlis 32 — server-authoritative card table (demo)

A playable 3D four-player card table built to show the hard parts of a real-money-free,
real-time card game for the Saudi market: the server decides everything, phones only see
their own cards, shuffles are provable, coins never leave the game, and a dropped player
gets their seat back.

Open `site/index.html` through any static server (or deploy the folder to Vercel) and press **Find a table**.

## Run

```bash
npm run serve        # http://localhost:8080  (node scripts/serve.mjs 8080 [delayMs])
npm test             # 13 tests: rules, SHA-256, ledger, server, 1,200-round referee, hostile client, negative controls
```

Deploy: import the repo in Vercel. `vercel.json` serves `site/` as-is (no build step).
Add `?lite` to the URL to force low graphics on very old phones (the page also lowers quality by itself when frames are slow).

## Tabs

| Tab | What it proves |
|---|---|
| Play | three.js majlis table, deal / play / trick / reveal / settle animations, challenge and withdraw round, Arabic ⇄ English (RTL), quick chat, drop + reconnect, spectator mode |
| Server truth | Live packet feeds for your phone, an opponent's phone and a spectator; a leak counter; nine cheat attempts sent through the real socket; commit-reveal verification with WebCrypto |
| Coin ledger | Double-entry journal, invariants (Σ = 0, no negative wallet, escrow closes), idempotent settlement, and the cash-out path that does not exist |
| Stress test | Runs 100–1,000 matches in a worker against the real server code with an independent referee, plus a deliberately leaky server as a control |
| Build plan | Production architecture (Nakama, in-Kingdom region), milestones, what is real vs stand-in, credits |

## Layout

```
site/
  index.html, style.css, fonts.css, cards.html
  src/engine/rules.js     stand-in card rules (replace with the client's rulebook)
  src/engine/server.js    authoritative match loop: turns, legality, bots, reconnect grace, spectator delay, settlement
  src/engine/ledger.js    double-entry coin ledger, closed loop (mint → wallets ⇄ escrow → sink)
  src/engine/sha256.js    synchronous SHA-256 for the commit; clients verify with WebCrypto
  src/engine/sim.js       headless referee used by the tests and the Stress tab
  src/worker.js           runs the server in its own thread (stands in for Nakama)
  src/net.js              socket-like transport: ordered delivery, latency/jitter, drop/reconnect, packet taps
  src/table3d.js          three.js scene, card objects, layouts, tweening, picking, coins, adaptive quality
  src/props.js, textures.js, cards.js   procedural majlis set, Sadu/Najdi textures, card faces
  src/game.js             client controller + HUD (renders server events, never decides outcomes)
  src/i18n.js, sfx.js, main.js
tests/run.mjs
```

In production `server.js` becomes a Nakama TypeScript match handler (same intent/event shapes),
`ledger.js` maps to wallet tables in PostgreSQL, and `net.js` becomes the Nakama socket.

## Credits

- three.js r170 — MIT
- HDRI “Royal Esplanade” — Poly Haven, CC0
- “Specular Silk Pouf” model — Wayfair LLC / Eric Chadwick, CC BY 4.0, via Khronos glTF Sample Assets (textures resized, mesh simplified)
- Tajawal and Reem Kufi fonts — SIL Open Font License
- Everything else (cards, felt, Al Sadu weave, Najdi frieze, mashrabiya, dallah, finjan, mabkhara, lanterns, sounds) is generated in code.
