from app.prompt import DEFAULT_SYSTEM, build_prompt, normalize_turns
from app.schemas import Turn


def T(role, text):
    return Turn(role=role, text=text)


def test_single_other_turn_matches_qwen_template():
    prompt = build_prompt([T("other", "Hey! What's up")])
    assert prompt == (
        f"<|im_start|>system\n{DEFAULT_SYSTEM}<|im_end|>\n"
        "<|im_start|>user\nHey! What's up<|im_end|>\n"
        "<|im_start|>assistant\n"
    )


def test_roles_map_other_to_user_and_me_to_assistant():
    prompt = build_prompt([T("other", "Coffee?"), T("me", "Sure!"), T("other", "When?")])
    assert "<|im_start|>user\nCoffee?<|im_end|>\n<|im_start|>assistant\nSure!<|im_end|>\n<|im_start|>user\nWhen?<|im_end|>\n" in prompt
    assert prompt.endswith("<|im_start|>assistant\n")


def test_consecutive_same_role_turns_merge():
    out = normalize_turns([T("other", "hi"), T("other", "you there?"), T("me", "yes"), T("other", "ok")])
    assert [(t.role, t.text) for t in out] == [("other", "hi you there?"), ("me", "yes"), ("other", "ok")]


def test_leading_me_turns_are_dropped():
    out = normalize_turns([T("me", "hello?"), T("me", "anyone?"), T("other", "hi")])
    assert [(t.role, t.text) for t in out] == [("other", "hi")]


def test_no_prompt_when_last_turn_is_mine():
    assert build_prompt([T("other", "hi"), T("me", "hey")]) is None
    assert build_prompt([T("me", "hey")]) is None


def test_whitespace_is_normalised_and_blank_turns_skipped():
    out = normalize_turns([T("other", "  hi \n there  "), T("other", "   ")])
    assert out[0].text == "hi there"


def test_turn_cap_keeps_most_recent_and_starts_on_other():
    turns = []
    for i in range(10):
        turns.append(T("other" if i % 2 == 0 else "me", f"t{i}"))
    turns.append(T("other", "last"))  # 11 turns, ends on other
    out = normalize_turns(turns, max_turns=4)
    assert len(out) <= 4
    assert out[0].role == "other"
    assert out[-1].text == "last"


def test_char_budget_trims_oldest_first():
    turns = [T("other", "a" * 500), T("me", "b" * 500), T("other", "c" * 500)]
    out = normalize_turns(turns, max_chars=600)
    assert [t.text[0] for t in out] == ["c"]
