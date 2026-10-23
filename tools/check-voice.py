#!/usr/bin/env python3
"""Transcribe the generated voice masters with VoiceStudio's speech recognizer and list the
clips whose words differ from the expected text (garbled or skipped words, wrong names).

    python3 tools/check-voice.py                 # every clip
    python3 tools/check-voice.py --prefix a/lion/
Regenerate the flagged clips with another seed, e.g.:
    python3 tools/generate-voicestudio-voice.py --only a/lion/fact --seed 11
or let this script do it: --retry 3 tries three other seeds per flagged clip and keeps the take
that matches the text best (the current one stays if no new take is better).
"""
import argparse
import difflib
import importlib.util
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("generator", ROOT / "tools" / "generate-voicestudio-voice.py")
generator = importlib.util.module_from_spec(spec)
sys.argv, argv = sys.argv[:1], sys.argv
spec.loader.exec_module(generator)
sys.argv = argv


def words(text):
    text = unicodedata.normalize("NFD", text.lower().replace("’", "'").replace("œ", "oe"))
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    numbers = dict(zip("1 2 3 4 5 6 7 8 9 10".split(), "un deux trois quatre cinq six sept huit neuf dix".split()))
    return [numbers.get(word, word) for word in re.findall(r"[a-z0-9]+", text)]


def score(backend, key, master):
    reply = json.loads(generator.post_form(f"{backend}/transcribe", {"language": "fr"}, {"audio": master}))
    heard = (reply.get("text") or reply.get("transcript") or "").strip()
    return difflib.SequenceMatcher(None, words(generator.TEXTS[key]), words(heard)).ratio(), heard


def retry(backend, item, attempts):
    """Generate other takes of a flagged clip and keep the one the recognizer understands best."""
    key = item["key"]; master = generator.MASTERS / f"{key}.wav"; best = item["score"]
    reference = generator.REFERENCE_TEXT.read_text(encoding="utf-8").strip()
    for seed in (11, 23, 42, 77, 101)[:attempts]:
        fields = {"text": generator.TEXTS[key], "language": "French", "ref_text": reference, "num_step": 32, "speed": generator.SPEED, "seed": seed}
        data = generator.post_form(f"{backend}/generate", fields, {"ref_audio": generator.REFERENCE})
        candidate = master.with_suffix(".candidate.wav"); candidate.write_bytes(data)
        value, heard = score(backend, key, candidate)
        if value > best:
            best = value; candidate.replace(master); item.update(score=round(value, 2), heard=heard, seed=seed)
        else:
            candidate.unlink()
        if best >= 0.97:
            break
    generator.encode(key)
    return item


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prefix", action="append")
    parser.add_argument("--threshold", type=float, default=0.86)
    parser.add_argument("--retry", type=int, default=0, help="Seeds to try for each flagged clip")
    parser.add_argument("--flagged", action="store_true", help="Only re-check the clips listed in the last report")
    parser.add_argument("--backend", default="http://127.0.0.1:3900")
    parser.add_argument("--report", type=Path, default=ROOT / "voice-masters" / "check-report.json")
    args = parser.parse_args()
    keys = [key for key in generator.TEXTS if not args.prefix or any(key.startswith(p) for p in args.prefix)]
    if args.flagged:
        listed = {item["key"] for item in json.loads(args.report.read_text(encoding="utf-8"))}
        keys = [key for key in keys if key in listed]
    flagged = []
    for index, key in enumerate(keys, 1):
        master = generator.MASTERS / f"{key}.wav"
        if not master.exists():
            continue
        value, heard = score(args.backend, key, master)
        if value < args.threshold:
            item = {"key": key, "score": round(value, 2), "expected": generator.TEXTS[key], "heard": heard}
            if args.retry:
                before = item["score"]; retry(args.backend, item, args.retry)
                print(f"[{index}/{len(keys)}] {key}: {before:.2f} → {item['score']:.2f}", flush=True)
            else:
                print(f"[{index}/{len(keys)}] {value:.2f} {key}\n    attendu : {item['expected']}\n    entendu : {heard}", flush=True)
            flagged.append(item)
    args.report.write_text(json.dumps(flagged, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(flagged)} clip(s) à vérifier sur {len(keys)} — rapport : {args.report.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
