# Estimation of pi with the Monte Carlo using OpenMPI

## Description

This example consists of estimating the value of pi with the Monte Carlo method.

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

# Matrix Multiplication using OpenMPI

## Description

This second example consists of computing the product of two matrices A and B.

The goal is to parallelize the computation and store the result into a matrix C.

Each node receives a row of A and allocates memory for a same matrix B containing only ones.

---

## Matrix product (row × matrix interpretation)

The entry \( C_{ij} \) of the matrix \( C = A \times B \) is:

\[
C_{ij} = \sum_{k=0}^{n-1} a_{ik} \, b_{kj}
\]

---

## Row of C as a product of a row of A with B

The \( i \)-th row of \( C \) is:

\[
C_{i,*} = A_{i,*} \times B
\]

---

## Dot product interpretation

Each element of the row is a dot product:

\[
C_{ij} =
\begin{bmatrix}
a_{i0} & a_{i1} & \dots & a_{i,n-1}
\end{bmatrix}
\cdot
\begin{bmatrix}
b_{0j} \\
b_{1j} \\
\vdots \\
b_{n-1,j}
\end{bmatrix}
\]

---

## Summary

A row of \( C \) = a row of \( A \) multiplied by the matrix \( B \)

## Parallelization with MPI

The program follows the master/worker architecture :

- **Master node**
  - Allocates the memory for A and C, sends each row to a corresponding worker.

- **Worker nodes**
  - Allocates the memory for a matrix B(containing only ones), compute their local row.


## Compilation and execution

The project requires the installation of MPI(e.g, OpenMPI).

-Compilation: mpicc -o MatrixMulti MatrixMulti.c
-Execution: mpirun -np 6 MatrixMulti