#!/bin/bash

result=0
np=$1
nit=$2
for ((i=1; i<=nit; i++)); do
    temp=$(mpirun -np $np  MonteCarlopi)
    result=$(awk "BEGIN {print $result + $temp}")
done
result=$(awk "BEGIN {print $result/$nit}")
printf "$1: $result\n" >> results.txt
