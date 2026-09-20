"""Clean raw model completions into short, distinct, sendable reply chips."""

from __future__ import annotations

import re

MAX_WORDS = 14

# DailyDialog is whitespace-tokenised ("Nothing much . How about you ?",
# "it ’ s"), and the fine-tuned model faithfully reproduces that spacing.
_DETOK_RULES = [
    (re.compile(r"\s+([.,!?;:])"), r"\1"),          # "much ." -> "much."
    (re.compile(r"\s*[’']\s*(s|t|re|ve|ll|d|m)\b", re.I), r"'\1"),  # "it ’ s" -> "it's"
    (re.compile(r"\s+n[’']t\b"), "n't"),             # "do n't" -> "don't"
    (re.compile(r"[’']"), "'"),
    (re.compile(r"\(\s+"), "("),
    (re.compile(r"\s+\)"), ")"),
    (re.compile(r"\s{2,}"), " "),
]


def detokenize(text: str) -> str:
    out = text.strip()
    for pattern, repl in _DETOK_RULES:
        out = pattern.sub(repl, out)
    out = out.strip()
    if out:
        out = out[0].upper() + out[1:]
    return out


def is_acceptable(text: str) -> bool:
    if not text:
        return False
    if "<|" in text or "|>" in text:
        return False
    return len(text.split()) <= MAX_WORDS


def _words(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9']+", text.lower()))


def jaccard(a: str, b: str) -> float:
    wa, wb = _words(a), _words(b)
    if not wa and not wb:
        return 1.0
    return len(wa & wb) / len(wa | wb)


def dedupe(candidates: list[str], threshold: float = 0.6) -> list[str]:
    kept: list[str] = []
    for c in candidates:
        if all(jaccard(c, k) < threshold for k in kept):
            kept.append(c)
    return kept


def clean_candidates(raw: list[str], n: int) -> list[str]:
    cleaned = [detokenize(r) for r in raw]
    cleaned = [c for c in cleaned if is_acceptable(c)]
    return dedupe(cleaned)[:n]
