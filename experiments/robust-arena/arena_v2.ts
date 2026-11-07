/** Deterministic offline arena. Every source of exogenous randomness has its own stream. */
import { BAG, GreedyDictionary, rackOf, reward, canSpell, seededRandom, shuffle, simulatedBid, type AuctionType, type Context } from './original_simulator.js';
import type { Agent } from './arena.js';

export class CanonicalDictionary extends GreedyDictionary {
 constructor(words:string[]){super([...new Set(words.map(w=>w.trim().toUpperCase()).filter(w=>/^[A-Z]{2,}$/.test(w)))].sort((a,b)=>b.length-a.length||(a<b?-1:a>b?1:0)));}
}

export type PublicResult = {round:number;letter:string;winner:number|null;paid:number;bagRemaining:number};
export type StatefulAgent = Agent & { observe?(result:Readonly<PublicResult>):void };
export type AgentFactory = () => StatefulAgent;
export type PlayerV2 = {name:string;balance:number;score:number;rack:Map<string,number>;spent:number;words:string[];wins:number;missedWindows:number};
export type EventV2 = PublicResult & {bids:number[];tiePriority:number[];jitter:number[];active:boolean[];words:string[][]};
export type GameOptions = {
 seed:number;focus:AgentFactory;opponents:AgentFactory[];dictionary:GreedyDictionary;auctionType:AuctionType;
 seat?:number;startingRackSize?:number;bag?:string[];initialRacks?:string[];trace?:boolean;
 /** Synthetic stress, not a latency model: independent missed external action windows. */
 missedWindowProbability?:number;
 /** Synthetic callback budget: e.g. 1 models one word reducer per window. */
 maxWordsPerWindow?:number;
};
export type GameResultV2 = {players:PlayerV2[];focus:number;rounds:number;events:EventV2[];initialRacks:string[];deal:string[];discarded:number};

/** Domain separation prevents a new policy's random usage from changing dealt tiles or ties. */
export function keyedRandom(seed:number,domain:number,round=0,seat=0):()=>number {
 let n=(seed ^ Math.imul(domain,0x9e3779b9) ^ Math.imul(round,0x85ebca6b) ^ Math.imul(seat,0xc2b2ae35))>>>0;
 n=Math.imul(n^(n>>>16),0x7feb352d)>>>0;n=Math.imul(n^(n>>>15),0x846ca68b)>>>0;
 return seededRandom(n^(n>>>16));
}
export function resolveWithPriority(bids:number[],auctionType:AuctionType,priority:number[]):{winner:number|null;paid:number} {
 if(priority.length!==bids.length||new Set(priority).size!==bids.length||priority.some(i=>!Number.isInteger(i)||i<0||i>=bids.length))throw Error('Invalid tie priority');
 if(bids.some(b=>!Number.isSafeInteger(b)||b<0))throw Error('Invalid bid');
 const ranked=priority.filter(i=>bids[i]>0).sort((a,b)=>bids[b]-bids[a]);
 return {winner:ranked[0]??null,paid:ranked.length?(auctionType==='FirstPrice'?bids[ranked[0]]:ranked.length>1?bids[ranked[1]]:1):0};
}
export function gameV2(options:GameOptions):GameResultV2 {
 const {dictionary,auctionType,seed}=options;
 const count=options.opponents.length+1,seat=options.seat??((seed%count+count)%count);
 if(!Number.isInteger(seat)||seat<0||seat>=count)throw Error('Invalid focal seat');
 const rackSize=options.startingRackSize??5,maxWords=options.maxWordsPerWindow??100,miss=options.missedWindowProbability??0;
 if(!Number.isInteger(rackSize)||rackSize<0||rackSize>20)throw Error('Invalid starting rack size');
 if(!Number.isInteger(maxWords)||maxWords<0||maxWords>100||!(miss>=0&&miss<=1))throw Error('Invalid stress settings');
 if(options.initialRacks&&options.initialRacks.length!==count)throw Error('One initial rack is required per seat');
 const factories=[...options.opponents];factories.splice(seat,0,options.focus);
 const agents=factories.map(factory=>factory());
 const deck=options.bag?[...options.bag]:shuffle([...BAG],keyedRandom(seed,1));
 if(!options.initialRacks&&deck.length<=count*rackSize)throw Error('Starting racks must leave at least one auction tile');
 if(deck.some(c=>!/^[A-Z]$/.test(c)))throw Error('Invalid bag');
 const initialRacks=agents.map((_,i)=>options.initialRacks?.[i]??deck.splice(0,rackSize).join(''));
 if(initialRacks.some(s=>!/^[A-Z]*$/.test(s)))throw Error('Invalid initial rack');
 const deal=[...deck];
 const players=agents.map((agent,i)=>({name:agent.name,balance:100,score:0,rack:rackOf(initialRacks[i]),spent:0,words:[] as string[],wins:0,missedWindows:0}));
 const ctx=(p:PlayerV2,letter:string):Context=>({letter,myBalance:p.balance,myRack:new Map(p.rack),dictionary:dictionary.words,bagRemaining:deck.length,auctionType});
 const play=(p:PlayerV2,word:string)=>{
  if(!/^[A-Z]{2,}$/.test(word)||!dictionary.valid.has(word)||!canSpell(word,p.rack))throw Error(`Invalid ${p.name} word ${word}`);
  for(const c of word){const n=p.rack.get(c)!-1;if(n)p.rack.set(c,n);else p.rack.delete(c);}
  const value=reward(word);p.balance+=value;p.score+=value;p.words.push(word);
 };
 let rounds=0,discarded=0;const events:EventV2[]=[];
 while(deck.length){
  const letter=deck.shift()!;rounds++;
  const jitter=agents.map((_,i)=>Math.floor(keyedRandom(seed,2,rounds,i)()*5)-2);
  const tiePriority=shuffle(agents.map((_,i)=>i),keyedRandom(seed,3,rounds));
  const active=agents.map((a,i)=>!!a.server||keyedRandom(seed,4,rounds,i)()>=miss);
  const wordsBefore=players.map(p=>p.words.length);
  const bids=agents.map((agent,i)=>{
   const p=players[i];if(agent.server)return simulatedBid(agent.name as any,letter,p.balance,jitter[i]);
   if(!active[i]){p.missedWindows++;return 0;}
   for(let n=0;n<maxWords;n++){const word=agent.word(ctx(p,letter));if(word===null)break;play(p,word);}
   const bid=agent.bid(ctx(p,letter));if(!Number.isSafeInteger(bid)||bid<0||bid>p.balance)throw Error(`Invalid ${agent.name} bid ${bid}`);
   return bid;
  });
  const outcome=resolveWithPriority(bids,auctionType,tiePriority);
  if(outcome.winner!==null){
   const i=outcome.winner,p=players[i];p.balance-=outcome.paid;p.spent+=outcome.paid;p.wins++;p.rack.set(letter,(p.rack.get(letter)??0)+1);
   if(agents[i].server){const word=agents[i].word(ctx(p,letter));if(word!==null)play(p,word);}
  }else discarded++;
  const publicResult:PublicResult={round:rounds,letter,...outcome,bagRemaining:deck.length};
  // Only published result fields are observable. No losing bids, hidden rack, or winning bid leak.
  for(const a of agents)a.observe?.(Object.freeze({...publicResult}));
  if(options.trace)events.push({...publicResult,bids,tiePriority,jitter,active,words:players.map((p,i)=>p.words.slice(wordsBefore[i]))});
 }
 return {players,focus:seat,rounds,events,initialRacks,deal,discarded};
}
export function metricsV2(result:GameResultV2){
 const p=result.players[result.focus],others=result.players.filter((_,i)=>i!==result.focus),max=Math.max(...result.players.map(o=>o.score));
 const higher=others.filter(o=>o.score>p.score).length,tied=others.filter(o=>o.score===p.score).length;
 return {score:p.score,serverWin:Number(p.score===max),outrightWin:Number(p.score>Math.max(...others.map(o=>o.score))),fractionalWin:p.score===max?1/(1+tied):0,
  pairwise:others.length?others.reduce((n,o)=>n+(p.score>o.score?1:p.score===o.score?.5:0),0)/others.length:1,
  rank:1+higher,midRank:1+higher+tied/2,spent:p.spent,balance:p.balance,leftoverTiles:[...p.rack.values()].reduce((a,b)=>a+b,0),words:p.words.length,auctionsWon:p.wins,missedWindows:p.missedWindows};
}
