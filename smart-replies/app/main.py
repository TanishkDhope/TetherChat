import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from .generate import MODEL_FILE, MODEL_REPO, generator
from .postprocess import clean_candidates
from .prompt import build_prompt
from .schemas import SuggestRequest, SuggestResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("smart-replies")


@asynccontextmanager
async def lifespan(_: FastAPI):
    generator.load()  # once, at startup — never per request
    yield


app = FastAPI(title="TetherChat Smart Replies", version="1.0.0", lifespan=lifespan)


# Not /healthz: Google's front end intercepts that path on Cloud Run (404 before the container).
@app.get("/health")
def health():
    return {"ok": generator.ready, "model": f"{MODEL_REPO}/{MODEL_FILE}"}


@app.post("/suggest-replies", response_model=SuggestResponse)
def suggest_replies(req: SuggestRequest):
    if not generator.ready:
        raise HTTPException(status_code=503, detail="model loading")
    started = time.perf_counter()
    prompt = build_prompt(req.turns)
    if prompt is None:
        # Last turn is the user's own — nothing to reply to.
        return SuggestResponse(replies=[], latencyMs=0)
    raw = generator.candidates(prompt, req.n)
    replies = clean_candidates(raw, req.n)
    latency_ms = int((time.perf_counter() - started) * 1000)
    log.info("n=%d raw=%d kept=%d latency=%dms", req.n, len(raw), len(replies), latency_ms)
    return SuggestResponse(replies=replies, latencyMs=latency_ms)
