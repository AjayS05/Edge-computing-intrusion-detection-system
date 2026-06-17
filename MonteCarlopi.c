#include <mpi.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

int main(int argc, char * argv[]){
    MPI_Init(&argc, &argv);
    int rank, size;
    double start, end;
    MPI_Comm_rank(MPI_COMM_WORLD, &rank);
    MPI_Comm_size(MPI_COMM_WORLD, &size);

    MPI_Barrier(MPI_COMM_WORLD);
    if(rank == 0){
        start = MPI_Wtime();
    }
    long long N = 20000000;
    long long local_N = N/size;
    long long count = 0;
    long long global_count;

    srand(time(NULL) + rank);
    for(long long i=0; i<local_N; i++){
        double x = (double)rand()/RAND_MAX;
        double y = (double)rand()/RAND_MAX;
        if(x*x+y*y<=1.0){
            count++;
        }
    }
    MPI_Reduce(&count, &global_count, 1, MPI_LONG_LONG, MPI_SUM, 0, MPI_COMM_WORLD);
    if(rank==0){
        double pi = 4.0 * (double)global_count / (double)N;
        end = MPI_Wtime();
        printf("%f\n", size, end-start);
    }
    MPI_Finalize();
    return 0;
}