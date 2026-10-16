"""Customer churn demo API with single-customer and bounded batch inference."""
from fastapi import FastAPI, HTTPException

from app.ml_service import (
    ModelUnavailable, load_model, model_info, predict_batch_churn, predict_churn,
)
from app.schemas import BatchRequest, BatchResponse, ChurnRequest, ChurnResponse

app = FastAPI(
    title="Customer Churn Prediction API",
    description="Educational XGBoost inference API trained on IBM Telco sample data.",
    version="3.0.0",
)


def make_response(prediction: int, probability: float, version: str) -> ChurnResponse:
    return ChurnResponse(
        prediction=prediction,
        probability=probability,
        message="Higher churn risk" if prediction else "Lower churn risk",
        model_version=version,
    )


@app.get("/")
def root():
    return {"message": "Customer Churn API with dashboard", "documentation": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ready")
def ready():
    try:
        load_model()
    except ModelUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    return {"status": "ready"}


@app.get("/model-info")
def get_model_info():
    try:
        return model_info()
    except ModelUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.post("/predict", response_model=ChurnResponse)
def predict(request: ChurnRequest):
    try:
        label, probability, version = predict_churn(request.model_dump())
    except ModelUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    return make_response(label, probability, version)


@app.post("/predict-batch", response_model=BatchResponse)
def predict_batch(request: BatchRequest):
    """Up to 500 customers in a single request; no CSV data is persisted."""
    try:
        outputs, version = predict_batch_churn(
            [customer.model_dump() for customer in request.customers]
        )
    except ModelUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    results = [make_response(label, probability, version) for label, probability in outputs]
    high_risk = sum(response.prediction for response in results)
    return BatchResponse(
        total=len(results), high_risk=high_risk,
        low_risk=len(results) - high_risk, model_version=version,
        results=results,
    )
