"""Turn a list of chat turns into the exact ChatML prompt the model was trained on.

Training (SmartReplies/SmartReplies_Qwen_Finetuning.ipynb) called
``tokenizer.apply_chat_template(messages)`` on DailyDialog with even turns as
``user`` and odd turns as ``assistant`` and *no* system message, so Qwen's
template injected its default system prompt. We reproduce that byte-for-byte:
the other person speaks as ``user``, the app user speaks as ``assistant``, and
the prompt ends with an open assistant turn.
"""

from __future__ import annotations

from .schemas import Turn

DEFAULT_SYSTEM = "You are Qwen, created by Alibaba Cloud. You are a helpful assistant."
ROLE_MAP = {"other": "user", "me": "assistant"}

MAX_TURNS = 6
MAX_CHARS = 1200


def normalize_turns(turns: list[Turn], max_turns: int = MAX_TURNS, max_chars: int = MAX_CHARS) -> list[Turn]:
    """Collapse the raw turns into a strictly alternating, bounded transcript.

    - consecutive turns from the same side are merged into one
    - leading ``me`` turns are dropped (training dialogs always open with ``user``)
    - only the last ``max_turns`` merged turns / ``max_chars`` characters are kept
    - returns [] if nothing is left or the last turn is not ``other``
    """
    merged: list[Turn] = []
    for t in turns:
        text = " ".join(t.text.split())
        if not text:
            continue
        if merged and merged[-1].role == t.role:
            merged[-1] = Turn(role=t.role, text=f"{merged[-1].text} {text}")
        else:
            merged.append(Turn(role=t.role, text=text))

    while merged and merged[0].role != "other":
        merged.pop(0)

    if not merged or merged[-1].role != "other":
        return []

    merged = merged[-max_turns:]
    # Trim from the oldest end until we fit the character budget, keeping
    # alternation intact by always starting on an "other" turn.
    while len(merged) > 1 and sum(len(t.text) for t in merged) > max_chars:
        merged.pop(0)
    while merged and merged[0].role != "other":
        merged.pop(0)
    return merged


def build_prompt(turns: list[Turn]) -> str | None:
    """Return the ChatML prompt, or None when there is nothing to reply to."""
    normalized = normalize_turns(turns)
    if not normalized:
        return None
    parts = [f"<|im_start|>system\n{DEFAULT_SYSTEM}<|im_end|>\n"]
    for t in normalized:
        parts.append(f"<|im_start|>{ROLE_MAP[t.role]}\n{t.text}<|im_end|>\n")
    parts.append("<|im_start|>assistant\n")
    return "".join(parts)
