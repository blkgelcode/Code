// A file's identity that survives moves and renamed drives: size + hash of its first and
// last 1 MB. Reading 2 MB is fast even over USB, unlike hashing a 20 GB clip.
import fs from "node:fs";
import crypto from "node:crypto";

const CHUNK = 1024 * 1024;

export function fingerprint(file: string): string {
  const st = fs.statSync(file);
  const h = crypto.createHash("sha1").update(String(st.size));
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(Math.min(CHUNK, st.size));
    fs.readSync(fd, buf, 0, buf.length, 0);
    h.update(buf);
    if (st.size > CHUNK) {
      const tail = Buffer.alloc(Math.min(CHUNK, st.size - CHUNK));
      fs.readSync(fd, tail, 0, tail.length, st.size - tail.length);
      h.update(tail);
    }
  } finally { fs.closeSync(fd); }
  return h.digest("hex").slice(0, 20);
}
