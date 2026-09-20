#!/usr/bin/env bash
# Deploy the smart-replies service to Google Cloud Run from source.
# Cloud Build builds the Dockerfile (GGUF baked in), Cloud Run serves it,
# scaling to zero when idle. Free tier covers a demo workload comfortably.
#
#   gcloud auth login                                             # once
#   bash scripts/deploy_cloudrun.sh [region] [project_id]
#   (project_id defaults to $PROJECT, then `gcloud config get-value project`)
set -euo pipefail

REGION="${1:-us-west1}"   # Tier-1 pricing region (free tier applies); next to Render Oregon
PROJECT="${2:-${PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}}"
if [[ -z "$PROJECT" ]]; then
  echo "error: no GCP project. Pass it as the 2nd argument: deploy_cloudrun.sh us-west1 <project_id>" >&2
  exit 1
fi
SERVICE="smart-replies"
MODEL_REPO="${MODEL_REPO:-TanishkDhope/tetherchat-smart-replies}"
MODEL_FILE="${MODEL_FILE:-tetherchat-smart-replies.Q4_K_M.gguf}"

cd "$(dirname "$0")/.."

gcloud services enable --project "$PROJECT" run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

gcloud run deploy "$SERVICE" \
  --project "$PROJECT" \
  --source . \
  --region "$REGION" \
  --platform managed \
  --port 7860 \
  --cpu 2 \
  --memory 1Gi \
  --min-instances 0 \
  --max-instances 1 \
  --concurrency 4 \
  --timeout 60 \
  --cpu-boost \
  --allow-unauthenticated \
  --set-env-vars "MODEL_REPO=${MODEL_REPO},MODEL_FILE=${MODEL_FILE},N_THREADS=2" \
  --set-build-env-vars "MODEL_REPO=${MODEL_REPO},MODEL_FILE=${MODEL_FILE}"

URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)')"
echo
echo "Deployed: $URL"
echo "Set SMART_REPLIES_URL=$URL on the Express server."
