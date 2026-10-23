#!/usr/bin/env python3
"""Create the French voice clips through a running VoiceStudio backend (OmniVoice).

Lila's timbre comes from a reference clip (tools/lila-reference.wav + its transcript),
so every line is cloned from the same voice and stays consistent across the game.
"""
import argparse
import json
import subprocess
import uuid
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LINES = json.loads((ROOT / "voice-lines.json").read_text(encoding="utf-8"))
NAME_GROUPS = ("names", "named")
TEXTS = {key: text for name, group in LINES.items() if isinstance(group, dict) and name not in NAME_GROUPS for key, text in group.items()}
TEXTS["welcome"] = LINES["welcome"]
# Lines that greet the child: one clip per prepared first name, stored as names/<slug>/<key>.wav.
for slug, spoken in LINES.get("names", {}).items():
    for key, template in LINES.get("named", {}).items():
        TEXTS[f"names/{slug}/{key}"] = template.format(name=spoken)
# Animal worlds (content/animals.json): theme intro/outro in t/<theme>/, animal lines in a/<id>/.
ANIMALS = json.loads((ROOT / "content" / "animals.json").read_text(encoding="utf-8"))
for theme in ANIMALS["themes"]:
    TEXTS[f"t/{theme['id']}/intro"] = theme["intro"]
    TEXTS[f"t/{theme['id']}/outro"] = theme["outro"]
    for animal in theme["animals"]:
        base = f"a/{animal['id']}"
        for kind in ("prompt", "yes", "name"):
            for index, template in enumerate(ANIMALS["lines"][kind], 1):
                TEXTS[f"{base}/{kind}-{index}"] = template.format(**animal)
        for index, hint in enumerate(animal["hints"], 1):
            TEXTS[f"{base}/hint-{index}"] = hint
        TEXTS[f"{base}/fact"] = animal["fact"]
        TEXTS[f"{base}/puzzle"] = ANIMALS["lines"]["puzzle"].format(**animal)
# Lila speaks slowly and calmly for young children (1.0 is the engine's natural pace).
SPEED = 0.8
MASTERS = ROOT / "voice-masters"
GAME_AUDIO = ROOT / "assets" / "voice"
REFERENCE = ROOT / "tools" / "lila-reference.wav"
REFERENCE_TEXT = ROOT / "tools" / "lila-reference.txt"


def post_form(url, fields, files):
    boundary = uuid.uuid4().hex
    body = bytearray()
    for name, value in fields.items():
        if value is None:
            continue
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
    for name, path in files.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{path.name}"\r\nContent-Type: audio/wav\r\n\r\n'.encode()
        body += path.read_bytes() + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    request = urllib.request.Request(url, data=bytes(body), headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(request, timeout=600) as response:
        return response.read()


def encode(key):
    """Compress a WAV master into the AAC clip the game plays (about 8x smaller)."""
    destination = GAME_AUDIO / f"{key}.m4a"
    destination.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "48000", "-q", "127", str(MASTERS / f"{key}.wav"), str(destination)], check=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", action="append", help="Generate just these voice keys")
    parser.add_argument("--name", action="append", help="Generate just the lines for these first-name slugs (see \"names\")")
    parser.add_argument("--prefix", action="append", help="Generate just the keys starting with this (e.g. a/lion/ or t/)")
    parser.add_argument("--missing", action="store_true", help="Skip lines whose clip already exists")
    parser.add_argument("--backend", default="http://127.0.0.1:3900")
    parser.add_argument("--speed", type=float, default=SPEED, help="Speech speed (default: Lila's calm pace)")
    parser.add_argument("--steps", type=int, default=32, help="More steps give cleaner audio")
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--encode-only", action="store_true", help="Re-encode the existing masters without calling VoiceStudio")
    args = parser.parse_args()
    keys = args.only or []
    for slug in args.name or []:
        keys += [key for key in TEXTS if key.startswith(f"names/{slug}/")] or [f"names/{slug}/"]
    for prefix in args.prefix or []:
        keys += [key for key in TEXTS if key.startswith(prefix)] or [prefix]
    keys = keys or list(TEXTS)
    if args.missing:
        keys = [key for key in keys if not (MASTERS / f"{key}.wav").exists()]
    if args.encode_only:
        for key in keys:
            if (MASTERS / f"{key}.wav").exists():
                encode(key)
        print(f"Encoded {len(keys)} clips")
        return
    unknown = set(keys) - set(TEXTS)
    if unknown:
        raise SystemExit(f"Unknown voice keys: {', '.join(sorted(unknown))}")
    if not REFERENCE.exists():
        raise SystemExit(f"Missing reference clip {REFERENCE.relative_to(ROOT)}")

    for done, key in enumerate(keys, 1):
        fields = {
            "text": TEXTS[key], "language": "French", "ref_text": REFERENCE_TEXT.read_text(encoding="utf-8").strip(),
            "num_step": args.steps, "speed": args.speed, "seed": args.seed,
        }
        # OmniVoice already answers with the game's format: 24 kHz mono 16-bit WAV.
        data = post_form(f"{args.backend}/generate", fields, {"ref_audio": REFERENCE})
        if data[:4] != b"RIFF":
            raise RuntimeError(f"VoiceStudio returned no audio for {key}: {data[:200]!r}")
        destination = MASTERS / f"{key}.wav"
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        encode(key)
        print(f"[{done}/{len(keys)}] Saved {key}.wav", flush=True)


if __name__ == "__main__":
    main()
