/** Verify the completed experiment without running or selecting any new games. */
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {mean,clusterInterval} from './statistics.js';
const directory=process.env.CHALLENGER_RESULT_DIR??'results/challenger-20261107';
const read=(file:string)=>JSON.parse(readFileSync(`${directory}/${file}`,'utf8'));
const plan=read('training-plan.json'),report=read('report.json'),lock=read('final-evaluation-lock.json'),weights=read('challenger-weights.json');
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
for(const [file,sha] of Object.entries(plan.hashes))assert.equal(hash(readFileSync(new URL(file,import.meta.url))),sha,`Source changed: ${file}`);
assert.equal(hash(readFileSync(`${directory}/challenger-weights.json`)),lock.frozenHash);
assert.equal(hash(readFileSync('challenger-weights.json')),lock.frozenHash);
assert.equal(report.weightsHash,lock.frozenHash);assert.deepEqual(report.parameters,weights.parameters);assert.deepEqual(lock.parameters,weights.parameters);
assert.equal(report.finalUsedForSelection,false);
const jobs=readdirSync(directory).filter(file=>/^(screen|refine|validation|final)-(Vickrey|FirstPrice)-\d+\.json$/.test(file)).map(read).sort((a,b)=>Number(a.job.id.split('-').at(-1))-Number(b.job.id.split('-').at(-1)));
let total=0;const finalRows:any[]=[];
for(const raw of jobs){
 const {job,rows}=raw;total+=rows.length;
 assert.equal(rows.length,job.candidates.length*job.deals*job.seats.length*job.settings.length);
 const range=plan.seeds[job.split==='train'?'training':job.split];
 const identities=new Set();
 for(const row of rows){
  assert.ok(row.seed>=range[0]&&row.seed<=range[1]);assert.ok(!(row.seed>=710001&&row.seed<=710032));
  assert.ok(job.seats.includes(row.seat));assert.ok(job.candidates.some((c:any)=>c.id===row.policy));assert.equal(row.auctionType,job.auctionType);
  const key=`${row.seed}/${row.seat}/${row.policy}/${row.setting}`;assert.ok(!identities.has(key));identities.add(key);
  assert.ok(row.score>=0&&Number.isSafeInteger(row.score));assert.ok(row.balance>=0&&Number.isSafeInteger(row.balance));
  assert.equal(row.balance,100+row.score-row.spent);assert.ok(row.pairwise>=0&&row.pairwise<=1);
 }
 if(job.split==='final')finalRows.push(...rows);
}
assert.equal(total,report.totalGames);assert.equal(finalRows.length,report.finalGames);assert.equal(report.totalGames,19296);assert.equal(report.finalGames,6912);
assert.equal(new Set(finalRows.map(r=>r.seed)).size,48);
for(const metric of ['score','serverWin','outrightWin','fractionalWin','pairwise']){
 const expected=clusterInterval(Array.from({length:48},(_,i)=>{const deal=finalRows.filter(r=>r.seed===1200001+i);return mean(deal.filter(r=>r.policy==='challenger').map(r=>r[metric]))-mean(deal.filter(r=>r.policy==='frozen').map(r=>r[metric]));}));
 assert.deepEqual(report.aggregate.pairedChallengerMinusFrozen[metric],expected);
}
for(const selected of weights.selection){
 const ranked=[...selected.ranked].sort((a,b)=>b.objective-a.objective||(a.id==='frozen'?-1:1));
 assert.deepEqual(weights.parameters[selected.auctionType],ranked[0].parameters);
}
console.log(JSON.stringify({verified:true,totalGames:total,finalGames:finalRows.length,independentFinalDeals:48,sourceAndBaselineHashesMatch:true,lockedWeightsMatch:true,aggregateIntervalsRecomputed:true,validationSelectionVerified:true},null,2));
