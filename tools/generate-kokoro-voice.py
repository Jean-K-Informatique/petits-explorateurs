#!/usr/bin/env python3
"""Create small offline French voice clips with Kokoro's fr-FR pipeline."""
import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

ROOT = Path(__file__).resolve().parents[1]
LINES = json.loads((ROOT / "voice-lines.json").read_text(encoding="utf-8"))
TEXTS = {key: text for name, group in LINES.items() if isinstance(group, dict) and name not in ("names", "named") for key, text in group.items()}
TEXTS["welcome"] = LINES["welcome"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", action="append", help="Generate just these voice keys")
    parser.add_argument("--speed", type=float, default=0.88, help="Gentle, unhurried speech speed")
    args = parser.parse_args()
    keys = args.only or list(TEXTS)
    unknown = set(keys) - set(TEXTS)
    if unknown:
        raise SystemExit(f"Unknown voice keys: {', '.join(sorted(unknown))}")

    pipeline = KPipeline(lang_code="f", device="mps")
    out = ROOT / "assets" / "voice"
    out.mkdir(exist_ok=True)
    for key in keys:
        clips = [np.asarray(audio, dtype=np.float32) for _, _, audio in pipeline(TEXTS[key], voice="ff_siwis", speed=args.speed)]
        if not clips:
            raise RuntimeError(f"Kokoro produced no audio for {key}")
        audio = np.concatenate(clips)
        peak = float(np.max(np.abs(audio)))
        if peak > 0.98:
            audio = audio * (0.98 / peak)
        sf.write(out / f"{key}.wav", audio, 24000, subtype="PCM_16")
        print(f"Saved {key}.wav ({len(audio) / 24000:.1f}s)", flush=True)


if __name__ == "__main__":
    main()
