from app.postprocess import clean_candidates, dedupe, detokenize, is_acceptable, jaccard


def test_detokenize_dailydialog_spacing():
    assert detokenize("Nothing much . How about you ?") == "Nothing much. How about you?"
    assert detokenize("I think it ’ s fine , thanks !") == "I think it's fine, thanks!"
    assert detokenize("i do n't know .") == "I don't know."
    assert detokenize("Sure ! What time do you want me there ?") == "Sure! What time do you want me there?"


def test_detokenize_capitalises_first_char_and_collapses_spaces():
    assert detokenize("  okay   then  ") == "Okay then"


def test_acceptable_filters_empty_long_and_special_tokens():
    assert not is_acceptable("")
    assert not is_acceptable("<|im_start|>user")
    assert not is_acceptable(" ".join(["word"] * 15))
    assert is_acceptable("Sounds good to me.")


def test_jaccard_and_dedupe():
    assert jaccard("sure, sounds good", "Sure sounds good!") == 1.0
    kept = dedupe(["Sounds good.", "Sounds good!", "Sorry, I can't make it.", "sounds really good"])
    assert kept == ["Sounds good.", "Sorry, I can't make it."]


def test_clean_candidates_end_to_end():
    raw = [
        "Sure ! What time ?",
        "sure , what time ?",
        "<|im_start|>garbage",
        "Sorry , I ' m busy today .",
        "I ’ d love to !",
    ]
    assert clean_candidates(raw, 3) == ["Sure! What time?", "Sorry, I'm busy today.", "I'd love to!"]
