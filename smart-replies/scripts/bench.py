"""Measure real wall-clock latency of a running smart-replies service.

    python scripts/bench.py [--url http://localhost:8000] [--runs 30]

Reports mean / p50 / p95 over the runs (first request is a warm-up and is
excluded). This is the number that goes in README.md and the resume bullet --
measure it against the quantized artefact you actually deploy.
"""

from __future__ import annotations

import argparse
import json
import statistics
import time
import urllib.request

TURNS = [
    {"role": "other", "text": "Hey! Want to grab coffee later?"},
    {"role": "me", "text": "Sure, when were you thinking?"},
    {"role": "other", "text": "How about 4 at the usual place?"},
]


def call(url: str) -> tuple[float, dict]:
    data = json.dumps({"turns": TURNS, "n": 3}).encode()
    req = urllib.request.Request(
        f"{url}/suggest-replies", data=data, headers={"Content-Type": "application/json"}
    )
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=120) as res:
        body = json.load(res)
    return (time.perf_counter() - t0) * 1000, body


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8000")
    ap.add_argument("--runs", type=int, default=30)
    args = ap.parse_args()

    _, warm = call(args.url)
    print("warm-up replies:", warm["replies"])

    times = []
    for i in range(args.runs):
        ms, body = call(args.url)
        times.append(ms)
        print(f"run {i + 1:>2}: {ms:7.0f} ms  (service-reported {body['latencyMs']} ms)  {body['replies']}")

    times.sort()
    p95 = times[min(len(times) - 1, int(round(0.95 * len(times))) - 1)]
    print(
        f"\nruns={len(times)}  mean={statistics.mean(times):.0f} ms  "
        f"p50={statistics.median(times):.0f} ms  p95={p95:.0f} ms"
    )


if __name__ == "__main__":
    main()
