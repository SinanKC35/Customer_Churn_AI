"""Lazy loading and vectorized inference using the same training feature encoder."""
import json
import math
import os
from functools import lru_cache
from pathlib import Path

import pandas as pd
from xgboost import XGBClassifier
from xgboost.core import XGBoostError

from app.features import CATEGORICAL_VALUES, NUMERIC_FEATURES, encode_features

DEFAULT_MODEL_DIR = Path(__file__).resolve().parents[1] / "models"


class ModelUnavailable(RuntimeError):
    pass


@lru_cache(maxsize=1)
def load_model():
    directory = Path(os.environ.get("CHURN_MODEL_DIR", str(DEFAULT_MODEL_DIR)))
    model_path = directory / "xgboost_model.json"
    metadata_path = directory / "metadata.json"
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        if not model_path.is_file():
            raise FileNotFoundError(model_path)
        model = XGBClassifier()
        model.load_model(str(model_path))
        if not isinstance(metadata, dict):
            raise ValueError("Model metadata must be a JSON object")
        version = metadata.get("model_version")
        if not isinstance(version, str) or not version.strip():
            raise ValueError("Missing model_version")
        threshold = metadata.get("threshold")
        if (isinstance(threshold, bool) or not isinstance(threshold, (int, float))
                or not math.isfinite(threshold) or not 0 <= threshold <= 1):
            raise ValueError("Invalid prediction threshold")
        expected = NUMERIC_FEATURES + [
            f"{name}_{category}"
            for name, categories in CATEGORICAL_VALUES.items()
            for category in categories
        ]
        columns = metadata.get("feature_columns")
        if (not isinstance(columns, list) or columns != expected
                or model.get_booster().feature_names != expected):
            raise ValueError("Model feature schema does not match API")
        return model, metadata
    except (OSError, ValueError, KeyError, TypeError, XGBoostError) as error:
        raise ModelUnavailable(
            "Model unavailable. Run 'python train.py' to create the artifacts."
        ) from error


def predict_batch_churn(rows: list[dict]) -> tuple[list[tuple[int, float]], str]:
    """Run all rows through one shared vectorized XGBoost inference call."""
    model, metadata = load_model()
    encoded = encode_features(pd.DataFrame(rows))
    if list(encoded.columns) != metadata["feature_columns"]:
        raise ModelUnavailable("Feature schema mismatch; please retrain the model.")
    probabilities = model.predict_proba(encoded)[:, 1]
    threshold = float(metadata["threshold"])
    predictions = [
        (int(probability >= threshold), round(float(probability), 6))
        for probability in probabilities
    ]
    return predictions, str(metadata["model_version"])


def predict_churn(data: dict):
    predictions, version = predict_batch_churn([data])
    label, probability = predictions[0]
    return label, probability, version


def model_info():
    _, metadata = load_model()
    return metadata
