import json
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

JSON_FILE = "benchmark_results.json"

with open(JSON_FILE) as f:
    data = json.load(f)

df = pd.DataFrame(data)

summary = (
    df.groupby(["width", "height", "pixels", "workers"])
      .agg(
          wall_mean    =("wall_time_seconds",     "mean"),
          parallel_mean=("parallel_time_seconds", "mean"),
          seq1_mean    =("seq1_time_seconds",     "mean"),
          seq2_mean    =("seq2_time_seconds",     "mean"),
      )
      .reset_index()
)

resolutions = (
    summary[["width","height","pixels"]]
    .drop_duplicates()
    .sort_values("pixels")
)

ncols  = len(resolutions)
PURPLE = '#4B0082'
n_runs = int(df.run.max())

fig, axes = plt.subplots(2, ncols, figsize=(3.5*ncols, 8))
fig.patch.set_facecolor(PURPLE)
fig.suptitle(
    "POV-Ray Task Distributor — Non-MPI Cluster\n"
    "Amdahl's & Gustafson's Law — Raspberry Pi Cluster",
    color='white', fontsize=11, fontweight='bold', y=0.99
)

for col, (_, res) in enumerate(resolutions.iterrows()):
    w, h = int(res.width), int(res.height)
    subset = (
        summary[(summary.width==w) & (summary.height==h)]
        .sort_values("workers")
    )

    workers   = subset["workers"].tolist()
    par_times = subset["parallel_mean"].tolist()
    seq1_times= subset["seq1_mean"].tolist()
    seq2_times= subset["seq2_mean"].tolist()
    wall_times= subset["wall_mean"].tolist()

    x_pos = np.arange(len(workers))

    # Speedup relative to N=1 distributed wall time (matching professor)
    T1 = wall_times[0]
    speedups = [round(T1/t, 2) for t in wall_times]

    # ── Top: 3-color stacked bar (professor style) ──
    ax_w = axes[0][col]
    b1 = ax_w.bar(x_pos, seq1_times, color='#CC2222', edgecolor='#333333',
                  linewidth=0.5, width=0.65, label='1st seq. part')
    b2 = ax_w.bar(x_pos, seq2_times, bottom=seq1_times,
                  color='#CC8800', edgecolor='#333333',
                  linewidth=0.5, width=0.65, label='2nd seq. part')
    b3 = ax_w.bar(x_pos, par_times,
                  bottom=[s1+s2 for s1,s2 in zip(seq1_times, seq2_times)],
                  color='#33AA33', edgecolor='#333333',
                  linewidth=0.5, width=0.65, label='Par. part')

    ax_w.set_xticks(x_pos)
    ax_w.set_xticklabels(workers, fontsize=6)
    ax_w.tick_params(axis='y', labelsize=6)
    ax_w.set_ylabel('Runtime [s]', fontsize=7)
    ax_w.set_xlabel('Nodes [#]', fontsize=6)
    ax_w.set_title(f'{w}×{h}', fontsize=8, pad=3)
    ax_w.set_facecolor('white')
    ax_w.spines['top'].set_visible(False)
    ax_w.spines['right'].set_visible(False)
    if col == ncols-1:
        ax_w.legend(fontsize=5, loc='upper right')

    # Value labels on top of each bar
    for i, t in enumerate(wall_times):
        ax_w.text(x_pos[i], t + max(wall_times)*0.01,
                  f'{t:.1f}', ha='center', va='bottom',
                  fontsize=4.5, rotation=90)

    # ── Bottom: speedup bars ──
    ax_s = axes[1][col]
    bars = ax_s.bar(x_pos, speedups, color='#BBBBBB', edgecolor='#333333',
                    linewidth=0.5, width=0.65)
    ax_s.axhline(y=1.0, color='black', linewidth=0.8, linestyle='-')
    ax_s.set_xticks(x_pos)
    ax_s.set_xticklabels(workers, fontsize=6)
    ax_s.tick_params(axis='y', labelsize=6)
    ax_s.set_ylabel('Speedup', fontsize=7)
    ax_s.set_xlabel('Nodes [#]', fontsize=6)
    ax_s.set_ylim(0, max(max(speedups)*1.2, 1.5))
    ax_s.set_facecolor('white')
    ax_s.spines['top'].set_visible(False)
    ax_s.spines['right'].set_visible(False)
    for i, (bar, s) in enumerate(zip(bars, speedups)):
        ax_s.text(x_pos[i], bar.get_height() + max(speedups)*0.02,
                  f'{s:.2f}', ha='center', va='bottom',
                  fontsize=5, rotation=90)

fig.text(0.5, 0.005,
         f'Non-MPI Task Distributor (NFS lockfile)  —  '
         f'8× RPi3 Workers  —  RPi5 Master  —  Mean of {n_runs} runs',
         ha='center', color='white', fontsize=6)

plt.tight_layout(rect=[0, 0.02, 1, 0.97])
plt.savefig("benchmark_results.png", dpi=180, bbox_inches='tight',
            facecolor=PURPLE)
print("Saved: benchmark_results2.png")