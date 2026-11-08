import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import * as baseline from './strategy.js';
import { newMatchPolicy, prepare, PACER_PARAMS } from './policy.js';
const rack = (s: string) => { const r = new Map<string, number>(); for (const c of s) r.set(c, (r.get(c) ?? 0) + 1); return r; };
const dictionary = fs.readFileSync(new URL('../../spacetimedb/wordlist.txt', import.meta.url), 'utf8').split('\n').map(s => s.trim().toUpperCase()).filter(s => s.length >= 2).sort((a, b) => b.length - a.length);
prepare(dictionary);
test('baseline fallback is the unchanged original strategy', () => {
  const p = newMatchPolicy('baseline');
  for (const [l, r, b, n] of [['E', 'TRAN', 100, 40], ['Q', 'AEI', 50, 30], ['S', 'RETAIN', 80, 2]] as const) {
    const ctx = { letter: l, myBalance: b, myRack: rack(r), dictionary, bagRemaining: n, auctionType: 'Vickrey' as const };
    assert.equal(p.decideBid(ctx), baseline.decideBid(ctx));
  }
});
test('pacer bids are integer, within balance, zero on final tile', () => {
  const p = newMatchPolicy('pacer');
  for (let i = 0; i < 40; i++) p.observe(String(i), 'AEIOUSTRLNXZQ'[i % 13]!, i % 5 !== 0, 8 + (i % 7));
  for (const bal of [0, 1, 7, 30, 100, 250]) for (const n of [0, 1, 3, 10, 40, 67]) for (const l of 'AEQSXZ') for (const at of ['Vickrey', 'FirstPrice'] as const) {
    const b = p.decideBid({ letter: l, myBalance: bal, myRack: rack('TRAINE'), dictionary, bagRemaining: n, auctionType: at });
    assert.ok(Number.isInteger(b) && b >= 0 && b <= bal, `bid ${b} bal ${bal}`);
    if (n === 0) assert.equal(b, 0);
  }
});
test('pacer bids a common useful letter near market, above the old baseline', () => {
  const p = newMatchPolicy('pacer');
  const ctx = { letter: 'E', myBalance: 100, myRack: rack('TRNSLA'), dictionary, bagRemaining: 50, auctionType: 'Vickrey' as const };
  const pb = p.decideBid(ctx), bb = baseline.decideBid(ctx);
  assert.ok(pb >= Math.round(PACER_PARAMS.floor * 11) && pb > bb, `pacer ${pb} baseline ${bb}`);
});
test('observe is idempotent per auction id (reconnect replays)', () => {
  const a = newMatchPolicy('pacer'), b = newMatchPolicy('pacer');
  for (let i = 0; i < 10; i++) { a.observe(String(i), 'E', true, 30); b.observe(String(i), 'E', true, 30); b.observe(String(i), 'E', true, 30); }
  const ctx = { letter: 'A', myBalance: 100, myRack: rack('TRNSL'), dictionary, bagRemaining: 50, auctionType: 'Vickrey' as const };
  assert.equal(a.decideBid(ctx), b.decideBid(ctx));
});
test('pacer word choice is legal', () => {
  const p = newMatchPolicy('pacer');
  for (const r of ['RETAINS', 'QUIZTRAINEX', 'AEIOU', 'ZZ', 'CAT']) for (const n of [0, 1, 2, 30]) {
    const w = p.chooseWord({ myRack: rack(r), dictionary, myBalance: 5, bagRemaining: n });
    if (w) { assert.ok(dictionary.includes(w)); assert.ok(baseline.canSpell(w, rack(r))); }
  }
});
