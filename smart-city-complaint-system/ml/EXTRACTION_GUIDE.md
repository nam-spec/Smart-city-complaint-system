# Model Extraction Guide: Running Step 1-8 Independently

## Directory Structure Required

```
isolated-model-project/
├── requirements.txt          # Python dependencies
├── data/                     # Input & intermediate data
│   ├── complaints_clean.csv  # ✓ ESSENTIAL - Starting dataset
│   ├── complaints_with_severity.csv
│   ├── complaints_with_density.csv
│   ├── complaints_with_temporal.csv
│   ├── complaints_with_acceleration.csv
│   ├── stage1_results.csv
│   ├── fold_stats.csv
│   ├── best_weights.csv
│   ├── weight_ablation_stage1.csv
│   ├── weight_ablation_stage2.csv
│   ├── weight_ablation.csv
│   ├── evaluation_results.csv
│   ├── explainability_table.csv
│   ├── final_priority_dataset.csv
│   ├── window_level_stats.csv
│   └── external_gt_resolution.csv
├── model/
│   ├── step1_severity.py
│   ├── step2_spatial.py
│   ├── step3_temporal.py
│   ├── step4_acceleration.py
│   ├── step5_priority_score.py
│   ├── step6_evaluation.py
│   ├── step7_explainability.py
│   ├── step8_figures.py
│   ├── severity_model.py
│   ├── spatial_clustering.py
│   ├── priority_model.py
│   ├── growth_rate.py
│   ├── acceleration.py
│   ├── evaluation.py
│   ├── temporal_density.py
│   └── st_dbscan_baseline.py
└── preprocessing/
    └── prepare_dataset.py    # Optional - if you need to prepare raw data
```

---

## Data Files Breakdown

### ✓ ESSENTIAL (Must Have)
| File | Purpose | Created By |
|------|---------|-----------|
| `complaints_clean.csv` | **Starting input** - cleaned complaint data | External (preprocessing) |

### Generated During Pipeline Execution
| File | Purpose | Created By |
|------|---------|-----------|
| `complaints_with_severity.csv` | Output of Step 1 | step1_severity.py |
| `complaints_with_density.csv` | Output of Step 2 | step2_spatial.py |
| `complaints_with_temporal.csv` | Output of Step 3 | step3_temporal.py |
| `complaints_with_acceleration.csv` | Output of Step 4 | step4_acceleration.py |
| `final_priority_dataset.csv` | Output of Step 5 | step5_priority_score.py |
| `stage1_results.csv` | F1/P@K results for figures | step5_priority_score.py |
| `fold_stats.csv` | Cross-validation stats | step5_priority_score.py |
| `best_weights.csv` | Optimized stage weights | step5_priority_score.py |
| `weight_ablation_stage1.csv` | Ablation study results | step5_priority_score.py |
| `weight_ablation_stage2.csv` | Ablation study results | step5_priority_score.py |
| `weight_ablation.csv` | Combined ablation | step5_priority_score.py |
| `evaluation_results.csv` | Step 6 evaluation metrics | step6_evaluation.py |
| `explainability_table.csv` | Feature importance analysis | step7_explainability.py |
| `window_level_stats.csv` | Time window aggregations | step5_priority_score.py |
| `external_gt_resolution.csv` | Optional validation ground truth | step5_priority_score.py |

---

## Python Dependencies (requirements.txt)

```
pandas>=1.3.0
numpy>=1.20.0
scikit-learn>=0.24.0
sentence-transformers>=2.2.0
matplotlib>=3.3.0
seaborn>=0.11.0
scipy>=1.5.0
joblib>=1.0.0
flask>=2.0.0
```

### Additional Optional Dependencies (if needed):
```
# For advanced analysis
lightgbm>=3.3.0
xgboost>=1.5.0
optuna>=3.0.0

# For visualization
plotly>=5.0.0
```

---

## Core Model Files Needed

### Always Required:
- `step1_severity.py` → Severity scoring (sentence embeddings)
- `step2_spatial.py` → Spatial density (BallTree haversine)
- `step3_temporal.py` → Temporal density (time windowing)
- `step4_acceleration.py` → Growth acceleration detection
- `step5_priority_score.py` → Final priority scoring + weight optimization
- `step6_evaluation.py` → Evaluation metrics
- `step7_explainability.py` → Feature importance
- `step8_figures.py` → Visualization & plots

### Support Modules (check imports):
- `severity_model.py` - If step1 imports it
- `spatial_clustering.py` - If step2 imports it
- `temporal_density.py` - If step3 imports it
- `acceleration.py` - If step4 imports it
- `growth_rate.py` - Helper functions
- `priority_model.py` - Helper for step5
- `evaluation.py` - Evaluation utilities
- `st_dbscan_baseline.py` - If used for comparisons

---

## Setup Instructions

### 1. Create the directory structure:
```bash
mkdir isolated-model-project
cd isolated-model-project
mkdir data model preprocessing
```

### 2. Copy files:
```bash
# Copy data
cp your-project/ml/data/complaints_clean.csv ./data/

# Copy model scripts
cp your-project/ml/model/*.py ./model/
cp your-project/ml/preprocessing/prepare_dataset.py ./preprocessing/

# Copy requirements
cp your-project/ml/requirements.txt ./
```

### 3. Install dependencies:
```bash
pip install -r requirements.txt
```

### 4. Run the pipeline:
```bash
cd model
python step1_severity.py
python step2_spatial.py
python step3_temporal.py
python step4_acceleration.py
python step5_priority_score.py
python step6_evaluation.py
python step7_explainability.py
python step8_figures.py
```

---

## What You Can Exclude

❌ **NOT NEEDED** (Leave in original project):
- `app.py` - Flask API wrapper (not part of ML pipeline)
- `train.py` - Training wrapper (check if it's used)
- `preprocessing/prepare_dataset.py` - Only if you already have `complaints_clean.csv`
- Any Jupyter notebooks or exploratory scripts
- Backend (`backend/`) folder entirely
- Frontend (`frontend/`) folder entirely

---

## Important Notes

1. **Path Adjustments**: All step files use `../data/` paths. When extracted, you have two options:
   - Keep the same structure (model & data folders as shown)
   - Modify all `../data/` to `./data/` if you flatten the structure

2. **Sentence Transformers Model**: Step 1 uses `all-MiniLM-L6-v2` which downloads automatically (~100MB) on first run.

3. **Minimal Starting Dataset**: You **must** have `complaints_clean.csv`. If you don't have it, use `preprocessing/prepare_dataset.py` from your main project first to generate it.

4. **GPU Support** (Optional): For faster sentence embeddings, install:
   ```bash
   pip install torch
   ```

5. **Output Visualization**: Step 8 generates PNG/PDF figures saved in `data/` folder.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `FileNotFoundError: ../data/complaints_clean.csv` | Check path structure matches expected layout |
| `ModuleNotFoundError: sentence_transformers` | Run `pip install sentence-transformers` |
| `CUDA/GPU errors` | Either install CUDA or remove GPU-specific code from imports |
| `Plot output not showing` | Step 8 uses `matplotlib.use("Agg")` for headless output |

---

## Verification Checklist

Before running, ensure you have:
- [ ] `complaints_clean.csv` in `data/` folder
- [ ] All 8 step*.py files in `model/` folder
- [ ] All support .py modules in `model/` folder
- [ ] `requirements.txt` installed
- [ ] Enough disk space (~500MB minimum for intermediate CSVs)
- [ ] Python 3.8+
