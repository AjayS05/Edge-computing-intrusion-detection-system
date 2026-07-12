import matplotlib.pyplot as plt
import numpy as np

data_rp3_8 = {
    4000:  [1.89, 2.41, 2.27, 2.28, 2.33],
    6000:  [3.25, 3.24, 3.35, 3.28, 3.36],
    8000:  [3.99, 4.06, 4.15, 4.07, 4.00],
    10000: [2.99, 4.35, 3.54, 4.39, 4.42]
}

data_rp3_16 = {
    8000:  [6.32, 6.59, 6.70, 6.48, 6.48],
    10000: [7.69, 7.74, 6.90, 7.63, 7.11],
    12000: [8.13, 8.60, 8.40, 8.40, 7.86],
    14000: [7.92, 3.37, 2.74, 6.99, 3.07]
}

data_rp3_32 = {
    10000: [12.4, 11.9, 10.8, 11.7, 11.7],
    14000: [15.8, 15.2, 14.5, 12.6, 15.6],
    18000: [16.3, 16.9, 15.3, 16.9, 17.3],
    20000: [12.5, 8.19, 7.8, 11.9, 4.17]
}


'''Speedup for N = 10 000'''
time_rp3_8 = np.array([
    333.88,
    153.16,
    187.93,
    151.89,
    150.61
])

time_rp3_16 = np.array([
    86.61,
    86.06,
    96.09,
    87.33,
    93.69
])

time_rp3_32 = np.array([
    53.72,
    56.03,
    61.22,
    56.91,
    56.64
])


# ----------------------------------
# Calcul du speedup
# Référence = 2 RPi
# ----------------------------------

speedup_rp3_8 = time_rp3_8 / time_rp3_8
speedup_rp3_16 = time_rp3_8 / time_rp3_16
speedup_rp3_32 = time_rp3_8 / time_rp3_32


speedups = [
    speedup_rp3_8,
    speedup_rp3_16,
    speedup_rp3_32
]


labels = [
    "2 RPi\n(8 cores)",
    "4 RPi\n(16 cores)",
    "8 RPi\n(32 cores)"
]


# Moyenne et écart-type
means = [np.mean(x) for x in speedups]
stds = [np.std(x) for x in speedups]


# ----------------------------------
# Création du bar plot
# ----------------------------------

plt.figure(figsize=(7,5))

bars = plt.bar(
    labels,
    means,
    yerr=stds,
    capsize=5
)


# Afficher les valeurs au-dessus des barres
for bar, value in zip(bars, means):
    plt.text(
        bar.get_x() + bar.get_width()/2,
        value + 0.05,
        f"{value:.2f}",
        ha='center',
        fontsize=10
    )


plt.ylabel("Speedup")
plt.xlabel("Configuration")
plt.title("HPL Speedup for N = 10000")

plt.grid(
    axis='y',
    linestyle='--',
    alpha=0.4
)




plt.tight_layout()

plt.savefig(
    "boxplot_speedup.png",
    dpi=300,
    bbox_inches="tight"
)


plt.close()

def plot_boxplot(data, title, filename):
    N = list(data.keys())
    values = list(data.values())

    plt.figure(figsize=(7,5))

    plt.boxplot(
        values,
        labels=N,
        patch_artist=True,
        showmeans=True
    )

    plt.title(title)
    plt.xlabel("Matrix size (N)")
    plt.ylabel("Performance (GFLOPS)")
    plt.grid(axis='y', linestyle='--', alpha=0.4)

    plt.tight_layout()

    # Sauvegarde en PNG haute résolution
    plt.savefig(filename, dpi=300, bbox_inches="tight")

    plt.close()


plot_boxplot(
    data_rp3_8,
    "HPL Performance - 2 Raspberry Pi 3 (8 cores)",
    "boxplot_rp3_8.png"
)

plot_boxplot(
    data_rp3_16,
    "HPL Performance - 4 Raspberry Pi 3 (16 cores)",
    "boxplot_rp3_16.png"
)

plot_boxplot(
    data_rp3_32,
    "HPL Performance - 8 Raspberry Pi 3 (32 cores)",
    "boxplot_rp3_32.png"
)