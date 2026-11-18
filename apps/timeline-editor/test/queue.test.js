import { test } from "node:test";
import assert from "node:assert/strict";
import { JobQueue } from "../server/queue.js";
import { diffTimelines, defaultTimeline } from "../src/lib/model.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("queue runs at most 2 jobs, by priority, and a failure doesn't stop it", async () => {
  let running = 0;
  let max = 0;
  const order = [];
  const events = [];
  const q = new JobQueue({ concurrency: 2, onChange: (e) => events.push(e) });
  const job = (name, fail) => async () => {
    running++;
    max = Math.max(max, running);
    order.push(name);
    await wait(20);
    running--;
    if (fail) throw new Error(`${name} broke`);
  };
  q.add("a", 2, job("proxy-a"));
  q.add("b", 2, job("proxy-b", true));
  q.add("c", 0, job("thumb-c"));
  q.add("d", 1, job("wave-d"));
  assert.equal(q.add("c", 0, job("dup")), false, "same key is never queued twice");
  while (q.size) await wait(10);
  assert.equal(max, 2);
  assert.deepEqual(order, ["proxy-a", "proxy-b", "thumb-c", "wave-d"]); // first two start at once, then by priority
  assert.ok(events.some((e) => e.type === "error" && e.error === "proxy-b broke"));
  assert.equal(events.filter((e) => e.type === "done").length, 3);
});

test("relinking a media file shows up in the activity text", () => {
  const a = defaultTimeline();
  a.media.push({ id: "m1", file: "/Volumes/T7/footage/a.mp4", kind: "video", duration: 5 });
  const b = JSON.parse(JSON.stringify(a));
  b.media[0].file = "/Volumes/T7 1/footage/a.mp4";
  assert.deepEqual(diffTimelines(a, b).map((c) => c.text), ["Relinked m1 to /Volumes/T7 1/footage/a.mp4"]);
});
