import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { BAG, VALUES, GreedyDictionary, rackOf, reward, simulatedBid, resolveBids, seededRandom, simulate, type AuctionType } from '../original_simulator.js';
import { CanonicalDictionary, gameV2, resolveWithPriority } from '../arena_v2.js';
import { reference, fixture, snapshot, type Row } from './server-reference.js';
const server = reference();
const result = (ctx: Row): Row => [...ctx.db.auctionResult.rows.values()][0];

for (const type of ['FirstPrice', 'Vickrey'] as AuctionType[]) {
  test(`${type}: closeAuction matches mirror for zero bids, reserve, ties and price`, () => {
    const cases = [[], [0], [0, 0, 0], [1], [9, 0, 0], [9, 4, 2], [2, 9, 4], [7, 7, 0], [7, 7, 7], [100, 99, 0]];
    for (let seed = 0; seed < 40; seed++) for (const bids of cases) {
      const ctx = fixture(bids, type, [], [], seededRandom(seed));
      assert.equal(server.closeAuction(ctx, 1n), true);
      const expected = resolveBids(bids, type, seededRandom(seed));
      const actual = result(ctx);
      const priority = bids.map((_, i) => i).filter(i => bids[i] > 0);
      server.shuffle(fixture([], type, [], [], seededRandom(seed)), priority);
      priority.push(...bids.map((_, i) => i).filter(i => bids[i] === 0));
      assert.deepEqual(resolveWithPriority(bids, type, priority), expected);
      assert.equal(actual.winnerBotId === undefined ? null : Number(actual.winnerBotId) - 1, expected.winner, `${type} seed=${seed} bids=${bids}`);
      assert.equal(Number(actual.paid), expected.paid);
      assert.equal(ctx.db.pendingBid.rows.size, 0);
      assert.equal(ctx.db.auction.id.find(1n).status.tag, 'Closed');
      assert.equal(ctx.db.matchState.id.find(1n).status.tag, 'Ended');
      assert.equal(ctx.endCalls, 1);
      if (expected.winner !== null) {
        assert.equal(ctx.db.matchParticipant.id.find(BigInt(expected.winner + 1)).balance, 100n - actual.paid);
        assert.equal(ctx.db.holding.rows.size, 1);
      } else assert.equal(ctx.db.holding.rows.size, 0);
    }
  });
}

test('shuffle-then-sort permits every tied bidder to win and excludes zero bids', () => {
  const winners = new Set();
  for (let seed = 0; seed < 100; seed++) {
    const ctx = fixture([0, 5, 5, 5], 'Vickrey', [], [], seededRandom(seed));
    server.closeAuction(ctx, 1n);
    winners.add(result(ctx).winnerBotId);
    assert.equal(result(ctx).paid, 5n);
  }
  assert.deepEqual(winners, new Set([2n, 3n, 4n]));
});

test('all simulated strategies match actual bigint decideBid across letters, jitter and balances', () => {
  for (const kind of ['Cheapskate', 'ValueBidder', 'Aggressive'] as const)
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      for (const balance of [0, 1, 2, 5, 10, 100])
        for (let jitter = -2; jitter <= 2; jitter++)
          assert.equal(BigInt(simulatedBid(kind, letter, balance, jitter)), server.decideBid({ tag: kind }, letter, BigInt(balance), BigInt(jitter)));
  assert.equal(server.decideBid({ tag: 'Human' }, 'Z', 100n, 2n), 0n);
});

test('all letter values and exact 98-tile distribution match upstream', () => {
  assert.equal(BAG.length, server.BAG_SIZE);
  const expected = new Map<string, number>(server.DEFAULT_BAG);
  assert.deepEqual(rackOf(BAG.join('')), expected);
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') assert.equal(VALUES[letter], server.letterValue(letter));
});

test('playWord rewards use integer division, consume multiplicities and credit balance plus score', () => {
  // Odd base scores at lengths 4 and 6 explicitly exercise truncation of .5.
  for (const word of ['AT', 'ATE', 'AAAD', 'AAAAZ', 'AAAAAD', 'AAAAAAZ', 'AAAAAAAAAZ']) {
    const ctx = fixture([], 'Vickrey', [word + 'Z']);
    const participant = ctx.db.matchParticipant.id.find(1n);
    const played = server.playWord(ctx, participant, word);
    assert.ok('ok' in played);
    const after = ctx.db.matchParticipant.id.find(1n);
    assert.equal(after.balance, 100n + BigInt(reward(word)));
    assert.equal(after.score, BigInt(reward(word)));
    const event: Row = [...ctx.db.wordPlay.rows.values()][0];
    assert.equal(event.totalReward, BigInt(reward(word)));
    assert.equal(event.baseScore + event.bonus, event.totalReward);
    const holdings: Row[] = [...ctx.db.holding.rows.values()];
    assert.equal(holdings.length, 1);
    assert.equal(holdings[0].letter, 'Z');
    assert.equal(holdings[0].count, 1);
  }
});

test('insufficient repeated letters fail before any mutation', () => {
  for (const word of ['AAT', 'ATEE', 'ZAT']) {
    const ctx = fixture([], 'Vickrey', ['ATE']);
    const before = snapshot(ctx);
    assert.ok('err' in server.playWord(ctx, ctx.db.matchParticipant.id.find(1n), word));
    assert.equal(snapshot(ctx), before);
  }
});

test('actual submitWord callback validates dictionary, ASCII, length and multiplicity without mutation', () => {
  for (const word of ['', 'A', 'ÄT', 'ß', 'AT!', ' AT', 'ZZ', 'TEAATE']) {
    const ctx = fixture([], 'Vickrey', ['ATE']);
    const before = snapshot(ctx);
    assert.throws(() => server.submitWord(ctx, { matchId: 1n, word }));
    assert.equal(snapshot(ctx), before);
  }
  const ctx = fixture([], 'Vickrey', ['ATE']);
  server.submitWord(ctx, { matchId: 1n, word: 'eat' });
  assert.equal(ctx.db.matchParticipant.id.find(1n).score, 3n);
});

test('actual submitBid callback rejects invalid bids and replaces rather than accumulates', () => {
  for (const amount of [-1n, 101n]) {
    const ctx = fixture([2]);
    const before = snapshot(ctx);
    assert.throws(() => server.submitBid(ctx, { auctionId: 1n, amount }));
    assert.equal(snapshot(ctx), before);
  }
  const ctx = fixture([2]);
  server.submitBid(ctx, { auctionId: 1n, amount: 100n });
  assert.equal(ctx.db.pendingBid.rows.size, 1);
  assert.equal([...ctx.db.pendingBid.rows.values()][0].amount, 100n);
  server.submitBid(ctx, { auctionId: 1n, amount: 0n });
  assert.equal([...ctx.db.pendingBid.rows.values()][0].amount, 0n);
  ctx.timestamp.microsSinceUnixEpoch = 1000n;
  const before = snapshot(ctx);
  assert.throws(() => server.submitBid(ctx, { auctionId: 1n, amount: 1n }), /expired/);
  assert.equal(snapshot(ctx), before);
});

test('last tile allows simulated winner to play before ending, but external bots cannot play afterward', () => {
  for (const simulated of [false, true]) {
    const ctx = fixture([1], 'Vickrey', ['AE'], simulated ? [0] : []);
    server.closeAuction(ctx, 1n);
    assert.equal(ctx.db.matchParticipant.id.find(1n).score, simulated ? 3n : 0n);
    assert.equal(ctx.db.matchState.id.find(1n).status.tag, 'Ended');
    const before = snapshot(ctx);
    assert.throws(() => server.submitWord(ctx, { matchId: 1n, word: 'ATE' }), /not running/);
    assert.equal(snapshot(ctx), before);
    const mirror = simulate({ seed: 1, kinds: [simulated ? 'ValueBidder' : 'enhanced'], dictionary: new GreedyDictionary(['AT', 'ATE', 'EAT', 'TEA']), bag: ['T'], initialRacks: ['AE'], policy: { decideBid: () => 1, chooseWord: () => null } });
    assert.equal(mirror.players[0].score, Number(ctx.db.matchParticipant.id.find(1n).score));
    const dictionary = new GreedyDictionary(['AT', 'ATE', 'EAT', 'TEA']);
    const v2 = gameV2({ seed: 1, opponents: [], focus: () => ({ name: simulated ? 'ValueBidder' : 'external', server: simulated, bid: () => 1, word: c => dictionary.longest(c.myRack, simulated ? 3 : 2) }), dictionary, auctionType: 'Vickrey', bag: ['T'], initialRacks: ['AE'] });
    assert.equal(v2.players[0].score, Number(ctx.db.matchParticipant.id.find(1n).score));
    assert.equal(v2.players[0].balance, Number(ctx.db.matchParticipant.id.find(1n).balance));
  }
});

test('drawLetter uses remaining multiplicity, decrements bag and ends at exhaustion', () => {
  const ctx = fixture();
  ctx.db.matchState.id.update({ ...ctx.db.matchState.id.find(1n), bagTotal: 98 });
  for (const [letter, remaining] of server.DEFAULT_BAG) ctx.db.bagLetter.insert({ matchId: 1n, letter, remaining });
  const drawn = [];
  while (ctx.db.matchState.id.find(1n).bagTotal) drawn.push(server.drawLetter(ctx, 1n));
  assert.deepEqual(rackOf(drawn.join('')), rackOf(BAG.join('')));
  assert.equal(server.drawLetter(ctx, 1n), undefined);
  assert.ok([...ctx.db.bagLetter.rows.values()].every((r: Row) => r.remaining === 0));
});

test('canonical dictionary matches server longest-then-lex ordering', () => {
  const words = ['TEA', 'EAT', 'ATE', 'AT', 'TATE'];
  const upstream = reference(words);
  const mirror = new CanonicalDictionary(words);
  for (const rack of ['TEA', 'TEAT', 'TT', 'AT', 'EATZ']) for (const min of [2, 3, 4, 5]) {
    assert.equal(mirror.longest(rackOf(rack), min), upstream.findBestPlayable(rackOf(rack), min) ?? null, `${rack} min=${min}`);
  }
});

test('archived generic dictionary preserves input-order ties (documented boundary)', () => {
  const words = ['TEA', 'EAT', 'ATE'];
  assert.equal(new GreedyDictionary(words).longest(rackOf('ATE')), 'TEA');
  assert.equal(reference(words).findBestPlayable(rackOf('ATE'), 2), 'ATE');
});

test('nonfinal close opens and schedules next auction, allowing external play in its window', () => {
  const ctx = fixture([1], 'Vickrey', ['AE']);
  ctx.db.matchState.id.update({ ...ctx.db.matchState.id.find(1n), bagTotal: 1 });
  ctx.db.bagLetter.insert({ matchId: 1n, letter: 'Z', remaining: 1 });
  assert.equal(server.closeAuction(ctx, 1n), false);
  const next = ctx.db.matchState.id.find(1n);
  assert.equal(next.status.tag, 'Running');
  assert.equal(next.currentRound, 2);
  assert.equal(next.bagTotal, 0);
  assert.equal(ctx.db.auction.id.find(next.currentAuctionId).letter, 'Z');
  assert.equal(ctx.db.auctionSchedule.rows.size, 1);
  assert.equal(ctx.endCalls, 0);
  server.submitWord(ctx, { matchId: 1n, word: 'ATE' });
  server.submitBid(ctx, { auctionId: next.currentAuctionId, amount: 1n });
  assert.equal(server.closeAuction(ctx, 1n), true);
  const dictionary = new GreedyDictionary(['AT', 'ATE', 'EAT', 'TEA']);
  const v2 = gameV2({ seed: 1, opponents: [], focus: () => ({ name: 'external', bid: () => 1, word: c => dictionary.longest(c.myRack) }), dictionary, auctionType: 'Vickrey', bag: ['T', 'Z'], initialRacks: ['AE'] });
  assert.equal(v2.players[0].score, Number(ctx.db.matchParticipant.id.find(1n).score));
  assert.equal(v2.players[0].balance, Number(ctx.db.matchParticipant.id.find(1n).balance));
  assert.deepEqual([...v2.players[0].rack], [['Z', 1]]);
});

test('pinned upstream fixtures match recorded content and Git blob hashes', () => {
  const manifest = JSON.parse(readFileSync(new URL('../reference/SOURCES.json', import.meta.url), 'utf8'));
  assert.equal(manifest.commit, 'b5ccb36aa238ad16692f8d6af54da15ef9f11324');
  for (const entry of manifest.files) {
    const bytes = readFileSync(new URL('../reference/' + entry.file, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    assert.equal(createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex'), entry.local_git_blob_sha1);
  }
});
