/** Evaluation only: the frozen policy is never fitted or selected on these fresh seeds. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mean,clusterInterval} from './statistics.js';
const root=new URL('.',import.meta.url),directory=process.env.RESULT_DIR??'results/robust-evaluation';
const deals=Number(process.env.DEALS??32),parallel=Number(process.env.WORKERS??3),seedStart=Number(process.env.SEED_START??710001);
if(!Number.isSafeInteger(deals)||deals<1||!Number.isSafeInteger(parallel)||parallel<1||!Number.isSafeInteger(seedStart))throw Error('Invalid evaluation settings');
mkdirSync(directory,{recursive:true});
const configurations:any[]=[];
for(const auctionType of ['Vickrey','FirstPrice']){
 for(const league of ['server-mixed','smart-mixed','frozen-mirror','frontier-mixed','portfolio-mixed'])configurations.push({auctionType,league,label:'ideal'});
 configurations.push({auctionType,league:'frontier-mixed',label:'miss-10pct',missedWindowProbability:.1});
 configurations.push({auctionType,league:'frontier-mixed',label:'one-word',maxWordsPerWindow:1});
}
const jobs=configurations.map(config=>{const id=`${config.auctionType}-${config.league}-${config.label}`;return {...config,id,deals,seedStart,policies:['frozen','original'],output:`${directory}/${id}.json`};});
const tracked=['arena_v2.ts','league.ts','statistics.ts','evaluate.ts','evaluate-worker.ts','parametric_strategy.ts','original_strategy.ts','original_simulator.ts','learned_policy.ts','learned-weights.json','wordlist.txt'];
const hashes=Object.fromEntries(tracked.map(f=>[f,createHash('sha256').update(readFileSync(new URL(f,root))).digest('hex')]));
const plan={createdAt:new Date().toISOString(),purpose:'Fresh evaluation of existing frozen policy, no training or model selection',seedRange:[seedStart,seedStart+deals-1],dealsPerSetting:deals,seats:[0,1,2,3,4,5],policies:['frozen','original'],settings:configurations,hashes,confidence:'Paired percentile bootstrap over deal means, 5000 resamples. All six seats form one cluster. Intervals are per comparison, not simultaneous.',stress:'Synthetic skipped external windows and one-word budgets; not measured network latency.'};
// This file is persisted before any game and is not changed by worker results.
writeFileSync(`${directory}/evaluation-plan.json`,JSON.stringify(plan,null,2)+'\n');
const begin=performance.now();let next=0;
async function runner(){while(next<jobs.length){const job=jobs[next++];await new Promise<void>((resolve,reject)=>{const child=spawn(process.execPath,['--import','tsx','evaluate-worker.ts',JSON.stringify(job)],{cwd:root,stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`${job.id} failed with ${code}`)));});}}
await Promise.all(Array.from({length:Math.min(parallel,jobs.length)},runner));
const summaries=[];let totalGames=0;
for(const job of jobs){
 const raw=JSON.parse(readFileSync(job.output,'utf8'));totalGames+=raw.rows.length;
 const metrics=['score','serverWin','outrightWin','fractionalWin','pairwise','rank','midRank','spent','balance','leftoverTiles','words','auctionsWon','missedWindows'];
 const policy=Object.fromEntries(job.policies.map((name:string)=>[name,Object.fromEntries(metrics.map(metric=>[metric,mean(raw.rows.filter((r:any)=>r.policy===name).map((r:any)=>r[metric]))]))]));
 const paired=Object.fromEntries(['score','serverWin','outrightWin','fractionalWin','pairwise'].map(metric=>{
  const blocks=Array.from({length:deals},(_,i)=>mean(Array.from({length:6},(_,seat)=>{
   const a=raw.rows.find((r:any)=>r.seed===seedStart+i&&r.seat===seat&&r.policy==='frozen');
   const b=raw.rows.find((r:any)=>r.seed===seedStart+i&&r.seat===seat&&r.policy==='original');return a[metric]-b[metric];
  })));
  return [metric,clusterInterval(blocks)];
 }));
 summaries.push({id:job.id,auctionType:job.auctionType,league:job.league,stress:job.label,gamesPerPolicy:deals*6,independentDeals:deals,policy,pairedFrozenMinusOriginal:paired,latency:raw.latency,workerElapsedMs:raw.elapsedMs});
}
const report={...plan,completedAt:new Date().toISOString(),elapsedMs:performance.now()-begin,totalGames,summaries,limitations:['Offline source-pinned model, no tournament or live-server claims.','Source parity harness mocks DB scheduling, permissions, authentication and rating updates; not a full SpacetimeDB integration test.','No actual entrant strategies or live observations in this league.','Portfolio exact rack partition falls back to longest-word reward above 16 tiles.','The public-price adaptive opponent is synthetic, not fitted to live market data.','Fresh evaluation uses a modest number of independent deals; six seats are correlated.','Existing policy is frozen. We do not promote a new winner based on this evaluation.']};
writeFileSync(`${directory}/report.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({stage:'complete',totalGames,elapsedMs:report.elapsedMs,report:`${directory}/report.json`}));
