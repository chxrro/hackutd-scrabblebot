#!/bin/bash
# usage: grid.sh <pool> <auction> <dealStart> <nDeals> <seats> <outdir>  -- shards CANDIDATES across processes
P=$1; A=$2; D=$3; N=$4; S=$5; OUT=$6; mkdir -p $OUT
ALL=$(npx tsx -e "import('./candidates.ts').then(m=>console.log(Object.keys(m.CANDIDATES).join(' ')))" 2>/dev/null)
i=0; for c in $ALL; do shard[$((i%12))]+="$c,"; i=$((i+1)); done
for j in $(seq 0 11); do s=${shard[$j]%,}; [ -z "$s" ] && continue
  npx tsx run.ts $P $A $D $N $S challenger,$s $OUT/shard$j.json > $OUT/shard$j.txt 2>/dev/null &
done; wait
