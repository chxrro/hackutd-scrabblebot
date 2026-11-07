import test from 'node:test';
import assert from 'node:assert/strict';
import {clusterInterval} from '../statistics.js';
import {gameV2,metricsV2,CanonicalDictionary} from '../arena_v2.js';
import {league,focalFactories} from '../league.js';
test('cluster bootstrap deterministic and exact on constant deal differences',()=>{assert.deepEqual(clusterInterval([3,3,3]),{mean:3,ci95:[3,3],independentDeals:3});assert.deepEqual(clusterInterval([1,2,5]),clusterInterval([1,2,5]));});
test('six seats against identical policies give exact symmetric fractional and pairwise wins',()=>{
 const dictionary=new CanonicalDictionary(['AT','CAT','AA','TAR','ART','RAT']);
 const samples=Array.from({length:6},(_,seat)=>metricsV2(gameV2({seed:991,seat,focus:focalFactories(dictionary).frozen,opponents:league('frozen-mirror',dictionary),dictionary,auctionType:'Vickrey'})));
 assert.ok(Math.abs(samples.reduce((a,b)=>a+b.fractionalWin,0)-1)<1e-10);assert.ok(Math.abs(samples.reduce((a,b)=>a+b.pairwise,0)/6-.5)<1e-10);
});
