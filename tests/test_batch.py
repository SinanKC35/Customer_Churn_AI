"""Batch predictions, boundary handling, validation and regression tests."""
from fastapi.testclient import TestClient
from app.main import app
from app.ml_service import load_model
from tests.test_api import VALID_REQUEST

client = TestClient(app)


def test_batch_matches_single_prediction(trained_dir, monkeypatch):
    monkeypatch.setenv("CHURN_MODEL_DIR", str(trained_dir))
    load_model.cache_clear()
    request = {"customers": [VALID_REQUEST, {**VALID_REQUEST, "tenure": 60}]}
    result = client.post("/predict-batch", json=request)
    assert result.status_code == 200, result.text
    body = result.json()
    assert body["total"] == 2
    assert body["high_risk"] + body["low_risk"] == 2
    assert body["model_version"] == "2.0.0"
    for customer, prediction in zip(request["customers"], body["results"]):
        response = client.post("/predict", json=customer)
        assert response.status_code == 200
        assert response.json() == prediction
    load_model.cache_clear()


def test_batch_rejects_empty_and_oversized_requests():
    assert client.post("/predict-batch", json={"customers": []}).status_code == 422
    assert client.post("/predict-batch", json={"customers": [VALID_REQUEST] * 501}).status_code == 422


def test_batch_rejects_invalid_row():
    response = client.post("/predict-batch", json={
        "customers": [VALID_REQUEST, {**VALID_REQUEST, "monthly_charges": -3}]
    })
    assert response.status_code == 422
    assert any(1 in error["loc"] for error in response.json()["detail"])


def test_batch_untrained_returns_503(tmp_path, monkeypatch):
    monkeypatch.setenv("CHURN_MODEL_DIR", str(tmp_path / "missing"))
    load_model.cache_clear()
    assert client.post("/predict-batch", json={"customers": [VALID_REQUEST]}).status_code == 503
    load_model.cache_clear()
