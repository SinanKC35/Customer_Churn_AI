import json

from fastapi.testclient import TestClient

from app.main import app
from app.ml_service import load_model

client = TestClient(app)
VALID_REQUEST = {
    "tenure": 24,
    "monthly_charges": 79.5,
    "senior_citizen": 0,
    "contract": "Month-to-month",
    "internet_service": "Fiber optic",
    "payment_method": "Electronic check",
    "tech_support": "No",
    "online_security": "No",
    "paperless_billing": "Yes",
}


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_invalid_age_is_not_supported():
    assert client.post("/predict", json={**VALID_REQUEST, "age": 35}).status_code == 422


def test_invalid_payloads():
    for changes in [
        {"tenure": -1},
        {"monthly_charges": -50},
        {"contract": "Weekly"},
        {"tenure": "twenty-four"},
        {"internet_service": "No"},
    ]:
        assert client.post("/predict", json={**VALID_REQUEST, **changes}).status_code == 422


def test_untrained_model_returns_503(tmp_path, monkeypatch):
    monkeypatch.setenv("CHURN_MODEL_DIR", str(tmp_path / "missing"))
    load_model.cache_clear()
    assert client.get("/ready").status_code == 503
    assert client.post("/predict", json=VALID_REQUEST).status_code == 503
    load_model.cache_clear()


def test_training_then_inference(trained_dir, monkeypatch):
    monkeypatch.setenv("CHURN_MODEL_DIR", str(trained_dir))
    load_model.cache_clear()
    assert client.get("/ready").status_code == 200
    response = client.post("/predict", json=VALID_REQUEST)
    assert response.status_code == 200, response.text
    prediction = response.json()
    assert prediction["prediction"] in (0, 1)
    assert 0 <= prediction["probability"] <= 1
    assert prediction["model_version"] == "2.0.0"
    info = client.get("/model-info").json()
    assert info["train_rows"] + info["test_rows"] == 120
    assert set(info["metrics_test_set"]) >= {"accuracy", "precision", "recall", "f1", "roc_auc"}
    assert "synthetic test fixture" in info["dataset_source"]
    load_model.cache_clear()


def test_malformed_model_metadata_returns_503(trained_dir, monkeypatch):
    """Readiness must not claim a corrupted model is ready."""
    from pathlib import Path

    model_meta_path = Path(trained_dir) / "metadata.json"
    original = json.loads(model_meta_path.read_text())
    monkeypatch.setenv("CHURN_MODEL_DIR", str(trained_dir))
    for changes in [
        {"model_version": None},
        {"threshold": None},
        {"threshold": 9},
        {"threshold": "0.5"},
        {"feature_columns": None},
        {"feature_columns": ["incorrect"]},
    ]:
        model_meta_path.write_text(json.dumps({**original, **changes}))
        load_model.cache_clear()
        assert client.get("/ready").status_code == 503
        assert client.post("/predict", json=VALID_REQUEST).status_code == 503
    model_meta_path.write_text(json.dumps(original))
    load_model.cache_clear()
    assert client.get("/ready").status_code == 200
    load_model.cache_clear()


def test_full_api_schema_validation():
    """Invalid or inconsistent input must be rejected before inference."""
    for changes in [
        {"tenure": 121},
        {"monthly_charges": 251},
        {"monthly_charges": "NaN"},
        {"payment_method": "Crypto"},
        {"senior_citizen": 2},
        {"internet_service": "No", "tech_support": "No internet service"},
    ]:
        assert client.post("/predict", json={**VALID_REQUEST, **changes}).status_code == 422


def test_openapi_docs_are_available():
    assert client.get("/openapi.json").status_code == 200
    assert client.get("/docs").status_code == 200
