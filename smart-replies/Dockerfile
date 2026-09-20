# Container image for the smart-replies service (Cloud Run; also works on any
# Docker host). Runs as a non-root user and listens on port 7860.
FROM python:3.11-slim

ARG MODEL_REPO=TanishkDhope/tetherchat-smart-replies
ARG MODEL_FILE=tetherchat-smart-replies.Q4_K_M.gguf

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/home/user/.cache/huggingface \
    HF_HUB_DISABLE_TELEMETRY=1 \
    MODEL_REPO=${MODEL_REPO} \
    MODEL_FILE=${MODEL_FILE}

RUN useradd -m -u 1000 user
WORKDIR /app

COPY requirements.txt .
# Prebuilt CPU wheels avoid compiling llama.cpp on the free builder.
RUN pip install --no-cache-dir -r requirements.txt \
      --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu

# Bake the GGUF into the image so a cold start only loads from disk.
USER user
RUN python -c "from huggingface_hub import hf_hub_download as d; import os; d(os.environ['MODEL_REPO'], os.environ['MODEL_FILE'])"

COPY --chown=user app ./app

EXPOSE 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
