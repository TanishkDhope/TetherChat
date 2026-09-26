from unittest.mock import MagicMock

from app.generate import EXTRA_CANDIDATES, Generator


def test_generator_early_stops_when_n_candidates_found():
    gen = Generator()
    gen._llm = MagicMock()

    # Provide 5 outputs, but with n=3, it should stop after the first 3
    completions = [
        "Sure ! What time ?",          # 1: greedy (accepted -> "Sure! What time?")
        "Sorry , I ' m busy .",        # 2: sampled (accepted -> "Sorry, I'm busy.")
        "I ' d love to come !",        # 3: sampled (accepted -> "I'd love to come!")
        "That sounds great !",         # 4: should NOT be called
        "Count me in !",               # 5: should NOT be called
    ]
    gen._complete = MagicMock(side_effect=completions)

    results = gen.candidates("dummy prompt", n=3)

    assert results == [
        "Sure! What time?",
        "Sorry, I'm busy.",
        "I'd love to come!",
    ]
    # Exactly 3 completions should be requested (1 greedy + 2 sampled), not 5
    assert gen._complete.call_count == 3


def test_generator_filters_unacceptable_and_continues():
    gen = Generator()
    gen._llm = MagicMock()

    completions = [
        "<|im_start|>garbage",         # greedy: unacceptable
        "Sure ! What time ?",          # sampled 1: accepted
        "word " * 20,                  # sampled 2: unacceptable (>14 words)
        "Sorry , I ' m busy .",        # sampled 3: accepted
        "Count me in !",               # sampled 4: accepted -> reaches n=3
    ]
    gen._complete = MagicMock(side_effect=completions)

    results = gen.candidates("dummy prompt", n=3)

    assert results == [
        "Sure! What time?",
        "Sorry, I'm busy.",
        "Count me in!",
    ]
    assert gen._complete.call_count == 5


def test_generator_dedupes_similar_candidates():
    gen = Generator()
    gen._llm = MagicMock()

    completions = [
        "Sounds good .",               # greedy (accepted)
        "Sounds good !",               # sampled 1: duplicate (jaccard == 1.0, discarded)
        "sounds really good",          # sampled 2: duplicate (high jaccard, discarded)
        "Sorry , I can ' t make it .", # sampled 3: accepted
        "Maybe another time !",        # sampled 4: accepted -> reaches n=3
    ]
    gen._complete = MagicMock(side_effect=completions)

    results = gen.candidates("dummy prompt", n=3)

    assert results == [
        "Sounds good.",
        "Sorry, I can't make it.",
        "Maybe another time!",
    ]
    assert gen._complete.call_count == 5


def test_generator_respects_max_attempts():
    gen = Generator()
    gen._llm = MagicMock()

    # All completions are duplicates of the first
    completions = ["Sounds good ."] * 10
    gen._complete = MagicMock(side_effect=completions)

    results = gen.candidates("dummy prompt", n=3)

    assert results == ["Sounds good."]
    # greedy (1) + up to (n + EXTRA_CANDIDATES = 4) sampled = 5 total attempts
    assert gen._complete.call_count == 1 + 3 + EXTRA_CANDIDATES


def test_generator_n1_stops_after_greedy():
    gen = Generator()
    gen._llm = MagicMock()
    gen._complete = MagicMock(return_value="Yes , definitely !")

    results = gen.candidates("dummy prompt", n=1)

    assert results == ["Yes, definitely!"]
    assert gen._complete.call_count == 1
