import test from 'node:test';
import assert from 'node:assert/strict';
import {population,challengerLeague,type Split,type Family} from '../challenger_league.js';
import {CanonicalDictionary,gameV2} from '../arena_v2.js';
import {model} from '../arena.js';
import {LEARNED_PARAMETERS} from '../learned_policy.js';
const dictionary=new CanonicalDictionary(['AT','TA','TEA','ATE','EAT','TEAM','MATE','MEAT','RATE','STAR','RATS','TARS','ARTS','TEAR','TARE']);
test('challenger populations are deterministic and split-disjoint by complete profile',()=>{
 const profiles:string[]=[];
 for(const split of ['train','validation','final'] as Split[])for(const family of ['pressure','portfolio','balanced'] as Family[]){
  assert.deepEqual(population(split,family),population(split,family));
  for(const {name,...profile} of population(split,family))profiles.push(JSON.stringify(profile));
 }
 assert.equal(profiles.length,45);assert.equal(new Set(profiles).size,45);
});
test('challenger league factories reset all adaptive state between games',()=>{
 const options={seed:9900001,seat:0,focus:()=>model(LEARNED_PARAMETERS),opponents:challengerLeague('train','balanced',dictionary),dictionary,auctionType:'FirstPrice' as const,trace:true};
 const first=gameV2(options);gameV2({...options,seed:9900002});assert.deepEqual(gameV2(options),first);
});
test('challenger populations reject unknown league names',()=>assert.throws(()=>challengerLeague('train','missing',dictionary)));
