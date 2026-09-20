"""llama.cpp backend: load the GGUF once, sample N candidate replies."""

from __future__ import annotations

import logging
import os
import threading
from pathlib import Path

log = logging.getLogger("smart-replies")

MODEL_REPO = os.environ.get("MODEL_REPO", "TanishkDhope/tetherchat-smart-replies")
MODEL_FILE = os.environ.get("MODEL_FILE", "tetherchat-smart-replies.Q4_K_M.gguf")
MODEL_PATH = os.environ.get("MODEL_PATH")  # explicit local path wins
N_THREADS = int(os.environ.get("N_THREADS", "0")) or (os.cpu_count() or 2)
N_CTX = int(os.environ.get("N_CTX", "1024"))

# Sampling defaults mirror the repo's generation_config.json so the service
# behaves like the Colab smoke test in the fine-tuning notebook.
SAMPLING = dict(temperature=0.7, top_k=20, top_p=0.8, repeat_penalty=1.1)
MAX_TOKENS = 20  # ~15 words; longer completions fail the 14-word filter anyway
STOP = ["<|im_end|>", "<|endoftext|>", "\n"]
EXTRA_CANDIDATES = 1  # over-generate so dedupe still leaves n replies (2 pushed p95 past the 8 s proxy timeout)


def resolve_model_path() -> Path:
    if MODEL_PATH:
        return Path(MODEL_PATH)
    from huggingface_hub import hf_hub_download

    return Path(hf_hub_download(repo_id=MODEL_REPO, filename=MODEL_FILE))


class Generator:
    """Owns the llama.cpp handle. `Llama` is not thread-safe, so every call
    is serialised through a lock; FastAPI runs the sync endpoint in its
    threadpool, which keeps the event loop free for /health."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._llm = None
        self.model_path: Path | None = None

    def load(self) -> None:
        from llama_cpp import Llama

        self.model_path = resolve_model_path()
        log.info("loading %s (threads=%d, n_ctx=%d)", self.model_path, N_THREADS, N_CTX)
        self._llm = Llama(
            model_path=str(self.model_path),
            n_ctx=N_CTX,
            n_threads=N_THREADS,
            n_batch=256,
            verbose=False,
        )
        log.info("model ready")

    @property
    def ready(self) -> bool:
        return self._llm is not None

    def candidates(self, prompt: str, n: int) -> list[str]:
        """One greedy completion plus `n + EXTRA_CANDIDATES` sampled ones.
        llama.cpp reuses the KV cache for the shared prompt prefix, so only
        the first call pays the prompt-eval cost."""
        assert self._llm is not None, "model not loaded"
        outs: list[str] = []
        with self._lock:
            outs.append(self._complete(prompt, temperature=0.0))
            for _ in range(n + EXTRA_CANDIDATES):
                outs.append(self._complete(prompt, **SAMPLING))
        return outs

    def _complete(self, prompt: str, **sampling) -> str:
        res = self._llm(prompt, max_tokens=MAX_TOKENS, stop=STOP, **sampling)
        return res["choices"][0]["text"]


generator = Generator()
