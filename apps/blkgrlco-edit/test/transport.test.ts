// The playback clock, with a fake animation-frame timer so frame timing is controlled exactly.
import test from "node:test";
import assert from "node:assert/strict";

let frameCbs: ((t: number) => void)[] = [];
let clock = 1000;
(globalThis as any).requestAnimationFrame = (cb: (t: number) => void) => { frameCbs.push(cb); return frameCbs.length; };
(globalThis as any).cancelAnimationFrame = () => { frameCbs = []; };
(globalThis as any).performance = { now: () => clock };
/** Run one animation frame stamped `stamp` ms (rAF stamps are the frame's START time). */
const frame = (stamp: number) => { const cbs = frameCbs; frameCbs = []; for (const cb of cbs) cb(stamp); };

const { Transport } = await import("../src/engine/transport");

test("play at 0:00 keeps playing even when the first frame is stamped before play()", () => {
  const t = new Transport("p");
  t.setDuration(10, 30);
  clock = 1000;
  t.play(1);
  frame(995); // frame started 5 ms before play() was called
  assert.equal(t.rate, 1, "still playing");
  frame(1095);
  assert.ok(Math.abs(t.time - 0.1) < 1e-9, `time ${t.time}`);
});

test("forward stops at the end, reverse at the start; never the other way round", () => {
  const t = new Transport("p");
  t.setDuration(1, 30);
  t.seek(0.95); clock = 0; t.play(1); frame(0); frame(100);
  assert.equal(t.rate, 0); assert.equal(t.time, 1);
  t.seek(0.05); clock = 0; t.play(-1); frame(0); frame(100);
  assert.equal(t.rate, 0); assert.equal(t.time, 0);
});

test("J/K/L shuttle: doubling speeds, reverse, K stops, K-held steps a frame", () => {
  const t = new Transport("p");
  t.setDuration(10, 30);
  t.seek(5);
  t.shuttle(1); assert.equal(t.rate, 1);
  t.shuttle(1); assert.equal(t.rate, 2);
  t.shuttle(1); t.shuttle(1); t.shuttle(1); assert.equal(t.rate, 8, "caps at 8×");
  t.shuttle(-1); assert.equal(t.rate, -1, "J after L reverses at 1×");
  t.pause(); assert.equal(t.rate, 0);
  const before = t.frameTime();
  t.kHeld = true; t.shuttle(1);
  assert.ok(Math.abs(t.frameTime() - (before + 1 / 30)) < 1e-9, "K+L steps one frame");
  assert.equal(t.rate, 0);
});

test("pause lands exactly on a frame", () => {
  const t = new Transport("p");
  t.setDuration(10, 30);
  clock = 0; t.play(1); frame(0); frame(1234);
  t.pause();
  assert.ok(Math.abs(t.time * 30 - Math.round(t.time * 30)) < 1e-9, `time ${t.time} is on the 1/30 s grid`);
});
