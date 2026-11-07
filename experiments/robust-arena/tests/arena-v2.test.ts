import test from 'node:test';
import assert from 'node:assert/strict';
import { GreedyDictionary, rackOf, reward } from '../original_simulator.js';
import { gameV2, metricsV2, resolveWithPriority, type AgentFactory } from '../arena_v2.js';
import { PortfolioSearch, league, focalFactories } from '../league.js';
const dictionary=new GreedyDictionary(['CATS','CAT','ACT','ART','RAT','TAR','AT','AA']);
const pass:AgentFactory=()=>({name:'pass',bid:()=>0,word:()=>null});
const buyer:AgentFactory=()=>({name:'buyer',bid:()=>1,word:()=>null});
const options={seed:7,focus:pass,opponents:Array(5).fill(pass),dictionary,auctionType:'Vickrey' as const,trace:true};
test('v2 deterministic including complete trace',()=>assert.deepEqual(gameV2(options),gameV2(options)));
test('all seats get identical deal and independent jitter, ties, and stress draws',()=>{
 const a=gameV2({...options,seat:0,missedWindowProbability:.2}),b=gameV2({...options,seat:5,focus:buyer,missedWindowProbability:.2});
 assert.deepEqual(a.initialRacks,b.initialRacks);assert.deepEqual(a.deal,b.deal);
 assert.deepEqual(a.events.map(e=>[e.jitter,e.tiePriority,e.active]),b.events.map(e=>[e.jitter,e.tiePriority,e.active]));
});
test('zero bids discard all tiles; callbacks exclude current tile',()=>{
 const seen:number[]=[];const out=gameV2({...options,focus:()=>({name:'recorder',bid:ctx=>{seen.push(ctx.bagRemaining);return 0;},word:()=>null}),seat:0,bag:['A','B'],initialRacks:Array(6).fill('')});
 assert.deepEqual(seen,[1,0]);assert.equal(out.discarded,2);assert.equal(out.players[0].rack.size,0);
});
test('fractional and shared wins distinguish ties correctly',()=>{const m=metricsV2(gameV2(options));assert.equal(m.serverWin,1);assert.equal(m.outrightWin,0);assert.equal(m.fractionalWin,1/6);assert.equal(m.pairwise,.5);assert.equal(m.midRank,3.5);});
test('callbacks have no hidden opponent state and observe only public payments',()=>{
 const keys:string[][]=[];gameV2({...options,focus:()=>({name:'observer',bid:()=>1,word:()=>null,observe:e=>{keys.push(Object.keys(e).sort());assert.ok(Object.isFrozen(e));}})});
 assert.deepEqual(keys[0],['bagRemaining','letter','paid','round','winner']);
});
test('one word per window and total missed windows are explicit stresses',()=>{
 const focus:AgentFactory=()=>({name:'words',bid:()=>0,word:ctx=>dictionary.longest(ctx.myRack)});
 const o={...options,focus,seat:0,bag:['Z'],initialRacks:['CATAT','','','','','']};
 assert.equal(gameV2(o).players[0].words.length,2);
 assert.equal(gameV2({...o,maxWordsPerWindow:1}).players[0].words.length,1);
 assert.equal(gameV2({...o,missedWindowProbability:1}).players[0].words.length,0);
});
test('stateful factories reset match observations',()=>{const make:AgentFactory=()=>{let count=0;return {name:'stateful',bid:()=>count++%3,word:()=>null};};assert.deepEqual(gameV2({...options,focus:make}),gameV2({...options,focus:make}));});
test('exact portfolio partition can beat longest-word reward',()=>{const d=new GreedyDictionary(['CATS','CAT','AA','AT']);const search=new PortfolioSearch(d);const value=search.value(rackOf('CATCAT'));assert.equal(value.score,10);assert.equal(value.first,'CAT');});
test('v2 legality, money and per-letter conservation across leagues and auctions',()=>{
 for(const auctionType of ['Vickrey','FirstPrice'] as const)for(const name of ['starters','server-mixed','smart-mixed','clones','frozen-mirror','frontier-mixed','portfolio-mixed']){
  const r=gameV2({...options,auctionType,focus:focalFactories(dictionary).frozen,opponents:league(name,dictionary)});
  for(let i=0;i<r.players.length;i++){const p=r.players[i];assert.equal(p.balance,100+p.score-p.spent);assert.ok(p.balance>=0);assert.equal(p.score,p.words.reduce((a,w)=>a+reward(w),0));
   const owned=rackOf(r.initialRacks[i]+r.events.filter(e=>e.winner===i).map(e=>e.letter).join(''));
   const used=rackOf(p.words.join(''));for(const [c,n] of owned)assert.equal(n,(used.get(c)??0)+(p.rack.get(c)??0));
  }
 }
});
test('reject invalid bids, words, priorities, and setup',()=>{
 assert.throws(()=>resolveWithPriority([1,1],'Vickrey',[0,0]));
 assert.throws(()=>gameV2({...options,focus:()=>({name:'bad',bid:()=>NaN,word:()=>null})}));
 assert.throws(()=>gameV2({...options,focus:()=>({name:'bad',bid:()=>0,word:()=>''})}));
 assert.throws(()=>gameV2({...options,startingRackSize:20}));
});
