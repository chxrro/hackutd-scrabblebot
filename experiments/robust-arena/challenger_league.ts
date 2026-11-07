/** Disjoint synthetic populations, fixed before training. No entrant or live data. */
import {seededRandom, type GreedyDictionary} from './original_simulator.js';
import {model} from './arena.js';
import {portfolioFactory, league} from './league.js';
import {LEARNED_PARAMETERS} from './learned_policy.js';
import type {Parameters} from './parametric_strategy.js';
import type {AgentFactory} from './arena_v2.js';
export type Split='train'|'validation'|'final';
export type Family='pressure'|'portfolio'|'balanced';
export type OpponentSpec={name:string;kind:'rack'|'portfolio';parameters?:Parameters;aggression?:number;adaptive?:boolean};
export const POPULATION_SEEDS:Record<Split,number>={train:1600001,validation:1700001,final:1800001};
export function population(split:Split,family:Family):OpponentSpec[]{
 const rng=seededRandom(POPULATION_SEEDS[split]+{pressure:101,portfolio:202,balanced:303}[family]);
 const between=(lo:number,hi:number)=>lo+rng()*(hi-lo);
 const rack=(i:number):OpponentSpec=>({name:`${split}-${family}-rack-${i}`,kind:'rack',parameters:{...LEARNED_PARAMETERS,face:between(1.6,4.8),marginal:between(.25,1.25),future:between(.12,.8),shade:between(.42,1.05),cash:between(18,48),minLength:between(5.5,8.3),liquidate:between(2,13),cap:between(22,52)}});
 const portfolio=(i:number):OpponentSpec=>({name:`${split}-${family}-portfolio-${i}`,kind:'portfolio',aggression:between(.85,1.7),adaptive:i%2===0});
 return Array.from({length:5},(_,i)=>family==='pressure'?(i<3?rack(i):portfolio(i)):family==='portfolio'?(i<4?portfolio(i):rack(i)):(i<2?rack(i):portfolio(i)));
}
export function challengerLeague(split:Split,family:string,dictionary:GreedyDictionary):AgentFactory[]{
 if(family==='frontier-mixed'||family==='frozen-mirror')return league(family,dictionary);
 if(!['pressure','portfolio','balanced'].includes(family))throw Error(`Unknown challenger league ${family}`);
 return population(split,family as Family).map(spec=>{
  if(spec.kind==='rack')return ()=>model(spec.parameters!,spec.name);
  const make=portfolioFactory(dictionary,spec.aggression!,spec.adaptive!);
  return ()=>({...make(),name:spec.name});
 });
}
