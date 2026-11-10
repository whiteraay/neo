FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DEFAULT_TIMEOUT=120 PIP_RETRIES=10
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libgl1 libglib2.0-0 fonts-dejavu-core tesseract-ocr tesseract-ocr-rus tesseract-ocr-kaz && rm -rf /var/lib/apt/lists/*

# SLIM=1 (small-quota servers): drop the shap package (xgboost computes the same TreeSHAP values, services/shap_service.py),
# bundled test suites and bytecode caches — in the same layer, so the space is really saved.
ARG SLIM=0
COPY requirements.txt .
RUN pip install -r requirements.txt \
 && if [ "$SLIM" = "1" ]; then \
      pip uninstall -y shap numba llvmlite slicer \
      && find /usr/local/lib/python3.11/site-packages -type d -name tests -prune -exec rm -rf {} + \
      && find /usr/local/lib/python3.11 -type d -name __pycache__ -prune -exec rm -rf {} + ; \
    fi

COPY . .
RUN mkdir -p /app/artifacts

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
