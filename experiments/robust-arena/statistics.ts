import { seededRandom } from './original_simulator.js';
export const mean=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/xs.length;
export function clusterInterval(valuesByDeal:number[],seed=81231,repetitions=5000):{mean:number;ci95:[number,number];independentDeals:number}{
 if(!valuesByDeal.length)throw Error('At least one deal is required');
 const rng=seededRandom(seed),samples:number[]=[];
 for(let n=0;n<repetitions;n++){let sum=0;for(let j=0;j<valuesByDeal.length;j++)sum+=valuesByDeal[Math.floor(rng()*valuesByDeal.length)];samples.push(sum/valuesByDeal.length);}
 samples.sort((a,b)=>a-b);
 return {mean:mean(valuesByDeal),ci95:[samples[Math.floor(repetitions*.025)],samples[Math.min(repetitions-1,Math.floor(repetitions*.975))]],independentDeals:valuesByDeal.length};
}
