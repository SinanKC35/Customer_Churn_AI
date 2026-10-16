"""Single source of truth for training and serving features.

The features below exist in the published IBM Telco Customer Churn sample.
An explicit category vocabulary guarantees stable columns for inference.
"""

import pandas as pd

NUMERIC_FEATURES = ["tenure", "monthly_charges", "senior_citizen"]
CATEGORICAL_VALUES = {
    "contract": ["Month-to-month", "One year", "Two year"],
    "internet_service": ["DSL", "Fiber optic", "No"],
    "payment_method": [
        "Bank transfer (automatic)", "Credit card (automatic)",
        "Electronic check", "Mailed check",
    ],
    "tech_support": ["No", "No internet service", "Yes"],
    "online_security": ["No", "No internet service", "Yes"],
    "paperless_billing": ["No", "Yes"],
}
FEATURES = NUMERIC_FEATURES + list(CATEGORICAL_VALUES)
RAW_TO_API = {
    "tenure": "tenure",
    "MonthlyCharges": "monthly_charges",
    "SeniorCitizen": "senior_citizen",
    "Contract": "contract",
    "InternetService": "internet_service",
    "PaymentMethod": "payment_method",
    "TechSupport": "tech_support",
    "OnlineSecurity": "online_security",
    "PaperlessBilling": "paperless_billing",
}


def encode_features(data: pd.DataFrame) -> pd.DataFrame:
    """Deterministic, training/serving-consistent one-hot encoding.

    Unknown values become all-zero categorical flags; the API rejects these
    through its Pydantic schema, and the trainer validates dataset categories.
    """
    data = data[FEATURES].copy()
    for name in NUMERIC_FEATURES:
        data[name] = pd.to_numeric(data[name], errors="raise")
    for name, categories in CATEGORICAL_VALUES.items():
        data[name] = pd.Categorical(data[name], categories=categories)
    return pd.get_dummies(
        data, columns=list(CATEGORICAL_VALUES), dtype=int
    ).astype(float)


def validate_dataset_categories(data: pd.DataFrame) -> None:
    for name, categories in CATEGORICAL_VALUES.items():
        actual = set(data[name].dropna().astype(str).unique())
        unexpected = actual - set(categories)
        if unexpected:
            raise ValueError(f"Unexpected values for {name}: {sorted(unexpected)}")
