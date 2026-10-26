"""How much talking is in a clip: none / some / lots.

Uses faster-whisper on the Mac (local, nothing uploaded). If it isn't installed,
falls back to an audio-energy estimate, which can't tell talking from music, and
says so in the result.
"""
from __future__ import annotations

import subprocess
import threading
from pathlib import Path

WINDOW_SECONDS = 180  # transcribe up to the first 3 minutes for the speech level

_model = None
_model_name = None
_lock = threading.Lock()


def whisper_available() -> bool:
    try:
        import faster_whisper  # noqa: F401
        return True
    except ImportError:
        return False


def level(ratio: float, thresholds: dict) -> str:
    if ratio >= thresholds.get("lots", 0.40):
        return "lots"
    if ratio >= thresholds.get("some", 0.05):
        return "some"
    return "none"


def analyze(path: Path, duration: float | None, has_audio: bool, settings: dict) -> dict:
    if not has_audio:
        return {"level": "none", "ratio": 0.0, "transcript": "", "engine": "no audio track"}
    if whisper_available():
        result = _whisper(path, duration, settings.get("whisper_model", "small"))
    else:
        result = _energy(path, duration)
    result["level"] = level(result["ratio"], settings["speech_thresholds"])
    return result


def _get_model(name: str):
    global _model, _model_name
    from faster_whisper import WhisperModel
    if _model is None or _model_name != name:
        _model = WhisperModel(name, device="cpu", compute_type="int8")
        _model_name = name
    return _model


def _whisper(path: Path, duration: float | None, model_name: str) -> dict:
    with _lock:  # one transcription at a time keeps the Mac responsive
        model = _get_model(model_name)
        segments, info = model.transcribe(str(path), vad_filter=True, beam_size=1)
        window = min(duration or WINDOW_SECONDS, WINDOW_SECONDS)
        talk = 0.0
        texts = []
        for seg in segments:  # lazy generator: stop once past the window
            if seg.start >= window:
                break
            if seg.no_speech_prob < 0.6 and seg.avg_logprob > -1.0 and seg.text.strip():
                talk += min(seg.end, window) - seg.start
                texts.append(seg.text.strip())
    ratio = max(0.0, min(1.0, talk / window)) if window else 0.0
    return {
        "ratio": round(ratio, 3),
        "transcript": " ".join(texts)[:1500],
        "language": getattr(info, "language", None),
        "engine": f"whisper-{model_name}",
    }


def _energy(path: Path, duration: float | None) -> dict:
    """Fraction of 30 ms frames clearly louder than the clip's noise floor."""
    import numpy as np

    window = min(duration or WINDOW_SECONDS, WINDOW_SECONDS)
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-t", str(window), "-i", str(path), "-ac", "1", "-ar", "16000",
         "-af", "highpass=f=120,lowpass=f=3800", "-f", "s16le", "-"],
        capture_output=True, timeout=300,
    )
    pcm = np.frombuffer(out.stdout, dtype=np.int16).astype(np.float32) / 32768.0
    frame = 480
    n = len(pcm) // frame
    if n == 0:
        return {"ratio": 0.0, "transcript": "", "engine": "estimate (Whisper not installed)"}
    rms = np.sqrt(np.mean(pcm[: n * frame].reshape(n, frame) ** 2, axis=1) + 1e-12)
    db = 20 * np.log10(rms)
    floor = np.percentile(db, 10)
    active = (db > max(floor + 12, -45)).astype(float)
    # smooth over ~0.3 s so syllable gaps count as talking
    kernel = np.ones(10) / 10
    smooth = np.convolve(active, kernel, mode="same") > 0.3
    return {
        "ratio": round(float(smooth.mean()), 3),
        "transcript": "",
        "engine": "estimate (Whisper not installed)",
    }
