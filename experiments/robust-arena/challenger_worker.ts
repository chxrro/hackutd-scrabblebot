import {readFileSync,writeFileSync} from 'node:fs';
import {CanonicalDictionary,gameV2,metricsV2} from './arena_v2.js';
import {challengerLeague} from './challenger_league.js';
import {prepareDictionary, type Parameters} from './parametric_strategy.js';
import {model} from './arena.js';
import {mean} from './statistics.js';
const job=JSON.parse(process.argv[2]);
const dictionary=new CanonicalDictionary(readFileSync(new URL('./wordlist.txt',import.meta.url),'utf8').split(/\r?\n/));
prepareDictionary(dictionary.words);
const rows:any[]=[];const start=performance.now();
const timings={bid:[] as number[],word:[] as number[]};
for(const setting of job.settings){
 const opponents=challengerLeague(job.split,setting.family,dictionary);
 for(const candidate of job.candidates)for(let deal=0;deal<job.deals;deal++)for(const seat of job.seats){
  const factory=()=>{const agent=model(candidate.parameters as Parameters,candidate.id);if(!job.measure)return agent;return {...agent,bid:(ctx:any)=>{const t=performance.now(),out=agent.bid(ctx);timings.bid.push(performance.now()-t);return out;},word:(ctx:any)=>{const t=performance.now(),out=agent.word(ctx);timings.word.push(performance.now()-t);return out;}};};
  const result=gameV2({seed:job.seedStart+deal,seat,focus:factory,opponents,dictionary,auctionType:job.auctionType,missedWindowProbability:setting.missedWindowProbability,maxWordsPerWindow:setting.maxWordsPerWindow});
  rows.push({seed:job.seedStart+deal,seat,policy:candidate.id,auctionType:job.auctionType,setting:setting.id,...metricsV2(result)});
 }
}
const summaries=job.candidates.map((candidate:any)=>{const own=rows.filter(r=>r.policy===candidate.id);return {...candidate,games:own.length,objective:mean(own.map(r=>r.pairwise+.002*r.score)),score:mean(own.map(r=>r.score)),pairwise:mean(own.map(r=>r.pairwise)),outrightWin:mean(own.map(r=>r.outrightWin))};});
const latency=Object.fromEntries(Object.entries(timings).map(([k,xs])=>{xs.sort((a,b)=>a-b);return [k,{calls:xs.length,meanMs:xs.length?mean(xs):null,p95Ms:xs[Math.floor(xs.length*.95)]??null,p99Ms:xs[Math.floor(xs.length*.99)]??null,maxMs:xs.at(-1)??null}]}));
writeFileSync(job.output,JSON.stringify({job,rows,summaries,latency,elapsedMs:performance.now()-start},null,2)+'\n');
console.log(JSON.stringify({job:job.id,games:rows.length,best:[...summaries].sort((a,b)=>b.objective-a.objective)[0],elapsedMs:performance.now()-start}));
