import test from 'node:test';
import assert from 'node:assert/strict';
import {decideBid,chooseWord,CHALLENGER_PARAMETERS} from '../challenger_policy.js';
import {decideBid as parametricBid,chooseWord as parametricWord} from '../parametric_strategy.js';
import {CanonicalDictionary,gameV2} from '../arena_v2.js';
import {model} from '../arena.js';
import {challengerLeague} from '../challenger_league.js';
import {rackOf,seededRandom,canSpell} from '../original_simulator.js';
const dictionary=new CanonicalDictionary(['AT','TA','TEA','ATE','EAT','TEAM','MATE','MEAT','RATE','STAR','RATS','TARS','ARTS','TEAR','TARE']);
test('exported challenger selects exactly the frozen parameters for each auction',()=>{
 const random=seededRandom(9900011),letters='AEMRST';
 for(const auctionType of ['Vickrey','FirstPrice'] as const)for(let n=0;n<300;n++){
  const ctx={letter:letters[Math.floor(random()*letters.length)],myRack:rackOf(Array.from({length:Math.floor(random()*14)},()=>letters[Math.floor(random()*letters.length)]).join('')),myBalance:Math.floor(random()*200),bagRemaining:Math.floor(random()*68),dictionary:dictionary.words,auctionType};
  assert.equal(decideBid(ctx),parametricBid(ctx,CHALLENGER_PARAMETERS[auctionType]));
  assert.equal(chooseWord(ctx),parametricWord(ctx,CHALLENGER_PARAMETERS[auctionType]));
  const bid=decideBid(ctx);assert.ok(Number.isSafeInteger(bid)&&bid>=0&&bid<=ctx.myBalance);
  if(ctx.bagRemaining===0)assert.equal(bid,0);
  const word=chooseWord(ctx);if(word!==null){assert.ok(dictionary.valid.has(word));assert.ok(canSpell(word,ctx.myRack));}
 }
});
test('exported challenger defaults omitted auction type to Vickrey',()=>{
 const ctx={letter:'T',myRack:rackOf('AERSTAM'),myBalance:100,bagRemaining:40,dictionary:dictionary.words};
 assert.equal(decideBid(ctx),decideBid({...ctx,auctionType:'Vickrey'}));assert.equal(chooseWord(ctx),chooseWord({...ctx,auctionType:'Vickrey'}));
});
test('drop-in challenger and evaluated model produce identical complete game traces',()=>{
 for(const auctionType of ['Vickrey','FirstPrice'] as const){
  const options={seed:9900012,seat:2,dictionary,auctionType,trace:true,opponents:challengerLeague('final','balanced',dictionary)};
  const exported=gameV2({...options,focus:()=>({name:'challenger',bid:decideBid,word:chooseWord})});
  const evaluated=gameV2({...options,focus:()=>model(CHALLENGER_PARAMETERS[auctionType],'challenger')});
  assert.deepEqual(exported,evaluated);
 }
});
