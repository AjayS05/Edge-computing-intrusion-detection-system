#include <mpi.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#define N 1000  

int main(int argc, char **argv){

    int rank, size;
    double start, end;
    MPI_Init(&argc, &argv);
    MPI_Comm_rank(MPI_COMM_WORLD, &rank);
    MPI_Comm_size(MPI_COMM_WORLD, &size);

    if(argc>0){
        sscanf(argv[1], "%d", &N);
    }

    int rows_per_proc = N / size;

    int *A = NULL;
    int *B = malloc(N * N * sizeof(int));
    int *C = NULL;

    int *local_A = malloc(rows_per_proc * N * sizeof(int));
    int *local_C = malloc(rows_per_proc * N * sizeof(int));

    // Root init matrices
    if(rank == 0){
        start = MPI_Wtime();
        A = malloc(N * N * sizeof(int));
        C = malloc(N * N * sizeof(int));

        srand(0);

        for(int i = 0; i < N; i++){
            for(int j = 0; j < N; j++){
                A[i*N + j] = rand() % 10;
                B[i*N + j] = rand() % 10;
            }
        }
    }

    // Broadcast B to everyone
    MPI_Bcast(B, N*N, MPI_INT, 0, MPI_COMM_WORLD);

    // Scatter A by rows
    MPI_Scatter(A, rows_per_proc * N, MPI_INT,
                local_A, rows_per_proc * N, MPI_INT,
                0, MPI_COMM_WORLD);

    // Local multiplication
    for(int i = 0; i < rows_per_proc; i++){
        for(int j = 0; j < N; j++){
            local_C[i*N + j] = 0;
            for(int k = 0; k < N; k++){
                local_C[i*N + j] += local_A[i*N + k] * B[k*N + j];
            }
        }
    }

    // Gather results
    MPI_Gather(local_C, rows_per_proc * N, MPI_INT,
               C, rows_per_proc * N, MPI_INT,
               0, MPI_COMM_WORLD);

    free(local_A);
    free(local_C);
    free(B);

    if(rank == 0){
        free(A);
        free(C);
        end = MPI_Wtime();
        printf("%f\n", end-start);
    }

    MPI_Finalize();
    return 0;
}