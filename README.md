# Estimation of pi with the Monte Carlo using OpenMPI

## Description

This project consists of estimating the value of pi with the Monte Carlo method.

The goal is to parallelize the task within a cluster of worker nodes.

Each node generate an equal number of points in the square of size 1, and counts the number of points that is inside the unity circle. The results are finally gathered to obtain the estimation of pi

---

## The principle of the Monte Carlo method

Here is work this method works :

We generate random points inside the square \([0,1] \times [0,1]\).

We verify if a point \((x, y)\) belongs to the circle of radius 1 :

x² + y² ≤ 1

The value of pi is then estimated by :

pi ≈ 4 × (points inside the circle / total number of points)

---

## Parallelization with MPI

The program follows the master/worker architecture :

- **Master node**
  - gathers the results from the workers
  - estimates the value of pi

- **Worker nodes**
  - executes a part of the Monte Carlo simulation
  - sends its results to the Master node

---

## Compilation and execution

The project requires the installation of MPI(e.g, OpenMPI).

-Compilation: mpicc -o MonteCarlopi MonteCarlopi.c
-Execution: mpirun -np 6 MonteCarlopi