# Changelog

## v3.0.0 — React dashboard and batch prediction

- Added responsive React dashboard with forms, score charts and confusion matrix.
- Added vectorized `/predict-batch` endpoint with strict per-row input validation and a 500-customer limit.
- Added CSV file parser, valid downloadable template, and safe results CSV export.
- Added Docker Compose deployment (Nginx React frontend + FastAPI backend).
- Added backend batch tests and frontend CSV parser/export tests.
- Preserved V2.0.0 XGBoost training and held-out model metrics — no accuracy improvement claimed.

## v2.0.0 — Reproducible ML API

- Trained XGBoost on checksum-verified IBM Telco sample.
- Exposed FastAPI prediction and real model metadata.
- Added Pydantic input validation, integration tests, and a non-root Docker image.
- Corrected metadata readiness / invalid-model handling.
