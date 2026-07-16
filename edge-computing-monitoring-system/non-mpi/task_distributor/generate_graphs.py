import os
import re
import glob
import matplotlib.pyplot as plt
import numpy as np
from collections import defaultdict

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RESULT_DIR = os.path.join(BASE_DIR, "task_distributor_32_cores_results")
OUTPUT_DIR = os.path.join(BASE_DIR, "graphs")

os.makedirs(OUTPUT_DIR, exist_ok=True)

def parse_file(filename):
    basename = os.path.basename(filename)
    # Match resolution and node count. Accommodates run numbers or timestamps if present later in the filename
    match = re.match(r"(\d+x\d+)_(\d+)_Nodes", basename)
    if not match:
        return None

    image = match.group(1)
    nodes = int(match.group(2))

    with open(filename) as f:
        text = f.read()

    seq1 = re.search(r"1st sequential part:\s+([\d.]+)", text)
    parallel = re.search(r"parallel part:\s+([\d.]+)", text)
    seq2 = re.search(r"2nd sequential part:\s+([\d.]+)", text)

    if not (seq1 and parallel and seq2):
        return None

    return {
        "image": image,
        "nodes": nodes,
        "seq1": float(seq1.group(1)),
        "parallel": float(parallel.group(1)),
        "seq2": float(seq2.group(1))
    }

# -----------------------------
# Load and Aggregate Data
# -----------------------------
# Use a nested dictionary structure: raw_groups[image][nodes] = [run1, run2, ...]
raw_groups = defaultdict(lambda: defaultdict(list))
files = glob.glob(os.path.join(RESULT_DIR, "*.txt"))

for file in files:
    result = parse_file(file)
    if result:
        raw_groups[result["image"]][result["nodes"]].append(result)

# -----------------------------
# Calculate Averages
# -----------------------------
data = defaultdict(list)

for image, nodes_dict in raw_groups.items():
    for nodes, runs in nodes_dict.items():
        # Extract metrics across all runs for this specific resolution + node configuration
        seq1_list = [r["seq1"] for r in runs]
        seq2_list = [r["seq2"] for r in runs]
        parallel_list = [r["parallel"] for r in runs]
        
        # Calculate the averages
        avg_seq1 = np.mean(seq1_list)
        avg_seq2 = np.mean(seq2_list)
        avg_parallel = np.mean(parallel_list)
        avg_runtime = avg_seq1 + avg_parallel + avg_seq2
        
        data[image].append({
            "image": image,
            "nodes": nodes,
            "seq1": avg_seq1,
            "seq2": avg_seq2,
            "parallel": avg_parallel,
            "runtime": avg_runtime
        })

# Explicitly ordered resolutions to match the target layout left-to-right
resolutions = ["200x150", "400x300", "800x600", "1600x1200", "3200x2400", "6400x4800"]
resolutions = [res for res in resolutions if res in data]

# Sort configurations within each resolution by node count
for image in data:
    data[image] = sorted(data[image], key=lambda x: x["nodes"])

# -----------------------------
# Generate Layout Grid
# -----------------------------
num_cols = len(resolutions)
fig, axes = plt.subplots(2, num_cols, figsize=(13, 8))

if num_cols == 1:
    axes = np.expand_dims(axes, axis=1)

for col_idx, image in enumerate(resolutions):
    runs = data[image]
    
    nodes = [x["nodes"] for x in runs]
    x_pos = np.arange(len(nodes))
    
    seq1 = np.array([x["seq1"] for x in runs])
    seq2 = np.array([x["seq2"] for x in runs])
    parallel = np.array([x["parallel"] for x in runs])
    runtime = np.array([x["runtime"] for x in runs])
    
    base_runtime = runtime[0] 
    speedup = base_runtime / runtime

    # -----------------------------
    # Row 1: Stacked Runtime Bars (Averaged)
    # -----------------------------
    ax_top = axes[0, col_idx]
    
    b1 = ax_top.bar(x_pos, seq1, color="red", edgecolor="black", width=0.6)
    b2 = ax_top.bar(x_pos, seq2, bottom=seq1, color="orange", edgecolor="black", width=0.6)
    b3 = ax_top.bar(x_pos, parallel, bottom=seq1+seq2, color="lime", edgecolor="black", width=0.6)
    
    ax_top.set_title(image, fontsize=11, pad=10)
    ax_top.set_ylabel("Runtime [s]", fontsize=9)
    ax_top.set_xlabel("Nodes [#]", fontsize=9)
    ax_top.set_xticks(x_pos)
    ax_top.set_xticklabels(nodes)
    ax_top.tick_params(axis='both', which='major', labelsize=9, direction='in')
    
    if col_idx == max(0, num_cols - 2):
        ax_top.legend(
            [b1, b2, b3], 
            ["1st seq. part", "2nd seq. part", "Par. part"], 
            frameon=False, 
            fontsize=8, 
            loc="upper right"
        )

    # -----------------------------
    # Row 2: Speedup Bars (From Averaged Runtimes)
    # -----------------------------
    ax_bottom = axes[1, col_idx]
    
    bars = ax_bottom.bar(x_pos, speedup, color="silver", edgecolor="black", width=0.7)
    
    ax_bottom.set_ylabel("Speedup", fontsize=9)
    ax_bottom.set_xlabel("Nodes [#]", fontsize=9)
    ax_bottom.set_xticks(x_pos)
    ax_bottom.set_xticklabels(nodes)
    ax_bottom.set_ylim(0, 5)
    ax_bottom.tick_params(axis='both', which='major', labelsize=9, direction='in')
    
    
    for bar in bars:
        yval = bar.get_height()
        label_str = f"{yval:.2f}" if yval >= 1.0 else f".{int(round(yval*100)):02d}"
        ax_bottom.text(
            bar.get_x() + bar.get_width()/2.0, 
            yval + 0.1, 
            label_str, 
            ha='center', 
            va='bottom', 
            fontsize=8
        )

fig.suptitle(
    "Non-MPI Task Distributor Performance (Average of Multiple Runs)",
    fontsize=18,
    y=0.98
)

plt.tight_layout(rect=[0, 0, 1, 0.96])
output_path = os.path.join(OUTPUT_DIR, "combined_performance_grid3.png")
plt.savefig(output_path, dpi=300, bbox_inches="tight")
plt.close()

print(f"Graph generated using averages of all available runs at: {output_path}")