


import socket
import subprocess
import pickle
import time
import json
import os



MASTER_IP = "192.168.50.1"

WORKERS = [
    ("rpi3-01",0),
    ("rpi3-01",1),
    ("rpi3-01",2),
    ("rpi3-01",3),

    ("rpi3-02",0),
    ("rpi3-02",1),
    ("rpi3-02",2),
    ("rpi3-02",3),

    ("rpi3-03",0),
    ("rpi3-03",1),
    ("rpi3-03",2),
    ("rpi3-03",3),

    ("rpi3-04",0),
    ("rpi3-04",1),
    ("rpi3-04",2),
    ("rpi3-04",3),

    ("rpi3-05",0),
    ("rpi3-05",1),
    ("rpi3-05",2),
    ("rpi3-05",3),

    ("rpi3-06",0),
    ("rpi3-06",1),
    ("rpi3-06",2),
    ("rpi3-06",3),

    ("rpi3-07",0),
    ("rpi3-07",1),
    ("rpi3-07",2),
    ("rpi3-07",3),

    ("rpi3-08",0),
    ("rpi3-08",1),
    ("rpi3-08",2),
    ("rpi3-08",3),
]


WORKER_COUNTS=[
    1,
    2,
    4,
    8,
    16,
    32
]


POINTS=[
    1_000_000,
    10_000_000,
    50_000_000,
    100_000_000
]


PORT=6000


RESULT_DIR="results"

os.makedirs(
    RESULT_DIR,
    exist_ok=True
)



def receive_results(server,count):

    results=[]

    for _ in range(count):

        conn,_ = server.accept()

        data=b""

        while True:

            chunk=conn.recv(4096)

            if not chunk:
                break

            data+=chunk


        results.append(
            pickle.loads(data)
        )

        conn.close()


    return results



def run_job(worker_count,total_points):


    points_per_worker = total_points // worker_count


    server = socket.socket(
      socket.AF_INET,
      socket.SOCK_STREAM
    )

    server.setsockopt(
      socket.SOL_SOCKET,
      socket.SO_REUSEADDR,
      1
    )

    server.bind(
        ("0.0.0.0",PORT)
    )

    server.listen(worker_count)



    start=time.perf_counter()



    for idx in range(worker_count):

        host,core = WORKERS[idx]


        cmd=f"""
        ssh pi3@{host} \
        "taskset -c {core} \
        python3 /shared/non-mpi-method/mc_worker.py \
        {MASTER_IP} {PORT} {points_per_worker}"
        """


        subprocess.Popen(
            cmd,
            shell=True
        )



    results=receive_results(
        server,
        worker_count
    )


    wall=time.perf_counter()-start


    server.close()



    return wall



def amdahl_fraction(speedup,n):

    if n == 1:
        return 1.0

    return (
        1-(1/speedup)
    )/(1-(1/n))



def amdahl_speedup(p,n):

    if n == 1:
        return 1.0

    return 1 / ((1-p)+(p/n))



def gustafson_speedup(p,n):

    if n == 1:
        return 1.0

    return n-(1-p)*(n-1)




all_results=[]



for points in POINTS:


    print(
        f"\nPoints: {points:,}"
    )


    serial_time=run_job(
        1,
        points
    )


    for n in WORKER_COUNTS:


        print(
            f"Workers {n}"
        )


        times=[]


        for trial in range(1):

            t=run_job(
                n,
                points
            )

            times.append(t)


        wall=sum(times)/len(times)


        speedup=serial_time/wall


        efficiency=speedup/n


        p=amdahl_fraction(
            speedup,
            n
        )


        result={

            "points":points,

            "workers":n,

            "serial_time":serial_time,

            "wall_time":wall,

            "speedup":speedup,

            "efficiency":efficiency,

            "parallel_fraction":p,

            "amdahl_speedup":amdahl_speedup(p,n),

            "gustafson_speedup":gustafson_speedup(p,n)

        }


        all_results.append(result)



with open(
    f"{RESULT_DIR}/results.json",
    "w"
) as f:

    json.dump(
        all_results,
        f,
        indent=4
    )


print("Finished")