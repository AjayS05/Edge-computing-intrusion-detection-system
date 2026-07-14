#!/bin/bash
# Usage: ./run_one.sh <width> <height> <nodes>
WIDTH=$1
HEIGHT=$2
NODES=$3
TIMESTAMP=$(date +%Y_%m_%d_%H:%M:%S)
OUTFILE="new_results/${WIDTH}x${HEIGHT}_${NODES}_Nodes_${TIMESTAMP}.txt"

mkdir -p results
rm -f /shared/output/lockfile /shared/output/*.png /shared/output/*.done

./task-distributor-master.sh \
    -n $NODES \
    -x $WIDTH \
    -y $HEIGHT \
    -p /shared/output \
    2>&1 | tee "$OUTFILE"

echo "Saved: $OUTFILE"