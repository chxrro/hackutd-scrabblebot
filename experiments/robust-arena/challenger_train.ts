/** Fixed-budget black-box tuning. Final data are read only after weights are frozen. */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {seededRandom,type AuctionType} from './original_simulator.js';
import {LEARNED_PARAMETERS} from './learned_policy.js';
import type {Parameters} from './parametric_strategy.js';
import {population,POPULATION_SEEDS,type Split,type Family} from './challenger_league.js';
import {mean,clusterInterval} from './statistics.js';
const root=new URL('.',import.meta.url),directory=process.env.CHALLENGER_RESULT_DIR??'results/challenger-20261107';
const parallel=Number(process.env.WORKERS??3);if(!Number.isSafeInteger(parallel)||parallel<1)throw Error('Invalid WORKERS');
if(existsSync(`${directory}/training-plan.json`))throw Error('Refusing to overwrite existing experiment. Use a new result directory and fresh seed configuration.');
mkdirSync(directory,{recursive:true});
const begin=performance.now(),types:AuctionType[]=['Vickrey','FirstPrice'];
const keys:(keyof Parameters)[]=['face','marginal','future','shade','cash','minLength','liquidate','cap'];
const bounds=[[.5,7],[.05,1.8],[0,1.4],[.25,1.3],[10,65],[4.5,9],[1,18],[12,60]];
const clamp=(values:number[])=>Object.fromEntries(keys.map((k,i)=>[k,Math.max(bounds[i][0],Math.min(bounds[i][1],values[i]))])) as unknown as Parameters;
const rng=seededRandom(1900001),normal=()=>Math.sqrt(-2*Math.log(Math.max(1e-10,rng())))*Math.cos(2*Math.PI*rng());
const families:Family[]=['pressure','portfolio','balanced'];
const trainingSettings=families.map(family=>({id:family,family}));
const finalSettings=[...trainingSettings,{id:'frontier-mixed',family:'frontier-mixed'},{id:'balanced-miss-10pct',family:'balanced',missedWindowProbability:.1},{id:'balanced-one-word',family:'balanced',maxWordsPerWindow:1}];
const tracked=['challenger_train.ts','challenger_worker.ts','challenger_league.ts','arena_v2.ts','league.ts','arena.ts','statistics.ts','parametric_strategy.ts','original_strategy.ts','original_simulator.ts','learned_policy.ts','learned-weights.json','wordlist.txt'];
const hashes=()=>Object.fromEntries(tracked.map(f=>[f,createHash('sha256').update(readFileSync(new URL(f,root))).digest('hex')]));
const plan={createdAt:new Date().toISOString(),method:'Fixed-budget randomized/evolutionary black-box optimization, separate weights per auction type; no neural-network/LLM training',objective:'Mean pairwise finish score + 0.002 * game score, equally weighted across three synthetic opponent families',seeds:{training:[1000001,1000016],validation:[1100001,1100024],final:[1200001,1200048],candidateRandomness:1900001,populations:POPULATION_SEEDS},excludedPriorTest:[710001,710032],budget:{screenCandidatesPerAuction:24,screenDeals:8,screenSeats:[0,2,4],refineCandidatesPerAuction:16,refineDeals:16,refineSeats:[1,3,5],validationFinalistsPerAuction:5,validationDeals:24,validationSeats:[0,1,2,3,4,5],finalDeals:48,finalSeats:[0,1,2,3,4,5]},selection:'Top four non-baseline refined candidates plus frozen baseline enter validation. Highest validation objective wins separately by auction; ties favor baseline. Freeze weights and hashes before any final test game. No retraining or promotion chosen from final outcomes.',families,finalSettings,populations:Object.fromEntries((['train','validation','final'] as Split[]).map(split=>[split,Object.fromEntries(families.map(family=>[family,population(split,family)]))])),parameterBounds:Object.fromEntries(keys.map((k,i)=>[k,bounds[i]])),hashes:hashes(),statistics:'Paired bootstrap over independent deal means. Six seats and all settings using a deal are clustered together for aggregate comparisons. 5000 resamples; per-comparison intervals, no multiple-comparison correction.',limitations:['All opponents are synthetic. Populations have distinct parameter draws across splits but share policy implementations.','The fixed historical frontier comparator deliberately shares frozen opponents with the prior experiment; it is separate from the disjoint generated populations.','Only 48 independent final deals. More seats and settings do not make new independent deals.','Synthetic missed windows are not measured live network latency.']};
writeFileSync(`${directory}/training-plan.json`,JSON.stringify(plan,null,2)+'\n');
let jobCounter=0,totalGames=0;
async function run(jobs:any[]){let next=0;await Promise.all(Array.from({length:Math.min(parallel,jobs.length)},async()=>{while(next<jobs.length){const job=jobs[next++];await new Promise<void>((resolve,reject)=>{const child=spawn(process.execPath,['--import','tsx','challenger_worker.ts',JSON.stringify(job)],{cwd:root,stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`${job.id} failed: ${code}`)));});}}));return jobs.map(job=>{const raw=JSON.parse(readFileSync(job.output,'utf8'));totalGames+=raw.rows.length;return raw;});}
const makeJob=(stage:string,auctionType:AuctionType,candidates:any[],deals:number,seats:number[],split:Split,seedStart:number,settings:any[],measure=false)=>{const id=`${stage}-${auctionType}-${++jobCounter}`;return {id,auctionType,candidates,deals,seats,split,seedStart,settings,measure,output:`${directory}/${id}.json`};};
const initial=types.flatMap(auctionType=>Array.from({length:24},(_,i)=>{
 const parameters=i===0?{...LEARNED_PARAMETERS}:i<12?clamp(keys.map((k,j)=>LEARNED_PARAMETERS[k]+normal()*[1.2,.45,.35,.24,16,1.6,5,15][j])):clamp(keys.map((_,j)=>bounds[j][0]+rng()*(bounds[j][1]-bounds[j][0])));
 return makeJob('screen',auctionType,[{id:i===0?'frozen':`screen-${i}`,parameters}],8,[0,2,4],'train',1000001,trainingSettings);
}));
const screen=await run(initial),screenByType=(type:AuctionType)=>screen.filter(r=>r.job.auctionType===type).flatMap(r=>r.summaries).sort((a,b)=>b.objective-a.objective);
console.log(JSON.stringify({stage:'screen-complete',totalGames,elapsedMs:performance.now()-begin,best:types.map(type=>({auctionType:type,...screenByType(type)[0]}))}));
const refine=types.flatMap(auctionType=>{const elite=screenByType(auctionType).slice(0,4);return Array.from({length:16},(_,i)=>{
 const source=elite[i%4].parameters as Parameters;
 const parameters=i===0?{...LEARNED_PARAMETERS}:i<=4?elite[i-1].parameters:clamp(keys.map((k,j)=>source[k]+normal()*[.55,.22,.18,.12,8,.7,2.5,7][j]));
 return makeJob('refine',auctionType,[{id:i===0?'frozen':`refine-${i}`,parameters}],16,[1,3,5],'train',1000001,trainingSettings);
});});
const refined=await run(refine);
const validation=types.map(auctionType=>{const ranked=refined.filter(r=>r.job.auctionType===auctionType).flatMap(r=>r.summaries).sort((a,b)=>b.objective-a.objective);const seen=new Set<string>();const nonbaseline=ranked.filter(c=>c.id!=='frozen'&&JSON.stringify(c.parameters)!==JSON.stringify(LEARNED_PARAMETERS)&&!seen.has(JSON.stringify(c.parameters))&&!!seen.add(JSON.stringify(c.parameters))).slice(0,4);return makeJob('validation',auctionType,[{id:'frozen',parameters:{...LEARNED_PARAMETERS}},...nonbaseline],24,[0,1,2,3,4,5],'validation',1100001,trainingSettings);});
console.log(JSON.stringify({stage:'refine-complete',totalGames,elapsedMs:performance.now()-begin}));
const validated=await run(validation);
const parameters=Object.fromEntries(types.map(type=>{const results=validated.find(r=>r.job.auctionType===type).summaries;results.sort((a:any,b:any)=>b.objective-a.objective||(a.id==='frozen'?-1:1));return [type,results[0].parameters];}));
const frozen={createdAt:new Date().toISOString(),method:plan.method,parameters,selection:validated.map(r=>({auctionType:r.job.auctionType,ranked:r.summaries})),trainingSeedRange:plan.seeds.training,validationSeedRange:plan.seeds.validation,untouchedFinalSeedRange:plan.seeds.final,preFinalHashes:hashes()};
writeFileSync(`${directory}/challenger-weights.json`,JSON.stringify(frozen,null,2)+'\n');
writeFileSync('challenger-weights.json',JSON.stringify(frozen,null,2)+'\n');
const frozenHash=createHash('sha256').update(readFileSync(`${directory}/challenger-weights.json`)).digest('hex');
writeFileSync(`${directory}/final-evaluation-lock.json`,JSON.stringify({createdAt:new Date().toISOString(),frozenHash,finalSeedRange:plan.seeds.final,settings:finalSettings,parameters,hashes:hashes()},null,2)+'\n');
console.log(JSON.stringify({stage:'weights-frozen-before-final',parameters,frozenHash,totalGames,elapsedMs:performance.now()-begin}));
const jobs=types.flatMap(auctionType=>finalSettings.map(setting=>makeJob('final',auctionType,[{id:'frozen',parameters:{...LEARNED_PARAMETERS}},{id:'challenger',parameters:parameters[auctionType]}],48,[0,1,2,3,4,5],'final',1200001,[setting],true)));
const final=await run(jobs);
if(JSON.stringify(hashes())!==JSON.stringify(plan.hashes))throw Error('Tracked training/evaluation source changed during run');
if(createHash('sha256').update(readFileSync(`${directory}/challenger-weights.json`)).digest('hex')!==frozenHash)throw Error('Challenger changed after final lock');
const allRows=final.flatMap(r=>r.rows),metrics=['score','serverWin','outrightWin','fractionalWin','pairwise','rank','midRank','spent','balance','leftoverTiles','words','auctionsWon','missedWindows'];
function summarize(rows:any[]){
 const policy=Object.fromEntries(['frozen','challenger'].map(name=>[name,Object.fromEntries(metrics.map(metric=>[metric,mean(rows.filter(r=>r.policy===name).map(r=>r[metric]))]))]));
 const paired=Object.fromEntries(['score','serverWin','outrightWin','fractionalWin','pairwise'].map(metric=>[metric,clusterInterval(Array.from({length:48},(_,i)=>{const deal=rows.filter(r=>r.seed===1200001+i);return mean(deal.filter(r=>r.policy==='challenger').map(r=>r[metric]))-mean(deal.filter(r=>r.policy==='frozen').map(r=>r[metric]));}))]));
 return {gamesPerPolicy:rows.length/2,independentDeals:48,policy,pairedChallengerMinusFrozen:paired};
}
const summaries=final.map(r=>({auctionType:r.job.auctionType,setting:r.job.settings[0],...summarize(r.rows),latency:r.latency}));
const report={...plan,completedAt:new Date().toISOString(),elapsedMs:performance.now()-begin,totalGames,finalGames:allRows.length,weightsHash:frozenHash,parameters,validation:frozen.selection,summaries,aggregateByAuction:types.map(auctionType=>({auctionType,...summarize(allRows.filter(r=>r.auctionType===auctionType))})),aggregate:summarize(allRows),allHashesUnchanged:true,finalUsedForSelection:false};
writeFileSync(`${directory}/report.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({stage:'complete',totalGames,finalGames:allRows.length,elapsedMs:report.elapsedMs,aggregate:report.aggregate,report:`${directory}/report.json`}));
