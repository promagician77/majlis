// Double-entry coin ledger. Every transaction must sum to zero, every txId is
// idempotent, and no player or escrow account can go negative. There is no
// account type that pays out to the outside world: coins come in from `mint`
// (purchases / daily grants) and leave only to `sink:*` (cosmetics). That is
// what keeps virtual balances a game feature instead of a gambling product.

export const ACCOUNT_KINDS = ['mint', 'user', 'escrow', 'sink'];

export class Ledger {
  constructor() {
    this.balances = new Map();
    this.journal = [];
    this.txIds = new Set();
  }

  balance(acct) { return this.balances.get(acct) || 0; }

  post(txId, entries, memo = '') {
    if (this.txIds.has(txId)) return { ok: false, dup: true, error: 'duplicate_tx' };
    if (!Array.isArray(entries) || entries.length < 2) return { ok: false, error: 'need_two_legs' };
    let sum = 0;
    for (const e of entries) {
      if (!Number.isInteger(e.delta)) return { ok: false, error: 'non_integer_amount' };
      const kind = String(e.acct).split(':')[0];
      if (!ACCOUNT_KINDS.includes(kind)) return { ok: false, error: 'closed_loop_no_external_account', acct: e.acct };
      sum += e.delta;
    }
    if (sum !== 0) return { ok: false, error: 'unbalanced', sum };
    // check overdraft on the combined effect (an account may appear twice)
    const after = new Map();
    for (const e of entries) after.set(e.acct, (after.get(e.acct) ?? this.balance(e.acct)) + e.delta);
    for (const [acct, bal] of after) if (bal < 0 && !acct.startsWith('mint')) return { ok: false, error: 'insufficient_funds', acct };
    for (const [acct, bal] of after) this.balances.set(acct, bal);
    this.txIds.add(txId);
    const tx = { txId, at: this.journal.length + 1, memo, entries: entries.map((e) => ({ ...e })) };
    this.journal.push(tx);
    return { ok: true, tx };
  }

  transfer(txId, from, to, amount, memo) {
    return this.post(txId, [{ acct: from, delta: -amount }, { acct: to, delta: amount }], memo);
  }

  total() { let s = 0; for (const v of this.balances.values()) s += v; return s; }

  invariants() {
    const escrowOpen = [...this.balances].filter(([a, v]) => a.startsWith('escrow:') && v !== 0);
    const negative = [...this.balances].filter(([a, v]) => !a.startsWith('mint') && v < 0);
    const unbalanced = this.journal.filter((t) => t.entries.reduce((s, e) => s + e.delta, 0) !== 0);
    return { sumZero: this.total() === 0, negative: negative.length, unbalancedTx: unbalanced.length, openEscrow: escrowOpen };
  }
}
