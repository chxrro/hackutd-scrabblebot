/** Counter-keyed RNG: paired candidates see identical deals, jitter and tie priorities. */
import { BAG, GreedyDictionary, rackOf, reward, canSpell, seededRandom, shuffle, simulatedBid, starterBid, type AuctionType, type Context } from './original_simulator.js';
import * as baseline from './original_strategy.js';
import * as tuned from './parametric_strategy.js';
export type Agent = {name: string; server?: boolean; bid(ctx:Context):number; word(ctx:Context):string|null};
export type Player = {name:string;balance:number;score:number;rack:Map<string,number>;spent:number;words:string[];wins:number};
export const original:Agent={name:'original-enhanced',bid:baseline.decideBid,word:baseline.chooseWord};
export function model(p:tuned.Parameters,name='learned'):Agent{return {name,bid:ctx=>tuned.decideBid(ctx,p),word:ctx=>tuned.chooseWord(ctx,p)};}
export function starter(dictionary:GreedyDictionary):Agent{return {name:'official-starter',bid:ctx=>starterBid(ctx.letter,ctx.myRack,ctx.myBalance),word:ctx=>dictionary.longest(ctx.myRack)};}
function server(name:'Cheapskate'|'ValueBidder'|'Aggressive',dictionary:GreedyDictionary):Agent{return {name,server:true,bid:()=>0,word:ctx=>dictionary.longest(ctx.myRack,3)};}
export function scenario(name:string,dictionary:GreedyDictionary):Agent[]{
 if(name==='starters')return Array.from({length:5},()=>starter(dictionary));
 if(name==='server-mixed')return ['Cheapskate','ValueBidder','Aggressive','Aggressive','ValueBidder'].map(x=>server(x as any,dictionary));
 if(name==='smart-mixed')return [original,model({...tuned.ORIGINAL,face:2.8,cap:40},'aggressive-rack-aware'),model({...tuned.ORIGINAL,face:1.2,shade:0.45,cash:30},'conservative-rack-aware'),{name:'greedy-rack-aware',bid:baseline.decideBid,word:ctx=>dictionary.longest(ctx.myRack)},model({...tuned.ORIGINAL,minLength:6,cash:35,liquidate:12},'early-cash-rack-aware')];
 if(name==='clones')return Array(5).fill(original);
 throw Error(`Unknown scenario ${name}`);
}
export function game(seed:number,focus:Agent,opponents:Agent[],dictionary:GreedyDictionary,auctionType:AuctionType):{players:Player[];focus:number;rounds:number}{
 const seat=seed%6; const agents=[...opponents];agents.splice(seat,0,focus);
 const deck=shuffle([...BAG],seededRandom(seed));
 const players=agents.map(agent=>({name:agent.name,balance:100,score:0,rack:rackOf(deck.splice(0,5).join('')),spent:0,words:[] as string[],wins:0}));
 const ctx=(p:Player,letter:string):Context=>({letter,myBalance:p.balance,myRack:new Map(p.rack),dictionary:dictionary.words,bagRemaining:deck.length,auctionType});
 const play=(p:Player,word:string)=>{if(!dictionary.valid.has(word)||!canSpell(word,p.rack))throw Error(`Invalid word ${word}`);for(const c of word){const n=p.rack.get(c)!-1;if(n)p.rack.set(c,n);else p.rack.delete(c);}const r=reward(word);p.balance+=r;p.score+=r;p.words.push(word);};
 let rounds=0;
 while(deck.length){const letter=deck.shift()!;rounds++;
  const rng=seededRandom((seed ^ Math.imul(rounds,0x9e3779b9))>>>0);
  const jitter=agents.map(()=>Math.floor(rng()*5)-2);
  const priorities=shuffle(agents.map((_,i)=>i),rng);
  const bids=agents.map((agent,i)=>{const p=players[i];if(agent.server)return simulatedBid(agent.name as any,letter,p.balance,jitter[i]);
   for(let guard=0;guard<100;guard++){const w=agent.word(ctx(p,letter));if(!w)break;play(p,w);if(guard===99)throw Error('Nontermination');}
   const bid=agent.bid(ctx(p,letter));if(!Number.isInteger(bid)||bid<0||bid>p.balance)throw Error(`Invalid bid ${bid}`);return bid;
  });
  const ranked=priorities.filter(i=>bids[i]>0).sort((a,b)=>bids[b]-bids[a]);
  if(ranked.length){const i=ranked[0];const p=players[i];const paid=auctionType==='FirstPrice'?bids[i]:ranked.length>1?bids[ranked[1]]:1;p.balance-=paid;p.spent+=paid;p.wins++;p.rack.set(letter,(p.rack.get(letter)??0)+1);if(agents[i].server){const w=agents[i].word(ctx(p,letter));if(w)play(p,w);}}
 }
 return {players,focus:seat,rounds};
}
export function metrics(result:ReturnType<typeof game>){const p=result.players[result.focus],others=result.players.filter((_,i)=>i!==result.focus);const pairwise=others.reduce((n,o)=>n+(p.score>o.score?1:p.score===o.score?.5:0),0)/5;return {score:p.score,win:Number(p.score>Math.max(...others.map(o=>o.score))),pairwise,rank:1+others.filter(o=>o.score>p.score).length};}
