import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen

import pandas as pd
from sklearn.metrics import (
    accuracy_score, confusion_matrix, f1_score, precision_score,
    recall_score, roc_auc_score,
)
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier

from app.features import (
    FEATURES, RAW_TO_API, encode_features, validate_dataset_categories,
)

DATASET_URL = (
    "https://raw.githubusercontent.com/IBM/telco-customer-churn-on-icp4d/"
    "master/data/Telco-Customer-Churn.csv"
)
DATASET_SHA256 = "16320c9c1ec72448db59aa0a26a0b95401046bef5d02fd3aeb906448e3055e91"
DEFAULT_DATA_PATH = Path("data/Telco-Customer-Churn.csv")
DEFAULT_MODEL_DIR = Path("models")
SEED = 42
THRESHOLD = 0.5


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ensure_ibm_dataset(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.is_file():
        print(f"Downloading IBM sample dataset to {path} ...")
        try:
            with urlopen(DATASET_URL, timeout=30) as response:
                content = response.read()
            path.write_bytes(content)
        except (OSError, TimeoutError) as error:
            raise RuntimeError(
                f"Could not download the dataset. Download manually from {DATASET_URL} "
                f"and save as {path}"
            ) from error
    checksum = sha256_file(path)
    if checksum != DATASET_SHA256:
        raise ValueError(
            f"IBM dataset checksum mismatch for {path}. "
            "Check that you downloaded the correct original CSV."
        )
    return path


def prepare_data(csv_path: Path) -> tuple[pd.DataFrame, pd.Series]:
    raw = pd.read_csv(csv_path)
    required = list(RAW_TO_API) + ["Churn"]
    missing = set(required) - set(raw.columns)
    if missing:
        raise ValueError(f"Dataset columns missing: {sorted(missing)}")
    df = raw[required].rename(columns=RAW_TO_API).copy()
    if df.isna().any().any():
        raise ValueError("Unexpected missing values in selected dataset columns")
    validate_dataset_categories(df)
    churn_values = set(df["Churn"].unique())
    if churn_values != {"Yes", "No"}:
        raise ValueError("Churn column must contain both Yes and No")
    y = df["Churn"].map({"No": 0, "Yes": 1}).astype(int)
    return df[FEATURES], y


def train(csv_path: Path, models_dir: Path, source: str):
    X, y = prepare_data(csv_path)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=SEED,
    )
    encoded_train = encode_features(X_train)
    encoded_test = encode_features(X_test)
    assert list(encoded_train.columns) == list(encoded_test.columns)

    model = XGBClassifier(
        n_estimators=150, max_depth=3, learning_rate=0.05,
        subsample=0.85, colsample_bytree=0.9,
        objective="binary:logistic", eval_metric="logloss",
        tree_method="hist", n_jobs=2, random_state=SEED,
    )
    model.fit(encoded_train, y_train)
    probabilities = model.predict_proba(encoded_test)[:, 1]
    preds = (probabilities >= THRESHOLD).astype(int)
    metrics = {
        "accuracy": round(float(accuracy_score(y_test, preds)), 4),
        "precision": round(float(precision_score(y_test, preds, zero_division=0)), 4),
        "recall": round(float(recall_score(y_test, preds, zero_division=0)), 4),
        "f1": round(float(f1_score(y_test, preds, zero_division=0)), 4),
        "roc_auc": round(float(roc_auc_score(y_test, probabilities)), 4),
        "confusion_matrix": confusion_matrix(y_test, preds).tolist(),
    }
    metadata = {
        "model_version": "2.0.0",
        "training_time_utc": datetime.now(timezone.utc).isoformat(),
        "dataset": "IBM Telco Customer Churn sample (fictional company)",
        "dataset_source": source,
        "dataset_sha256": sha256_file(csv_path),
        "total_rows": len(X),
        "train_rows": len(X_train),
        "test_rows": len(X_test),
        "feature_columns": list(encoded_train.columns),
        "threshold": THRESHOLD,
        "seed": SEED,
        "metrics_test_set": metrics,
        "limitations": "Sample data, single stratified holdout; not production validated",
    }
    models_dir.mkdir(parents=True, exist_ok=True)
    model.save_model(str(models_dir / "xgboost_model.json"))
    (models_dir / "metadata.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(json.dumps(metrics, indent=2))
    print(f"Saved model & metadata in {models_dir.resolve()}")
    return metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, default=None, help="Use a local CSV (for tests or offline training)")
    parser.add_argument("--models-dir", type=Path, default=DEFAULT_MODEL_DIR)
    args = parser.parse_args()
    if args.csv:
        if not args.csv.is_file():
            parser.error(f"CSV file not found: {args.csv}")
        csv_path, source = args.csv, f"local file: {args.csv}"
    else:
        csv_path, source = ensure_ibm_dataset(DEFAULT_DATA_PATH), DATASET_URL
    train(csv_path, args.models_dir, source)


if __name__ == "__main__":
    main()
