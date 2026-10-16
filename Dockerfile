FROM python:3.11-slim

WORKDIR /code
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    OMP_NUM_THREADS=2

RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ ./app/
COPY train.py ./train.py

# Reproducible build from a clean checkout: download verified IBM sample CSV,
# fit the model, and package artifacts into the resulting image.
# A network connection is needed at BUILD time, not at RUNTIME.
RUN python train.py && rm -rf data/

RUN useradd --create-home --shell /usr/sbin/nologin appuser \
    && chown -R appuser:appuser /code
USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
