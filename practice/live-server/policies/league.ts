/** Frozen heterogeneous league. Stateful policies are constructed fresh for every game. */
import { GreedyDictionary, reward, type Context } from './original_simulator.js';
import { scenario, original, starter, model } from './arena.js';
import { LEARNED_PARAMETERS } from './learned_policy.js';
import type { AgentFactory, PublicResult } from './arena_v2.js';

// Independent architecture: exact partition of the CURRENT rack into legal words,
// not the enhanced policy's best-word / one-missing-letter feature search.
export class PortfolioSearch {
 private cache=new Map<string,{score:number;first:string|null}>();
 constructor(private dictionary:GreedyDictionary){}
 value(rack:Map<string,number>):{score:number;first:string|null}{
  const key=[...rack].filter(([,n])=>n>0).sort(([a],[b])=>a<b?-1:1).map(([c,n])=>c.repeat(n)).join('');
  const found=this.cache.get(key);if(found)return found;
  // Exact for ordinary racks. Cap above 16 tiles bounds pathological admin-rack searches.
  if(key.length>16){const word=this.dictionary.longest(rack);return {score:word?reward(word):0,first:word};}
  const counts=new Map(rack);const words:string[]=[];
  const visit=(node:typeof this.dictionary.root)=>{if(node.word&&node.word.length>=2)words.push(node.word);for(const [c,child] of node.children){const n=counts.get(c)??0;if(n>0){counts.set(c,n-1);visit(child);counts.set(c,n);}}};
  visit(this.dictionary.root);
  let best={score:0,first:null as string|null};
  for(const word of words){const left=new Map(rack);for(const c of word)left.set(c,(left.get(c)??0)-1);const value=reward(word)+this.value(left).score;if(value>best.score||(value===best.score&&word.length>(best.first?.length??0)))best={score:value,first:word};}
  if(this.cache.size>=4096)this.cache.delete(this.cache.keys().next().value!);this.cache.set(key,best);return best;
 }
}
export function portfolioFactory(dictionary:GreedyDictionary,aggression=1,adaptive=false):AgentFactory {
 const search=new PortfolioSearch(dictionary); // Immutable results cached across games, no learned match state.
 return ()=>{
  const market=new Map<string,number[]>();
  return {
   name:adaptive?'market-portfolio':`portfolio-${aggression}`,
   word:(ctx:Context)=>{
    const best=search.value(ctx.myRack),n=[...ctx.myRack.values()].reduce((a,b)=>a+b,0);
    return ctx.bagRemaining<=3||ctx.myBalance<35||n>=9||(best.first?.length??0)>=6?best.first:null;
   },
   bid:(ctx:Context)=>{
    if(!ctx.bagRemaining||!ctx.myBalance)return 0;
    const before=search.value(ctx.myRack).score,after=new Map(ctx.myRack);after.set(ctx.letter,(after.get(ctx.letter)??0)+1);
    const marginal=Math.max(0,search.value(after).score-before),have=ctx.myRack.get(ctx.letter)??0;
    const base=('AEINORST'.includes(ctx.letter)?5:2)-have*2;
    let utility=Math.max(0,base+marginal*.85)*aggression;
    if(ctx.bagRemaining<=3)utility=marginal*.9;
    if(ctx.auctionType==='FirstPrice'){
     utility*=.7;
     const samples=market.get(ctx.letter);
     if(adaptive&&samples?.length){const sorted=[...samples].sort((a,b)=>a-b);utility=Math.min(utility,sorted[Math.floor((sorted.length-1)*.75)]+1);}
    }
    return Math.max(0,Math.min(ctx.myBalance,ctx.bagRemaining<=5?ctx.myBalance:Math.floor(ctx.myBalance*.35),Math.round(utility)));
   },
   observe:(e:Readonly<PublicResult>)=>{if(adaptive&&e.winner!==null){const xs=market.get(e.letter)??[];xs.push(e.paid);market.set(e.letter,xs);}},
  };
 };
}
const frozen=()=>model(LEARNED_PARAMETERS,'frozen-learned');
export const focalFactories=(dictionary:GreedyDictionary):Record<string,AgentFactory>=>({frozen,original:()=>original,portfolio:portfolioFactory(dictionary)});
export function league(name:string,dictionary:GreedyDictionary):AgentFactory[]{
 if(['starters','server-mixed','smart-mixed','clones'].includes(name))return scenario(name,dictionary).map(a=>()=>a);
 if(name==='frozen-mirror')return Array.from({length:5},()=>frozen);
 if(name==='frontier-mixed')return [frozen,()=>model({...LEARNED_PARAMETERS,face:3.4,cap:50,shade:1},'high-pressure'),()=>model({...LEARNED_PARAMETERS,face:.8,shade:.38,cash:20},'low-price'),portfolioFactory(dictionary,1.25),portfolioFactory(dictionary,1,true)];
 if(name==='portfolio-mixed')return [portfolioFactory(dictionary,.7),portfolioFactory(dictionary,1),portfolioFactory(dictionary,1.4),portfolioFactory(dictionary,1,true),frozen];
 throw Error(`Unknown league ${name}`);
}
