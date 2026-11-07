import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {GreedyDictionary,seededRandom,type AuctionType} from './original_simulator.js';
import {game,scenario,model,original,starter,metrics,type Agent} from './arena.js';
import {prepareDictionary,ORIGINAL,type Parameters} from './parametric_strategy.js';
import {prepareDictionary as prepareOriginal} from './original_strategy.js';
const begin=performance.now();
const words=readFileSync(new URL('./wordlist.txt',import.meta.url),'utf8').split(/\r?\n/).map(x=>x.trim().toUpperCase()).filter(x=>/^[A-Z]{2,}$/.test(x)).sort((a,b)=>b.length-a.length);
const dictionary=new GreedyDictionary(words);prepareDictionary(words);prepareOriginal(words);
const keys:(keyof Parameters)[]=['face','marginal','future','shade','cash','minLength','liquidate','cap'];
const bounds=[[.5,4],[.1,1.8],[0,.8],[.25,1.1],[10,55],[4,8],[2,20],[12,55]];
const from=(x:number[])=>Object.fromEntries(keys.map((k,i)=>[k,Math.max(bounds[i][0],Math.min(bounds[i][1],x[i]))])) as unknown as Parameters;
const random=seededRandom(772211);const normal=()=>Math.sqrt(-2*Math.log(Math.max(1e-10,random())))*Math.cos(2*Math.PI*random());
const types:AuctionType[]=['Vickrey','FirstPrice'];
const trainScenarios=['server-mixed','smart-mixed','clones'];
let trainingGames=0;
function objective(p:Parameters,start:number,n:number){let sum=0;for(let i=0;i<n;i++){const s=trainScenarios[i%3],type=types[Math.floor(i/3)%2],seed=start+i;const m=metrics(game(seed,model(p),scenario(s,dictionary),dictionary,type));sum+=m.pairwise+.002*m.score;trainingGames++;}return sum/n;}
let mean=keys.map(k=>ORIGINAL[k]);let sd=[.7,.35,.2,.22,13,1.5,5,12];let candidates:{p:Parameters;objective:number}[]=[];
const generations=Number(process.env.GENERATIONS??4),population=Number(process.env.POPULATION??20),trainN=Number(process.env.TRAIN_GAMES??18),holdoutN=Number(process.env.HOLDOUT_GAMES??100);
for(let generation=0;generation<generations;generation++){
 const batch=[from(mean),ORIGINAL,...Array.from({length:population-2},()=>from(mean.map((m,j)=>m+normal()*sd[j])))].map(p=>({p,objective:objective(p,210001,trainN)})).sort((a,b)=>b.objective-a.objective);
 candidates.push(...batch.slice(0,4));const elite=batch.slice(0,Math.max(3,Math.floor(population*.25)));
 mean=keys.map(k=>elite.reduce((s,c)=>s+c.p[k],0)/elite.length);
 sd=keys.map((k,j)=>Math.max((bounds[j][1]-bounds[j][0])*.045,Math.sqrt(elite.reduce((s,c)=>s+(c.p[k]-mean[j])**2,0)/elite.length)));
 console.log(JSON.stringify({stage:'training',generation,best:batch[0],trainingGames,elapsedMs:performance.now()-begin}));
}
// Selection uses a distinct validation split. Locked before any held-out evaluation.
const unique=[...new Map(candidates.map(c=>[JSON.stringify(c.p),c.p])).values()];
const validated=unique.map(p=>({p,objective:objective(p,310001,36)})).sort((a,b)=>b.objective-a.objective);
const winner=validated[0];mkdirSync('reports',{recursive:true});writeFileSync('learned-weights.json',JSON.stringify({method:'cross-entropy black-box policy optimization',trainingSeedRange:[210001,210000+trainN],validationSeedRange:[310001,310036],objective:'mean pairwise finish score + 0.002 * game score',parameters:winner.p},null,2)+'\n');
console.log(JSON.stringify({stage:'frozen-weights',winner,trainingGames,elapsedMs:performance.now()-begin}));
const rows:any[]=[];const timings={bid:[] as number[],word:[] as number[]};const deployed=model(winner.p);const measured:Agent={name:'learned',bid:ctx=>{const s=performance.now(),out=deployed.bid(ctx);timings.bid.push(performance.now()-s);return out;},word:ctx=>{const s=performance.now(),out=deployed.word(ctx);timings.word.push(performance.now()-s);return out;}};
function meanOf(xs:number[]){return xs.reduce((a,b)=>a+b,0)/xs.length;}
for(const type of types)for(const s of ['starters','server-mixed','smart-mixed','clones']){
 const result:any={auctionType:type,opponents:s,gamesPerPolicy:holdoutN,seedRange:[410001,410000+holdoutN]};const raw:Record<string,any[]>={};
 for(const agent of [measured,original,starter(dictionary)]){const samples:ReturnType<typeof metrics>[]=[];for(let i=0;i<holdoutN;i++)samples.push(metrics(game(410001+i,agent,scenario(s,dictionary),dictionary,type)));raw[agent.name]=samples;result[agent.name]=Object.fromEntries(['score','win','pairwise','rank'].map(k=>[k,meanOf(samples.map(m=>(m as any)[k]))]));}
 const differences=raw.learned.map((m,i)=>m.score-raw['original-enhanced'][i].score),gain=meanOf(differences),se=Math.sqrt(meanOf(differences.map(x=>(x-gain)**2))/Math.max(1,holdoutN-1));result.pairedScoreGain={mean:gain,ci95:[gain-1.96*se,gain+1.96*se]};rows.push(result);console.log(JSON.stringify({stage:'held-out',...result}));
 writeFileSync(`reports/raw-${type}-${s}.json`,JSON.stringify(raw));
}
const latency=Object.fromEntries(Object.entries(timings).map(([key,xs])=>{xs.sort((a,b)=>a-b);return [key,{calls:xs.length,meanMs:meanOf(xs),p95Ms:xs[Math.floor(xs.length*.95)],p99Ms:xs[Math.floor(xs.length*.99)],maxMs:xs.at(-1)}];}));
const hashes=Object.fromEntries(['arena.ts','train.ts','parametric_strategy.ts','original_strategy.ts','wordlist.txt'].map(f=>[f,createHash('sha256').update(readFileSync(f)).digest('hex')]));
const report={generatedAt:new Date().toISOString(),dictionaryWords:words.length,method:'cross-entropy policy optimization, no LLM or network inference',trainingGames,validationCandidates:unique.length,generations,population,parameters:winner.p,heldOutSeedRange:[410001,410000+holdoutN],rows,latency,elapsedMs:performance.now()-begin,hashes,limitations:['Offline proxy; no live server or tournament evidence.','Training/validation opponents are hand-written policies, not actual competitors.','Smart variants share the same trie and word-utility design; diversity is limited.','Final game tick, tie handling, cash rewards and legal words match inspected source semantics.','Separate indexed streams keep paired deals, jitter and tie priorities equal.','No network delay, callback races, scheduler contention or adaptive opponent learning.','Mean-score intervals are paired normal approximations, not a guarantee.']};writeFileSync('reports/learning-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({stage:'done',latency,elapsedMs:report.elapsedMs}));
