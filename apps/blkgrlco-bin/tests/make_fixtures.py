"""Generate a fake project folder that mimics real T7 footage (for tests only).

  python tests/make_fixtures.py OUT_DIR

Makes small synthetic files with the real naming patterns and metadata:
DJI Pocket 3 vertical clips (flat "log" look), an iPhone horizontal clip with
Apple tags, a screen recording, a song, a sound effect, a photo with EXIF,
and a macOS ._ junk file that must be ignored.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def ff(*args):
    subprocess.run(["ffmpeg", "-y", "-v", "error", *args], check=True)


# Speech-like audio: noise shaped to the voice band, switched on and off at syllable rate.
VOICE = ("anoisesrc=d={d}:c=pink:a=0.4,bandpass=f=900:w=1400,volume=25,"
         "volume='if(lt(mod(t,0.6),0.38),1,0.02)':eval=frame,aformat=channel_layouts=stereo")
QUIET = "anoisesrc=d={d}:c=pink:a=0.003,aformat=channel_layouts=stereo"


def make(out: Path) -> Path:
    out.mkdir(parents=True, exist_ok=True)
    flat = "eq=contrast=0.55:saturation=0.45:brightness=0.06"
    # DJI talking head: vertical, flat log look, lots of talking
    ff("-f", "lavfi", "-i", f"testsrc2=s=270x480:d=8:r=25,{flat}",
       "-f", "lavfi", "-i", VOICE.format(d=8),
       "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
       "-metadata", "creation_time=2026-10-11T14:12:33Z",
       str(out / "DJI_20261011101233_0001_D.MP4"))
    # DJI b-roll: vertical, almost silent
    ff("-f", "lavfi", "-i", f"mandelbrot=s=270x480:r=25,{flat}", "-t", "6",
       "-f", "lavfi", "-i", QUIET.format(d=6),
       "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
       str(out / "DJI_20261011102045_0002_D.MP4"))
    # iPhone horizontal clip with Apple metadata
    ff("-f", "lavfi", "-i", "smptehdbars=s=480x270:d=5:r=30",
       "-f", "lavfi", "-i", QUIET.format(d=5),
       "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
       "-movflags", "use_metadata_tags",
       "-metadata", "com.apple.quicktime.make=Apple",
       "-metadata", "com.apple.quicktime.model=iPhone 15 Pro",
       "-metadata", "com.apple.quicktime.creationdate=2026-10-12T09:30:00-0400",
       str(out / "IMG_4821.MOV"))
    # iPhone screen recording
    ff("-f", "lavfi", "-i", "color=c=white:s=240x520:d=4:r=30,drawbox=x=20:y=40:w=200:h=60:color=gray:t=fill",
       "-c:v", "libx264", "-pix_fmt", "yuv420p",
       str(out / "RPReplay_Final1760190000.MP4"))
    # Song (Epidemic Sound naming) and a short sound effect
    ff("-f", "lavfi", "-i", "sine=f=220:d=40", "-f", "lavfi", "-i", "sine=f=330:d=40",
       "-filter_complex", "amix=inputs=2", "-c:a", "libmp3lame", "-q:a", "6",
       str(out / "ES_Sunday Morning - Blue Steel.mp3"))
    ff("-f", "lavfi", "-i", "anoisesrc=d=1.2:c=white:a=0.5,afade=t=out:st=0.2:d=1",
       str(out / "whoosh.wav"))
    # Photo with EXIF date
    from PIL import Image
    im = Image.new("RGB", (640, 480), (182, 138, 113))
    exif = Image.Exif()
    exif[306] = "2026:10:12 18:45:00"
    im.save(out / "IMG_4822.JPG", exif=exif)
    # macOS AppleDouble junk that exFAT drives collect; must be ignored
    (out / "._DJI_20261011101233_0001_D.MP4").write_bytes(b"\x00\x05\x16\x07junk")
    # A file already using a name the app will want, to prove the -2 rule
    (out / "Talking Head").mkdir(exist_ok=True)
    return out


if __name__ == "__main__":
    make(Path(sys.argv[1] if len(sys.argv) > 1 else "fixture-project"))
