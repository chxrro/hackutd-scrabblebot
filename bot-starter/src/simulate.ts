import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chooseWord, decideBid, prepareDictionary } from './strategy.js';
import { GreedyDictionary, simulate, type Kind, type Policy, type AuctionType } from './simulator.js';
const sha256=(relative:string)=>createHash('sha256').update(readFileSync(new URL(relative,import.meta.url))).digest('hex');
const sourceSha256={strategy:sha256('./strategy.ts'),simulator:sha256('./simulator.ts'),wordlist:sha256('../../spacetimedb/wordlist.txt')};
const dictionary=new GreedyDictionary(readFileSync(new URL('../../spacetimedb/wordlist.txt',import.meta.url),'utf8').split(/\r?\n/).map(x=>x.trim().toUpperCase()).filter(x=>/^[A-Z]{2,}$/.test(x)).sort((a,b)=>b.length-a.length));
const preparationStart=performance.now();prepareDictionary(dictionary.words);const dictionaryPreparationMs=performance.now()-preparationStart;
const games=Number(process.argv[2]??100);if(!Number.isInteger(games)||games<1)throw Error('Provide positive integer games per scenario');
const timings={bid:[] as number[],word:[] as number[]};
const policy:Policy={decideBid(ctx){const start=performance.now();const out=decideBid(ctx);timings.bid.push(performance.now()-start);return out;},chooseWord(ctx){const start=performance.now();const out=chooseWord(ctx);timings.word.push(performance.now()-start);return out;}};
const scenarios:Record<string,Kind[]>={starters:['starter','starter','starter','starter','starter'],mixed:['Cheapskate','ValueBidder','Aggressive','Aggressive','ValueBidder']};
const results=[];const begin=performance.now();
for(const auctionType of ['Vickrey','FirstPrice'] as AuctionType[])for(const [scenario,opponents]of Object.entries(scenarios)){
  const scores:number[]=[],baseline:number[]=[],margins:number[]=[],ranks:number[]=[];let wins=0,outrightWins=0,baselineWins=0;
  for(let i=0;i<games;i++){const seed=10001+i;const a=simulate({seed,kinds:['enhanced',...opponents],dictionary,policy,auctionType});const b=simulate({seed,kinds:['starter',...opponents],dictionary,policy,auctionType});const score=a.players[0].score;const max=Math.max(...a.players.slice(1).map(p=>p.score));scores.push(score);baseline.push(b.players[0].score);margins.push(score-max);ranks.push(1+a.players.slice(1).filter(p=>p.score>score).length);wins+=Number(score>=max);outrightWins+=Number(score>max);baselineWins+=Number(b.players[0].score>=Math.max(...b.players.slice(1).map(p=>p.score)));}
  const mean=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/xs.length;
  results.push({auctionType,scenario,games,meanScore:mean(scores),baselineMeanScore:mean(baseline),meanScoreGain:mean(scores)-mean(baseline),winOrTieRate:wins/games,outrightWinRate:outrightWins/games,baselineWinOrTieRate:baselineWins/games,meanMargin:mean(margins),meanRank:mean(ranks)});
  console.log(JSON.stringify(results.at(-1)));
}
const runtime=Object.fromEntries(Object.entries(timings).map(([key,xs])=>{xs.sort((a,b)=>a-b);return [key,{calls:xs.length,meanMs:xs.reduce((a,b)=>a+b,0)/xs.length,p95Ms:xs[Math.floor(xs.length*.95)],p99Ms:xs[Math.floor(xs.length*.99)],maxMs:xs.at(-1)}];}));
const report={sourceSha256,generatedAt:new Date().toISOString(),dictionaryWords:dictionary.words.length,dictionaryPreparationMs,seedRange:[10001,10000+games],elapsedMs:performance.now()-begin,notes:['Offline deterministic proxy, not live-server results.','Every game has six participants, 100 starting balance and five hidden starting tiles.','External bots may repeatedly play during each open auction, never after final resolution.','Server bots play one longest word of length >=3 only after each win, including final resolution.','Baseline uses official face+2-if-unseen bids and instant longest playable word >=2.','Same initial deal/seed used for paired runs; later RNG paths can diverge as positive-bid counts change.','Ranks are score-based, shared ties; win-or-tie rates do not split ties.','Network latency, reconnects, live opponent adaptation and scheduler races are not modeled.'],results,runtime};
mkdirSync('reports',{recursive:true});const path=`reports/simulation-${games}.json`;writeFileSync(path,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({runtime,elapsedMs:report.elapsedMs,report:path}));
