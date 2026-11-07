import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { canSpell, chooseWord, decideBid, prepareDictionary, wordReward } from '../learned_policy.js';
const rack = (letters: string) => { const r = new Map<string,number>(); for (const c of letters) r.set(c,(r.get(c)??0)+1); return r; };
const dictionary = fs.readFileSync(new URL('../wordlist.txt', import.meta.url),'utf8').split('\n').filter(Boolean);
prepareDictionary(dictionary);
test('scoring follows integer server multiplier', () => {
  assert.equal(wordReward('AT'), 2); assert.equal(wordReward('QUIZ'),33);
  assert.equal(wordReward('JAZZY'),66); assert.equal(wordReward('LETTERS'),21);
});
test('counts repeated letters and never mutates rack', () => {
  const r = rack('LETTER'); const before=[...r];
  assert.equal(canSpell('LETTERS',r),false); assert.equal(canSpell('LETTER',r),true);
  chooseWord({myRack:r,dictionary,bagRemaining:3}); assert.deepEqual([...r],before);
});
test('holds short words early, cashes out at deadline or low funds', () => {
  const small=['CAT','AT'];
  assert.equal(chooseWord({myRack:rack('CAT'),dictionary:small,myBalance:100,bagRemaining:40}),null);
  assert.equal(chooseWord({myRack:rack('CAT'),dictionary:small,myBalance:10,bagRemaining:40}),'CAT');
  assert.equal(chooseWord({myRack:rack('CAT'),dictionary:small,myBalance:100,bagRemaining:3}),'CAT');
});
test('plays seven-letter bonus without waiting', () => {
  const word=chooseWord({myRack:rack('LETTERS'),dictionary,myBalance:100,bagRemaining:45});
  assert.ok(word && word.length===7); assert.ok(canSpell(word,rack('LETTERS')));
});
test('uses reward rather than blindly longest word at liquidation', () => {
  assert.equal(chooseWord({myRack:rack('QUIZTRAIN'),dictionary:['TRAIN','QUIZ'],bagRemaining:4}),'QUIZ');
});
test('bid is integer, nonnegative and never over balance; last tile skipped', () => {
  for (const balance of [0,0.5,1,7,100]) for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const bid=decideBid({letter,myBalance:balance,myRack:rack('TARIE'),dictionary,bagRemaining:30});
    assert.ok(Number.isInteger(bid) && bid>=0 && bid<=balance);
  }
  assert.equal(decideBid({letter:'S',myBalance:100,myRack:rack('LETTER'),dictionary,bagRemaining:0}),0);
});
test('first-price bids shaded and completion letters valued', () => {
  const ctx={letter:'S',myBalance:100,myRack:rack('LETTER'),dictionary,bagRemaining:30};
  assert.ok(decideBid({...ctx,auctionType:'FirstPrice'}) <= decideBid({...ctx,auctionType:'Vickrey'}));
  assert.ok(decideBid(ctx)>decideBid({...ctx,letter:'Q'}));
});
test('dictionary search and bid fit well inside one-second auction', () => {
  const r=rack('BCDFGHJKLMNPQRSTVWXZ');
  const start=performance.now();
  const word=chooseWord({myRack:r,dictionary,bagRemaining:5});
  decideBid({letter:'E',myBalance:100,myRack:r,dictionary,bagRemaining:20});
  const elapsed=performance.now()-start;
  if(word) assert.ok(canSpell(word,r));
  assert.ok(elapsed<500, `decisions took ${elapsed.toFixed(1)} ms`);
});
