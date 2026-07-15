import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

POINT_CONFIGS = [
    {'points': 10_000,      'trials': 10, 'min_workers': 1},
    {'points': 100_000,     'trials': 10, 'min_workers': 1},
    {'points': 1_000_000,   'trials': 10, 'min_workers': 1},
    {'points': 10_000_000,  'trials':  3, 'min_workers': 1},
    {'points': 50_000_000,  'trials':  3, 'min_workers': 2},
]

# ════════════════════════════════════════════════════════════════════════════════
# PLOTTING — professor style
# ════════════════════════════════════════════════════════════════════════════════
PURPLE    = '#4B0082'
BAR_COLOR = '#CCCCCC'
BAR_EDGE  = '#333333'
OUTPUT_DIR    = '.'

BG_COLOR         = '#FFFFFF'
TEXT_COLOR       = '#000000'
TOP_BAR_COLOR    = '#00E63D'  # Vibrant green from the reference image
BOTTOM_BAR_COLOR = '#C0C0C0'  # Clean grey from the reference speedup charts
BAR_EDGE         = '#000000'  # Defined black borders
OUTPUT_DIR       = '.'

def professor_chart(results, scheduler_name, filename):
    point_sizes = sorted(set(r['total_points'] for r in results))
    n_cols      = len(point_sizes)

    fig, axes = plt.subplots(2, n_cols, figsize=(3.2 * n_cols, 7))
    fig.patch.set_facecolor(BG_COLOR)

    title = (f"{'Amdahl' + chr(39) + 's & Gustafson' + chr(39) + 's Law — Monte Carlo Pi'}\n"
             f"Non-MPI {'Celery+Redis' if scheduler_name=='celery' else 'ZeroMQ'} Cluster  "
             f"(8× RPi3, mean of trials)")
    fig.suptitle(title, color=TEXT_COLOR, fontsize=10, fontweight='bold', y=0.99)

    for col, pts in enumerate(point_sizes):
        rows = sorted([r for r in results if r['total_points'] == pts],
                      key=lambda x: x['n_workers'])
        if not rows:
            continue

        ns      = [r['n_workers'] for r in rows]
        walls   = [r['wall_s']    for r in rows]
        speedups= [r['speedup']   for r in rows]
        x_pos   = np.arange(len(ns))

        # ── Top: wall time (Vivid Green Bars) ──
        ax_w = axes[0][col]
        bars = ax_w.bar(x_pos, walls, color=TOP_BAR_COLOR, edgecolor=BAR_EDGE,
                        linewidth=0.8, width=0.65)
        ax_w.set_xticks(x_pos)
        ax_w.set_xticklabels(ns, fontsize=6, color=TEXT_COLOR)
        ax_w.tick_params(axis='y', labelsize=6, colors=TEXT_COLOR)
        ax_w.set_ylabel('Runtime [s]', fontsize=7, color=TEXT_COLOR)
        ax_w.set_xlabel('Nodes [#]', fontsize=7, color=TEXT_COLOR)
        
        trial_count = next(c['trials'] for c in POINT_CONFIGS if c['points'] == pts)
        pts_label = f'{pts//1_000_000}M' if pts >= 1_000_000 else f'{pts//1_000}K'
        ax_w.set_title(f'{pts_label} Points\n({trial_count} Trials)',
                       fontsize=8, pad=4, color=TEXT_COLOR, fontweight='bold')
        ax_w.set_facecolor(BG_COLOR)
        
        # Keep crisp grid lines/spines matching style
        for spine in ax_w.spines.values():
            spine.set_color(TEXT_COLOR)
            spine.set_linewidth(0.8)

        for bar, val in zip(bars, walls):
            ax_w.text(bar.get_x() + bar.get_width()/2,
                      bar.get_height() + max(walls)*0.01,
                      f'{val:.2f}' if val >= 1 else f'{val:.3f}',
                      ha='center', va='bottom', fontsize=5, rotation=90, color=TEXT_COLOR)

        # ── Bottom: speedup (Grey Bars) ──
        ax_s = axes[1][col]
        bars2 = ax_s.bar(x_pos, speedups, color=BOTTOM_BAR_COLOR, edgecolor=BAR_EDGE,
                         linewidth=0.8, width=0.65)
        ax_s.set_xticks(x_pos)
        ax_s.set_xticklabels(ns, fontsize=6, color=TEXT_COLOR)
        ax_s.tick_params(axis='y', labelsize=6, colors=TEXT_COLOR)
        ax_s.set_ylabel('Speedup', fontsize=7, color=TEXT_COLOR)
        ax_s.set_xlabel('Nodes [#]', fontsize=7, color=TEXT_COLOR)
        ax_s.set_facecolor(BG_COLOR)
        ax_s.set_ylim(0, 5) # Fixed headroom for speedup representation
        
        for spine in ax_s.spines.values():
            spine.set_color(TEXT_COLOR)
            spine.set_linewidth(0.8)

        for bar, val in zip(bars2, speedups):
            ax_s.text(bar.get_x() + bar.get_width()/2,
                      bar.get_height() + 0.1,
                      f'{val:.2f}',
                      ha='center', va='bottom', fontsize=6, color=TEXT_COLOR)

    fig.text(0.5, 0.005,
             f'Non-MPI {"Celery+Redis" if scheduler_name=='celery' else 'ZeroMQ (no broker)'}  —  '
             f'8× Raspberry Pi 3 Workers  —  Raspberry Pi 5 Master',
             ha='center', color=TEXT_COLOR, fontsize=6)

    plt.tight_layout(rect=[0, 0.02, 1, 0.97])
    path = f'{OUTPUT_DIR}/{filename}'
    plt.savefig(path, dpi=200, bbox_inches='tight', facecolor=BG_COLOR)
    plt.close()
    print(f'\nSaved: {path}')

# ---------------------------------------------
celery_results = [
  {
    "scheduler": "celery",
    "total_points": 10000,
    "n_workers": 1,
    "serial_s": 0.000391,
    "wall_s": 0.5185,
    "wall_all": [
      0.6473373170001651,
      0.504032787000142,
      0.5037878999999066,
      0.5037259189998622,
      0.503588475000015,
      0.5036216050000348,
      0.5041421580001497,
      0.5066403870000613,
      0.5036116600001606,
      0.5041100849998656
    ],
    "speedup": 0.0008,
    "efficiency": 0.0008
  },
  {
    "scheduler": "celery",
    "total_points": 10000,
    "n_workers": 2,
    "serial_s": 0.000391,
    "wall_s": 0.507,
    "wall_all": [
      0.5053143009999985,
      0.5055964299999687,
      0.5055458930000896,
      0.5083942310000111,
      0.5068309609998778,
      0.5075841979999041,
      0.5068597760000557,
      0.508134974000086,
      0.5086893969998982,
      0.5065824440000597
    ],
    "speedup": 0.0008,
    "efficiency": 0.0004
  },
  {
    "scheduler": "celery",
    "total_points": 10000,
    "n_workers": 4,
    "serial_s": 0.000391,
    "wall_s": 0.5162,
    "wall_all": [
      0.511649253999849,
      0.5146066649999739,
      0.5104945560001397,
      0.5144515179999871,
      0.5120011599999543,
      0.5114099410000108,
      0.5128712489999998,
      0.5441023199998654,
      0.520063399000037,
      0.5107095369999115
    ],
    "speedup": 0.0008,
    "efficiency": 0.0002
  },
  {
    "scheduler": "celery",
    "total_points": 10000,
    "n_workers": 8,
    "serial_s": 0.000391,
    "wall_s": 0.528,
    "wall_all": [
      0.524180749999914,
      0.5195988649998071,
      0.5336247790000925,
      0.5213104130000374,
      0.52230385200005,
      0.5194203109999762,
      0.5269795340000201,
      0.5421126639998874,
      0.5507579009999972,
      0.5192604230001052
    ],
    "speedup": 0.0007,
    "efficiency": 0.0001
  },
  {
    "scheduler": "celery",
    "total_points": 10000,
    "n_workers": 16,
    "serial_s": 0.000391,
    "wall_s": 0.5859,
    "wall_all": [
      0.6000107379998099,
      0.6106183539998256,
      0.586534396000161,
      0.5742716780000592,
      0.576602591999972,
      0.5787589340000068,
      0.5518575090000013,
      0.5471999009998854,
      0.6065721530001156,
      0.6267466849999437
    ],
    "speedup": 0.0007,
    "efficiency": 0.0
  },
  {
    "scheduler": "celery",
    "total_points": 10000,
    "n_workers": 32,
    "serial_s": 0.000391,
    "wall_s": 0.5832,
    "wall_all": [
      0.592416109999931,
      0.5692359439999564,
      0.5780608459999712,
      0.5902668240000821,
      0.5759351530000458,
      0.5777494409999235,
      0.5680321540000932,
      0.5764825960000053,
      0.5990193200000249,
      0.6045633310000085
    ],
    "speedup": 0.0007,
    "efficiency": 0.0
  },
  {
    "scheduler": "celery",
    "total_points": 100000,
    "n_workers": 1,
    "serial_s": 0.007058,
    "wall_s": 0.5109,
    "wall_all": [
      0.508775291999882,
      0.5154184820000864,
      0.5096114000000398,
      0.5142668579999281,
      0.5113589469999624,
      0.5118829259999984,
      0.5057789369998318,
      0.508325128000024,
      0.5090375879999556,
      0.5148452640000869
    ],
    "speedup": 0.0138,
    "efficiency": 0.0138
  },
  {
    "scheduler": "celery",
    "total_points": 100000,
    "n_workers": 2,
    "serial_s": 0.007058,
    "wall_s": 0.5109,
    "wall_all": [
      0.5124146470000142,
      0.5064911009999378,
      0.5124362020001172,
      0.5159831850000955,
      0.5166429599998992,
      0.5064161380000769,
      0.5077400029999808,
      0.5099264000000403,
      0.514091917000087,
      0.5071270429998549
    ],
    "speedup": 0.0138,
    "efficiency": 0.0069
  },
  {
    "scheduler": "celery",
    "total_points": 100000,
    "n_workers": 4,
    "serial_s": 0.007058,
    "wall_s": 0.5186,
    "wall_all": [
      0.5129545889999463,
      0.5271043730001566,
      0.5268876519999139,
      0.5241592029999538,
      0.5100076599999284,
      0.5159600200001933,
      0.5119273540001359,
      0.5120377619998635,
      0.5291574020000098,
      0.5155077629999596
    ],
    "speedup": 0.0136,
    "efficiency": 0.0034
  },
  {
    "scheduler": "celery",
    "total_points": 100000,
    "n_workers": 8,
    "serial_s": 0.007058,
    "wall_s": 0.5371,
    "wall_all": [
      0.5348250970000663,
      0.5303285450002022,
      0.5263131570000041,
      0.5263725449999583,
      0.5399134439999216,
      0.5285735899999509,
      0.5357088900000235,
      0.5750907190001726,
      0.5506278000000293,
      0.522747433999939
    ],
    "speedup": 0.0131,
    "efficiency": 0.0016
  },
  {
    "scheduler": "celery",
    "total_points": 100000,
    "n_workers": 16,
    "serial_s": 0.007058,
    "wall_s": 0.5803,
    "wall_all": [
      0.5468684850000045,
      0.5898313709999456,
      0.5654989140000453,
      0.5811813569998776,
      0.5810017480000624,
      0.5705454269998427,
      0.576253141000052,
      0.6472165780000978,
      0.6044148579999273,
      0.5397012800001448
    ],
    "speedup": 0.0122,
    "efficiency": 0.0008
  },
  {
    "scheduler": "celery",
    "total_points": 100000,
    "n_workers": 32,
    "serial_s": 0.007058,
    "wall_s": 0.6063,
    "wall_all": [
      0.57249417800017,
      0.6368651840000439,
      0.6399051140001575,
      0.5925963419999789,
      0.5978052420000495,
      0.6283828919999905,
      0.6390569520001463,
      0.6067240889999539,
      0.5715176290000272,
      0.5779927090000001
    ],
    "speedup": 0.0116,
    "efficiency": 0.0004
  },
  {
    "scheduler": "celery",
    "total_points": 1000000,
    "n_workers": 1,
    "serial_s": 0.050281,
    "wall_s": 0.508,
    "wall_all": [
      0.5073612520000097,
      0.5035293809999075,
      0.5038247319998845,
      0.5040858229999685,
      0.5063980899999478,
      0.5078781569998227,
      0.5126168010001493,
      0.5176411479999388,
      0.5083969509998951,
      0.508233711999992
    ],
    "speedup": 0.099,
    "efficiency": 0.099
  },
  {
    "scheduler": "celery",
    "total_points": 1000000,
    "n_workers": 2,
    "serial_s": 0.050281,
    "wall_s": 0.5171,
    "wall_all": [
      0.5252561849999893,
      0.5107091810000384,
      0.5310285840000688,
      0.5123428209999474,
      0.5185107370000424,
      0.5291968899998665,
      0.5066438500000459,
      0.5100698520000151,
      0.5128904680000232,
      0.5147583670000131
    ],
    "speedup": 0.0972,
    "efficiency": 0.0486
  },
  {
    "scheduler": "celery",
    "total_points": 1000000,
    "n_workers": 4,
    "serial_s": 0.050281,
    "wall_s": 0.517,
    "wall_all": [
      0.5181658690000859,
      0.513810648999879,
      0.5128408949999539,
      0.5162902480001321,
      0.5278268600000047,
      0.512062639000078,
      0.515132402999825,
      0.5177371129998392,
      0.522587792999957,
      0.5133038929998293
    ],
    "speedup": 0.0973,
    "efficiency": 0.0243
  },
  {
    "scheduler": "celery",
    "total_points": 1000000,
    "n_workers": 8,
    "serial_s": 0.050281,
    "wall_s": 0.5269,
    "wall_all": [
      0.5178747600000406,
      0.5298558509998657,
      0.5217080379998151,
      0.5199012140001287,
      0.5226175530001456,
      0.5195504380001239,
      0.5192983469999035,
      0.5354786759999115,
      0.5628656760000013,
      0.5202242689999821
    ],
    "speedup": 0.0954,
    "efficiency": 0.0119
  },
  {
    "scheduler": "celery",
    "total_points": 1000000,
    "n_workers": 16,
    "serial_s": 0.050281,
    "wall_s": 0.5468,
    "wall_all": [
      0.5419797199999721,
      0.5472292500001004,
      0.5462865330000568,
      0.5448655400000462,
      0.5659664580000481,
      0.5374372049998328,
      0.5544898459997967,
      0.5415293899998233,
      0.5508964570001353,
      0.5373405029999958
    ],
    "speedup": 0.092,
    "efficiency": 0.0057
  },
  {
    "scheduler": "celery",
    "total_points": 1000000,
    "n_workers": 32,
    "serial_s": 0.050281,
    "wall_s": 0.5836,
    "wall_all": [
      0.5684271129998706,
      0.5956923720000304,
      0.5813756439999906,
      0.5725399829998423,
      0.5938635659999818,
      0.6144212279998555,
      0.5775622919998114,
      0.5814411080000355,
      0.5713813590000427,
      0.5797002460001295
    ],
    "speedup": 0.0862,
    "efficiency": 0.0027
  },
  {
    "scheduler": "celery",
    "total_points": 10000000,
    "n_workers": 1,
    "serial_s": 0.54824,
    "wall_s": 3.1429,
    "wall_all": [
      2.5685655709999082,
      4.247544457000004,
      2.6126004790000934
    ],
    "speedup": 0.1744,
    "efficiency": 0.1744
  },
  {
    "scheduler": "celery",
    "total_points": 10000000,
    "n_workers": 2,
    "serial_s": 0.54824,
    "wall_s": 0.9928,
    "wall_all": [
      1.0248781410000447,
      0.9789152299999841,
      0.9744774559999314
    ],
    "speedup": 0.5522,
    "efficiency": 0.2761
  },
  {
    "scheduler": "celery",
    "total_points": 10000000,
    "n_workers": 4,
    "serial_s": 0.54824,
    "wall_s": 0.682,
    "wall_all": [
      0.5123096269999223,
      0.5613996330000646,
      0.9721837639999649
    ],
    "speedup": 0.8039,
    "efficiency": 0.201
  },
  {
    "scheduler": "celery",
    "total_points": 10000000,
    "n_workers": 8,
    "serial_s": 0.54824,
    "wall_s": 0.5285,
    "wall_all": [
      0.5224564119998831,
      0.539916532999996,
      0.5231843169999593
    ],
    "speedup": 1.0374,
    "efficiency": 0.1297
  },
  {
    "scheduler": "celery",
    "total_points": 10000000,
    "n_workers": 16,
    "serial_s": 0.54824,
    "wall_s": 0.5449,
    "wall_all": [
      0.5400646059999872,
      0.5474878489999355,
      0.5471688879999874
    ],
    "speedup": 1.0061,
    "efficiency": 0.0629
  },
  {
    "scheduler": "celery",
    "total_points": 10000000,
    "n_workers": 32,
    "serial_s": 0.54824,
    "wall_s": 0.5826,
    "wall_all": [
      0.5668670519999068,
      0.6077335989998573,
      0.5730870049999339
    ],
    "speedup": 0.941,
    "efficiency": 0.0294
  },
  {
    "scheduler": "celery",
    "total_points": 50000000,
    "n_workers": 4,
    "serial_s": 2.937406,
    "wall_s": 8.7922,
    "wall_all": [
      7.335827507000204,
      10.27146818700021,
      8.769181947999641
    ],
    "speedup": 0.3341,
    "efficiency": 0.0835
  },
  {
    "scheduler": "celery",
    "total_points": 50000000,
    "n_workers": 8,
    "serial_s": 2.937406,
    "wall_s": 2.472,
    "wall_all": [
      2.23243478600034,
      2.216036803999941,
      2.967582592999861
    ],
    "speedup": 1.1883,
    "efficiency": 0.1485
  },
  {
    "scheduler": "celery",
    "total_points": 50000000,
    "n_workers": 16,
    "serial_s": 2.937406,
    "wall_s": 1.3488,
    "wall_all": [
      1.4493582939999214,
      1.4479356050001115,
      1.1492359799999576
    ],
    "speedup": 2.1778,
    "efficiency": 0.1361
  },
  {
    "scheduler": "celery",
    "total_points": 50000000,
    "n_workers": 32,
    "serial_s": 2.937406,
    "wall_s": 1.0945,
    "wall_all": [
      1.3673677010001484,
      1.0032631230001243,
      0.9129198650002763
    ],
    "speedup": 2.6838,
    "efficiency": 0.0839
  }
]
professor_chart(celery_results, 'celery', 'celery_combined_color.png')