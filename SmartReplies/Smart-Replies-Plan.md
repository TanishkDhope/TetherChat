# Smart Replies for Tether Chat — Implementation Plan

*A 1-week plan: prompted baseline → LoRA fine-tune → evaluation → deployment → UI. Written to be followed top to bottom.*

---

## 0. The decision this plan is built on

Before touching a GPU: build a prompted baseline (few-shot prompt on the same base model) first, and evaluate it against a rule-based baseline. Fine-tune regardless of the outcome — but now you can report a genuine **three-way comparison** (rule-based → prompted → fine-tuned), which is a stronger resume/interview story than either extreme alone. The concrete reason fine-tuning is still worth doing even if prompting scores fine on quality: **inference cost**. A few-shot prompt means every CPU inference call carries the system prompt + examples in context — more input tokens, more latency. Fine-tuning bakes the behavior into the weights, so the runtime prompt is just the raw conversation, which matters a lot when you have no GPU for inference.

---

## 1. Model

**Primary pick: [`Qwen/Qwen2.5-0.5B-Instruct`](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct)**
**Leaner fallback if latency is still too high after quantizing: [`HuggingFaceTB/SmolLM2-360M-Instruct`](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct)**

### Why this class of model, not DialoGPT
- Both are modern (2024–2025-era) instruction-tuned models trained on much larger, cleaner corpora than DialoGPT (which is a 2019 GPT-2 checkpoint fine-tuned only on Reddit). They're meaningfully more coherent per parameter.
- They're already instruction-tuned to follow a "given X, produce Y" framing, which maps directly onto "given conversation context, produce a short reply" — less fine-tuning needed to get on-topic, short output.
- Apache-2.0 licensed, no gating on Hugging Face — no waiting on access requests, unlike Llama 3.2's gated license.

### Why sub-1B specifically
You have no local GPU and are targeting either local CPU inference or Hugging Face's free CPU tier. Community-reported CPU benchmarks for int4-quantized versions of these exact checkpoints show roughly 12–30 tokens/sec on ordinary CPU hardware — treat this as a rough sanity check, not a guarantee, and measure your own latency once you've fine-tuned (see §4). A 7B+ model would not hit interactive latency on CPU without dedicated hardware.

---

## 2. Dataset

**[DailyDialog](https://huggingface.co/datasets/li2017dailydialog/daily_dialog)** — ~11,118 training dialogues, ~87k utterances, human-written multi-turn casual conversation, English.

- **License: CC BY-NC-SA 4.0** — non-commercial, share-alike. Fine for a portfolio/demo project; note it explicitly in your repo README so it's clear the dataset choice was a deliberate, license-aware decision (a good small credibility signal).
- The canonical HF page uses a loading script that now requires `trust_remote_code=True` and has the dataset viewer disabled. If that's friction, there's a plain CSV mirror at [`frankdarkluo/DailyDialog`](https://huggingface.co/datasets/frankdarkluo/DailyDialog) that loads directly with `pandas`/`datasets` — no custom code needed.

### Preprocessing target
Turn each dialogue into `(context, reply)` pairs:
- `context` = last 1–3 turns of a dialogue, joined with a clear turn separator
- `reply` = the next turn (the label)
- Slide a window across each dialogue so a single conversation yields multiple training examples
- Filter out replies that are extremely short (single-token acknowledgements skew the model toward always producing those) or extremely long (defeats the "short reply chip" UX)

This is enough data for LoRA adaptation of style/domain — it is **not** enough to train a model from scratch, which is exactly why the plan starts from a pretrained instruct model rather than random init.

---

## 3. Fine-tuning approach: LoRA, via Unsloth on Colab

### Why LoRA, not a full fine-tune
- **Less overfitting risk** on a ~13k-dialogue dataset — full fine-tuning risks degrading the base model's general fluency; LoRA only updates a small set of low-rank adapter weights, leaving the base model's coherence intact.
- **Faster on a free Colab T4** — training finishes in well under an hour for a dataset this size, versus multi-hour full fine-tunes that risk dying mid-run when Colab's free tier disconnects on inactivity.
- **Small, portable artifact** — a LoRA adapter is a few MB, versionable separately from the base weights, and can be merged into a single deployable checkpoint when you're ready.
- It's also a legitimate technical talking point for an interview (rank, target modules, why LoRA over full fine-tuning) — a stronger answer than "I fine-tuned all the weights."

### Why Unsloth specifically (not just raw PEFT)
[Unsloth](https://github.com/unslothai/unsloth) is a fine-tuning library built for exactly this scenario — it reports ~2× faster training and ~70% less VRAM than the standard Hugging Face `Trainer` + PEFT combination, via custom CUDA kernels, which matters when your only compute is a free Colab T4. It's a thin layer on top of `transformers`/`peft`, so you still learn the underlying concepts.

### Suggested starting hyperparameters
| Parameter | Value | Why |
|---|---|---|
| LoRA rank (`r`) | 8–16 | Enough capacity for a style/domain shift; higher risks overfitting the small dataset |
| `lora_alpha` | 16–32 (≈2× rank) | Standard scaling convention |
| Target modules | `q_proj`, `v_proj` (or `all-linear` if time allows experimenting) | Attention projections are the standard LoRA target; `all-linear` is worth an ablation if you have a spare hour |
| Epochs | 2–3 | DailyDialog is small; more risks memorization |
| Learning rate | 1e-4 to 2e-4 | Typical LoRA range, higher than full fine-tuning LRs |
| Batch size | As large as fits on T4, use gradient accumulation to simulate a larger effective batch | T4 has 16GB VRAM — comfortable for a sub-1B model even without 4-bit loading |

### Workflow
1. Open a Colab notebook, connect to a T4 runtime.
2. `pip install unsloth` (see [Unsloth's Colab install guide](https://docs.unsloth.ai/get-started/installing-+-updating)).
3. Load the base model + tokenizer via Unsloth's `FastLanguageModel.from_pretrained`.
4. Apply a `LoraConfig` (rank/alpha/target modules above) via Unsloth's `get_peft_model` wrapper.
5. Load and preprocess DailyDialog into `(context, reply)` pairs; format with the model's chat template (`tokenizer.apply_chat_template`).
6. Train with `SFTTrainer` (from `trl`) using the hyperparameters above.
7. Save the adapter (`model.save_pretrained("smart-replies-lora")`), then merge into the base weights for a single deployable checkpoint (`model.merge_and_unload()` if using vanilla PEFT, or Unsloth's equivalent merge/export call).
8. Push the merged model to your **own** Hugging Face Hub repo (`model.push_to_hub("your-username/tetherchat-smart-replies")`) — this becomes both your deployment target and a visible portfolio artifact.

---

## 4. Evaluation

Run all three conditions through the same harness:
1. **Rule-based baseline** — your original keyword-triggered canned replies
2. **Prompted-only baseline** — the base instruct model + your few-shot prompt, no fine-tuning
3. **Fine-tuned model** — the LoRA-adapted checkpoint

### Metrics
- **Held-out perplexity** on a DailyDialog validation split (only meaningful for the fine-tuned model vs. its own training, not comparable across the rule-based baseline).
- **Rubric scoring** — hand-score ~30 held-out context/reply pairs per condition on a simple 1–5 scale for coherence and relevance. Keep the rubric written down (even 2–3 sentences per score level) so it's defensible if asked how you scored it.
- **Latency** — measure real wall-clock generation time on CPU (mean and p95 over ~30 runs), for the final quantized deployment artifact specifically, not the raw fp16 checkpoint. Don't estimate this — measure it, since it's the number you'll actually put in a resume bullet.

---

## 5. Deployment

### Quantize for CPU inference
Don't deploy fp16 weights for CPU serving — it will feel sluggish for a "live suggestion" UX. Two reasonable paths:
- **8-bit via `bitsandbytes`** — minimal code change, decent quality/speed tradeoff, easiest to integrate directly into the FastAPI service.
- **GGUF export + `llama.cpp`/`ctransformers`** — more setup, but noticeably faster CPU generation if the 8-bit path isn't fast enough. Worth trying only if you have slack time after the core plan is done.

### Serving
Mirror your TransitOps pattern: a FastAPI microservice wrapping the model, containerized, sitting behind the Express gateway.
- `POST /suggest-replies` — takes the last 1–3 messages, returns N candidate replies (sampled with top-k/nucleus sampling, then de-duplicated — use simple n-gram/Jaccard overlap for dedup rather than a second embedding model, to keep the service lightweight and fast).
- Load the model once at service startup, not per-request.

### Hosting
- Deploy the container to **Hugging Face Spaces' free CPU tier** (Docker SDK) — gives you a real, shareable deployment link for the resume/README.
- Free tiers cold-start after inactivity. For an interview demo specifically, don't rely on the hosted version being warm on demand — warm it up a few minutes before the call, and keep a **local fallback** (run the FastAPI service on your own machine) ready to screen-share if the hosted one is asleep.

---

## 6. UI integration

- Render N suggested replies as tappable chips above the message input in `Chat.jsx`.
- Tapping a chip either fills the input (safer default) or sends immediately (riskier — confirm this is actually the UX you want before wiring send-on-tap).
- While you're touching `Chat.jsx` for this, it's a good moment to also fix the message-ID collision bug flagged in your project notes (`id = Date.now()` → swap for `nanoid()`), since it's adjacent code and a one-line change.

---

## 7. Learning resources

**Fine-tuning fundamentals**
- [Hugging Face PEFT docs — Quicktour](https://huggingface.co/docs/peft/quicktour) — the core LoRA/PEFT API you'll actually be calling
- [LoRA paper (Hu et al., 2021)](https://arxiv.org/abs/2106.09685) — worth skimming even just the abstract + method section for interview-ready understanding of *why* low-rank adaptation works
- [Hugging Face NLP Course — Chapter 3: Fine-tuning a pretrained model](https://huggingface.co/learn/nlp-course/en/chapter3/1) — free, hands-on, covers the `Trainer` API and a custom training loop

**Colab-specific / speed**
- [Unsloth GitHub](https://github.com/unslothai/unsloth) and [install guide](https://docs.unsloth.ai/get-started/installing-+-updating)
- [Unsloth's example notebooks repo](https://github.com/unslothai/notebooks) — has ready-to-run Colab notebooks for LoRA fine-tuning small models on a free T4

**Model-specific docs**
- [SmolLM2 repo](https://github.com/huggingface/smollm) — pretraining, post-training, and local inference code straight from the model's authors
- [Qwen docs](https://qwen.readthedocs.io) — covers fine-tuning workflows including Unsloth integration for the Qwen family

---

## 8. Day-by-day schedule

| Day | Focus |
|---|---|
| 1 (half-day) | Build and eval the prompted-only baseline — quick, no GPU needed |
| 1–2 | Preprocess DailyDialog into context/reply pairs; set up the Colab notebook, get LoRA fine-tuning running |
| 2 | Finish fine-tuning, merge adapter, push to your HF Hub repo |
| 3 | Evaluation: perplexity, rubric scoring across all 3 conditions, write results down |
| 4 | Quantize, build the FastAPI service (mirror TransitOps), containerize, measure real CPU latency |
| 5 | Deploy to HF Spaces; UI chips in `Chat.jsx`; fix the message-ID bug while you're in that file |
| 6 | Scope the video-call signaling to `roomId` instead of broadcast — the one existing bug that can visibly break during a live multi-person demo |
| 7 | README/model card for the feature (model, dataset, metrics, latency), update resume bullet, rehearse the walkthrough, buffer |

---

## 9. Resume bullet — fill in once you have real numbers

> Fine-tuned Qwen2.5-0.5B-Instruct with LoRA (PEFT/Unsloth) for context-aware reply suggestions on DailyDialog; evaluated against rule-based and prompted baselines using held-out perplexity and rubric scoring; served via a quantized, containerized FastAPI microservice at **[X]ms** average CPU latency.

Only commit to the latency and eval numbers once you've actually measured them (§4) — an interviewer is more likely to ask "how did you measure that" than to challenge the number itself, so make sure you can answer both.
