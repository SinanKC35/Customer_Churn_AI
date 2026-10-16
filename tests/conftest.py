"""A small SYNTHETIC fixture for integration tests only (never for production)."""
import numpy as np
import pandas as pd
import pytest

from app.features import CATEGORICAL_VALUES, RAW_TO_API
from train import train


@pytest.fixture
def trained_dir(tmp_path):
    rng = np.random.default_rng(123)
    n = 120
    values = {}
    for raw_name, api_name in RAW_TO_API.items():
        if api_name == "tenure":
            values[raw_name] = rng.integers(0, 73, n)
        elif api_name == "monthly_charges":
            values[raw_name] = rng.uniform(25, 120, n).round(2)
        elif api_name == "senior_citizen":
            values[raw_name] = rng.integers(0, 2, n)
        else:
            values[raw_name] = rng.choice(CATEGORICAL_VALUES[api_name], n)
    df = pd.DataFrame(values)
    # For testing the learning code, not for evaluating real-world model quality.
    df["Churn"] = np.where((df["tenure"] < 25) & (df["Contract"] == "Month-to-month"), "Yes", "No")
    csv_path = tmp_path / "synthetic_fixture.csv"
    df.to_csv(csv_path, index=False)
    output_dir = tmp_path / "models"
    train(csv_path, output_dir, "synthetic test fixture (NOT IBM data)")
    return output_dir
