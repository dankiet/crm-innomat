import { test } from "node:test";
import assert from "node:assert/strict";

import {
  gcRetentionHours,
  gcCutoffUtc,
  orphanAgeHours,
  GC_RETENTION_HOURS_DEFAULT,
} from "./image-asset-refs.ts";

const fmt = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

test("gcRetentionHours: mặc định 24 khi thiếu hoặc sai env", () => {
  assert.equal(gcRetentionHours({}), GC_RETENTION_HOURS_DEFAULT);
  assert.equal(gcRetentionHours({ IMAGE_GC_RETENTION_HOURS: "abc" }), GC_RETENTION_HOURS_DEFAULT);
  assert.equal(gcRetentionHours({ IMAGE_GC_RETENTION_HOURS: "-5" }), GC_RETENTION_HOURS_DEFAULT);
});

test("gcRetentionHours: env hợp lệ được dùng", () => {
  assert.equal(gcRetentionHours({ IMAGE_GC_RETENTION_HOURS: "48" }), 48);
  assert.equal(gcRetentionHours({ IMAGE_GC_RETENTION_HOURS: "0" }), 0);
});

test("gcCutoffUtc: lùi đúng số giờ, đúng format nowUtc", () => {
  const now = new Date("2026-09-21T10:00:00Z");
  assert.equal(gcCutoffUtc(24, now), "2026-09-20 10:00:00");
  assert.equal(gcCutoffUtc(0, now), "2026-09-21 10:00:00");
  assert.equal(gcCutoffUtc(1.5, now), "2026-09-21 08:30:00");
  assert.match(gcCutoffUtc(24), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
});

test("gcCutoffUtc: retention âm bị clamp về 0", () => {
  const now = new Date("2026-09-21T10:00:00Z");
  assert.equal(gcCutoffUtc(-7, now), "2026-09-21 10:00:00");
});

test("orphanAgeHours: tuổi theo giờ chính xác", () => {
  const now = new Date("2026-09-21T12:00:00Z");
  assert.equal(orphanAgeHours("2026-09-20 12:00:00", now), 24);
  assert.equal(orphanAgeHours(fmt(new Date("2026-09-21T12:00:00Z")), now), 0);
});

test("orphanAgeHours: chuỗi lạ → 0 (không crash)", () => {
  assert.equal(orphanAgeHours("", new Date("2026-09-21T12:00:00Z")), 0);
  assert.equal(orphanAgeHours("not-a-date", new Date("2026-09-21T12:00:00Z")), 0);
});

test("boundary: orphan đúng 24h cũ là candidate, dưới 24h thì không", () => {
  const now = new Date("2026-09-21T12:00:00Z");
  const cutoff = gcCutoffUtc(24, now); // "2026-09-20 12:00:00"
  // So sánh chuỗi theo định dạng nowUtc: orphaned_at <= cutoff → eligible
  assert.ok("2026-09-20 12:00:00" <= cutoff);
  assert.ok("2026-09-20 11:59:59" <= cutoff);
  assert.ok("2026-09-20 12:00:01" > cutoff);
});
