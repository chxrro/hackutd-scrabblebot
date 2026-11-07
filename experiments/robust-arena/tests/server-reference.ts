/** Execute selected, unchanged declarations from the pinned official source.
 * This is a unit harness, not a SpacetimeDB emulator. See reference/README.md.
 */
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function source(file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(new URL(`../reference/${file}`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
}
function declarations(file: string, names?: string[]): string {
  const ast = source(file);
  const selected = ast.statements.filter(node => {
    if (ts.isFunctionDeclaration(node)) return !names || (node.name !== undefined && names.includes(node.name.text));
    if (ts.isVariableStatement(node)) return !names || node.declarationList.declarations.some(d => ts.isIdentifier(d.name) && names.includes(d.name.text));
    return false;
  });
  if (names) for (const name of names) {
    if (!selected.some(n => ts.isFunctionDeclaration(n) ? n.name?.text === name : ts.isVariableStatement(n) && n.declarationList.declarations.some(d => ts.isIdentifier(d.name) && d.name.text === name))) throw Error(`Missing upstream declaration ${file}:${name}`);
  }
  return selected.map(n => n.getText(ast)).join('\n');
}
function reducer(name: string): string {
  const ast = source('server-index.ts');
  for (const node of ast.statements) {
    if (!ts.isVariableStatement(node)) continue;
    for (const d of node.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || d.name.text !== name || !d.initializer || !ts.isCallExpression(d.initializer)) continue;
      const callback = d.initializer.arguments.find(ts.isArrowFunction);
      if (callback) return `const ${name} = ${callback.getText(ast)};`;
    }
  }
  throw Error(`Missing upstream reducer ${name}`);
}
const gameNames = ['AUCTION_RESERVE', 'SIM_BID_JITTER', 'minBig', 'maxBig', 'shuffle', 'sortDescending', 'closeAuction', 'findParticipant', 'playWord', 'addToRack', 'drawLetter', 'decideBid', 'simulateWordPlay', 'simulateBids', 'replaceBid', 'callerBotId', 'orThrow', 'isErr', 'afterMillis'];

// Deliberately dynamic: the official DB SDK types are not dependencies of this project.
export type Row = Record<string, any>;
export function reference(words: string[] = ['AT', 'ATE', 'EAT', 'TEA']) {
  const program = [declarations('server-letters.ts'), declarations('server-text.ts'), declarations('server-dictionary.ts'), declarations('server-game.ts', gameNames), reducer('submitBid'), reducer('submitWord')].join('\n');
  const js = ts.transpileModule(program, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exported: Row = {};
  const sandbox: Row = {
    exports: exported, WORDLIST: [...words].sort().join('\n'), TextEncoder,
    console: { info() {} }, SenderError: Error,
    Timestamp: class { constructor(public microsSinceUnixEpoch: bigint) {} },
    ScheduleAt: { time: (value: bigint) => value },
    onMatchEnded: (ctx: Row) => { ctx.endCalls++; },
  };
  runInNewContext(`${js}\nexports.submitBid = submitBid; exports.submitWord = submitWord;`, sandbox);
  return exported;
}

/** Snapshot-valued rows and indexes covering just the exercised server functions. */
export function table(initial: Row[] = [], indexes: Record<string, string[]> = {}) {
  const rows = new Map<bigint, Row>();
  let next = 1n;
  const copy = (row: Row) => ({ ...row });
  const api: Row = {
    rows,
    insert(row: Row) { const id = row.id && row.id !== 0n ? row.id : next++; if (id >= next) next = id + 1n; const saved = { ...row, id }; rows.set(id, saved); return copy(saved); },
    id: {
      find(id: bigint) { const row = rows.get(id); return row && copy(row); },
      update(row: Row) { if (!rows.has(row.id)) throw Error('Updating absent row'); rows.set(row.id, copy(row)); },
      delete(id: bigint) { return rows.delete(id); },
    },
  };
  for (const [name, fields] of Object.entries(indexes)) api[name] = {
    filter(key: unknown) { const keys = Array.isArray(key) ? key : [key]; return [...rows.values()].filter(row => fields.every((field, i) => row[field] === keys[i])).map(copy); },
    find(key: unknown) { return [...rows.values()].find(row => row[fields[0]] === key); },
  };
  for (const row of initial) api.insert(row);
  return api;
}
export function fixture(bids: number[] = [], type = 'Vickrey', racks: string[] = [], simulated: number[] = [], random: () => number = () => 0) {
  const n = Math.max(1, bids.length, racks.length);
  const db: Row = {
    matchState: table([{ id: 1n, status: { tag: 'Running' }, currentAuctionId: 1n, currentRound: 1, auctionType: { tag: type }, auctionDurationMs: 1000n, bagTotal: 0 }]),
    auction: table([{ id: 1n, matchId: 1n, letter: 'T', status: { tag: 'Open' }, closesAt: { microsSinceUnixEpoch: 1000n } }]),
    matchParticipant: table(Array.from({ length: n }, (_, i) => ({ id: BigInt(i + 1), matchId: 1n, botId: BigInt(i + 1), balance: 100n, score: 0n })), { mpByMatch: ['matchId'] }),
    bot: table(Array.from({ length: n }, (_, i) => ({ id: BigInt(i + 1), isSimulated: simulated.includes(i), strategy: { tag: 'ValueBidder' } }))),
    botCredential: table([{ identity: 'caller', botId: 1n }], { identity: ['identity'] }),
    pendingBid: table(bids.map((b, i) => ({ auctionId: 1n, bidderBotId: BigInt(i + 1), amount: BigInt(b) })), { bidByAuction: ['auctionId'] }),
    holding: table([], { holdingByMatchBot: ['matchId', 'botId'] }),
    bagLetter: table([], { bagByMatch: ['matchId'] }),
    wordPlay: table(), auctionResult: table(), auctionTopBid: table(), auctionSchedule: table(),
  };
  racks.forEach((rack, i) => {
    const counts = new Map<string, number>();
    for (const c of rack) counts.set(c, (counts.get(c) ?? 0) + 1);
    for (const [letter, count] of counts) db.holding.insert({ matchId: 1n, botId: BigInt(i + 1), letter, count });
  });
  return { db, sender: 'caller', timestamp: { microsSinceUnixEpoch: 0n }, endCalls: 0, random: { integerInRange: (min: number, max: number) => min + Math.floor(random() * (max - min + 1)) } };
}
export function snapshot(ctx: Row): string {
  return JSON.stringify(Object.fromEntries(Object.entries(ctx.db).map(([name, t]) => [name, [...(t as Row).rows.values()]])), (_, value) => typeof value === 'bigint' ? `${value}n` : value);
}
