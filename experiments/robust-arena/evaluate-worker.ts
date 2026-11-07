import {readFileSync,writeFileSync} from 'node:fs';
import {CanonicalDictionary,gameV2,metricsV2} from './arena_v2.js';
import {focalFactories,league} from './league.js';
import {prepareDictionary} from './parametric_strategy.js';
import {prepareDictionary as prepareOriginal} from './original_strategy.js';
const job=JSON.parse(process.argv[2]);
const dictionary=new CanonicalDictionary(readFileSync(new URL('./wordlist.txt',import.meta.url),'utf8').split(/\r?\n/));
prepareDictionary(dictionary.words);prepareOriginal(dictionary.words);
const factories=focalFactories(dictionary),opponents=league(job.league,dictionary);
const rows:any[]=[];const start=performance.now();let bidMax=0,wordMax=0,bidCalls=0,wordCalls=0;
for(let deal=0;deal<job.deals;deal++)for(let seat=0;seat<6;seat++)for(const name of job.policies){
 const factory=()=>{const agent=factories[name]();return {...agent,bid:(ctx:any)=>{const s=performance.now(),out=agent.bid(ctx);bidMax=Math.max(bidMax,performance.now()-s);bidCalls++;return out;},word:(ctx:any)=>{const s=performance.now(),out=agent.word(ctx);wordMax=Math.max(wordMax,performance.now()-s);wordCalls++;return out;}};}; 
 const result=gameV2({seed:job.seedStart+deal,seat,focus:factory,opponents,dictionary,auctionType:job.auctionType,missedWindowProbability:job.missedWindowProbability,maxWordsPerWindow:job.maxWordsPerWindow});
 rows.push({seed:job.seedStart+deal,seat,policy:name,...metricsV2(result)});
}
writeFileSync(job.output,JSON.stringify({job,rows,elapsedMs:performance.now()-start,latency:{bidCalls,wordCalls,bidMaxMs:bidMax,wordMaxMs:wordMax}},null,2)+'\n');
console.log(JSON.stringify({job:job.id,games:rows.length,elapsedMs:performance.now()-start}));
