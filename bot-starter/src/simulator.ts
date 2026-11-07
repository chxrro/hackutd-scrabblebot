/** Offline rules mirror. No network, credentials, or live reducers. */
export type AuctionType = 'Vickrey' | 'FirstPrice';
export type Kind = 'enhanced' | 'starter' | 'Cheapskate' | 'ValueBidder' | 'Aggressive';
export const VALUES: Record<string, number> = Object.fromEntries('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c,i)=>[c,[1,3,3,2,1,4,2,4,1,8,5,1,3,1,1,3,10,1,1,1,1,4,4,8,4,10][i]]));
export const BAG = 'AAAAAAAAABBCCDDDDEEEEEEEEEEEEFFGGGHHIIIIIIIIIJKLLLLMMNNNNNNOOOOOOOOPPQRRRRRRSSSSTTTTTTUUUUVVWWXYYZ'.split('');
export interface Context { letter: string; myBalance: number; myRack: Map<string,number>; dictionary: string[]; bagRemaining: number; auctionType: AuctionType }
export interface Policy { decideBid(ctx: Context): number; chooseWord(ctx: Context): string | null }
export interface Player { kind: Kind; balance: number; score: number; rack: Map<string,number>; spent: number; wins: number; words: string[] }
export interface Event { round: number; letter: string; bids: number[]; winner: number | null; paid: number; bagRemaining: number }
export function seededRandom(seed: number): ()=>number { let a=seed>>>0; return ()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
export function shuffle<T>(items: T[], random: ()=>number): T[] { for(let i=items.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[items[i],items[j]]=[items[j],items[i]];} return items; }
export function rackOf(s: string): Map<string,number> { const r=new Map<string,number>(); for(const c of s)r.set(c,(r.get(c)??0)+1);return r; }
export function canSpell(word: string,rack: Map<string,number>): boolean {const used=new Map<string,number>();for(const c of word){const n=(used.get(c)??0)+1;used.set(c,n);if(n>(rack.get(c)??0))return false;}return true;}
export function reward(word:string):number { return Math.floor([...word].reduce((s,c)=>s+VALUES[c],0)*(word.length<=3?1:word.length===4?1.5:word.length===5?2:word.length===6?2.5:3)); }
interface Trie { children: Map<string,Trie>; word?:string; order?: number }
export class GreedyDictionary {
  root:Trie={children:new Map()}; valid:Set<string>;
  constructor(public words:string[]){this.valid=new Set(words);words.forEach((word,order)=>{let n=this.root;for(const c of word){let child=n.children.get(c);if(!child){child={children:new Map()};n.children.set(c,child);}n=child;}n.word=word;n.order=order;});}
  longest(rack:Map<string,number>,min=2):string|null {let best:string|null=null,order=Infinity;const left=new Map(rack);const visit=(n:Trie)=>{if(n.word&&n.word.length>=min&&(!best||n.word.length>best.length||(n.word.length===best.length&&n.order!<order))){best=n.word;order=n.order!;}for(const [c,child] of n.children){const count=left.get(c)??0;if(count){left.set(c,count-1);visit(child);left.set(c,count);}}};visit(this.root);return best;}
}
export function starterBid(letter:string,rack:Map<string,number>,balance:number):number {return Math.min(balance,VALUES[letter]+((rack.get(letter)??0)===0?2:0));}
export function simulatedBid(kind:Kind,letter:string,balance:number,jitter:number):number {const base=VALUES[letter]+(kind==='Cheapskate'?-1:kind==='Aggressive'?('AEIOU'.includes(letter)?4:2):0);return Math.max(0,Math.min(balance,Math.max(1,base+jitter)));}
export function resolveBids(bids:number[],type:AuctionType,random:()=>number):{winner:number|null,paid:number} {const order=shuffle(bids.map((amount,id)=>({amount,id})).filter(x=>x.amount>0),random).sort((a,b)=>b.amount-a.amount);return {winner:order[0]?.id??null,paid:!order.length?0:type==='FirstPrice'?order[0].amount:(order[1]?.amount??1)};}
export interface Options { seed:number; kinds:Kind[]; dictionary:GreedyDictionary; policy:Policy; auctionType?:AuctionType; bag?:string[]; initialRacks?:string[]; startingRackSize?:number; trace?:boolean }
export function simulate(options:Options):{players:Player[];events:Event[];rounds:number} {
  const {dictionary,policy}=options;const auctionType=options.auctionType??'Vickrey';const random=seededRandom(options.seed);const bag=options.bag?[...options.bag]:shuffle([...BAG],random);
  const players:Player[]=options.kinds.map((kind,i)=>({kind,balance:100,score:0,rack:options.initialRacks?rackOf(options.initialRacks[i]??''):rackOf(bag.splice(0,options.startingRackSize??5).join('')),spent:0,wins:0,words:[]}));
  const events:Event[]=[];let rounds=0;
  function context(p:Player,letter:string):Context{return {letter,myBalance:p.balance,myRack:new Map(p.rack),dictionary:dictionary.words,bagRemaining:bag.length,auctionType};}
  function play(p:Player,word:string):void {if(!dictionary.valid.has(word)||!canSpell(word,p.rack))throw new Error(`Illegal ${p.kind} play ${word}`);for(const c of word){const n=p.rack.get(c)!-1;if(n)p.rack.set(c,n);else p.rack.delete(c);}const value=reward(word);p.balance+=value;p.score+=value;p.words.push(word);}
  while(bag.length){const letter=bag.shift()!;rounds++;
    // Simulated bids are inserted inside the reducer that opens the auction.
    const bids=players.map(p=>p.kind==='starter'||p.kind==='enhanced'?0:simulatedBid(p.kind,letter,p.balance,Math.floor(random()*5)-2));
    players.forEach((p,i)=>{if(p.kind!=='starter'&&p.kind!=='enhanced')return;let guard=100;while(guard--){const word=p.kind==='starter'?dictionary.longest(p.rack):policy.chooseWord(context(p,letter));if(!word)break;play(p,word);}if(guard<0)throw new Error('Nonterminating policy');const bid=p.kind==='starter'?starterBid(letter,p.rack,p.balance):policy.decideBid(context(p,letter));if(!Number.isFinite(bid)||bid<0||bid>p.balance||!Number.isInteger(bid))throw new Error(`Illegal bid ${bid}`);bids[i]=bid;});
    const result=resolveBids(bids,auctionType,random);
    if(result.winner!==null){const p=players[result.winner];p.balance-=result.paid;p.spent+=result.paid;p.wins++;p.rack.set(letter,(p.rack.get(letter)??0)+1);if(p.kind!=='starter'&&p.kind!=='enhanced'){const word=dictionary.longest(p.rack,3);if(word)play(p,word);}}
    if(options.trace)events.push({round:rounds,letter,bids,...result,bagRemaining:bag.length});
    // If this exhausted the bag the match ends in the same transaction.
  }
  return {players,events,rounds};
}
