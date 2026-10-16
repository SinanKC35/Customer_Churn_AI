import pandas as pd
import pytest

from app.features import CATEGORICAL_VALUES, FEATURES, encode_features, validate_dataset_categories


def test_encoding_is_stable_for_different_categories():
    base = {"tenure": 12, "monthly_charges": 65.5, "senior_citizen": 0}
    for feature, choices in CATEGORICAL_VALUES.items():
        base[feature] = choices[0]
    a = encode_features(pd.DataFrame([base]))
    b = encode_features(pd.DataFrame([{**base, "contract": "Two year"}]))
    assert list(a.columns) == list(b.columns)
    assert not a.isna().any().any()
    assert not (a == b).all().all()


def test_unknown_dataset_category_fails():
    sample = {"tenure": 1, "monthly_charges": 20, "senior_citizen": 0}
    for feature, choices in CATEGORICAL_VALUES.items():
        sample[feature] = choices[0]
    sample["contract"] = "Weekly"
    with pytest.raises(ValueError, match="Unexpected values"):
        validate_dataset_categories(pd.DataFrame([sample]))
