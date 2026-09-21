import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  contentHashOf,
  sha256FromRef,
  storageKeyForRef,
  normalizeWebpBuffer,
  assetMetadataFromBuffer,
} from "./image-asset-refs.ts";

const FIXTURE_SHA = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

test("contentHashOf = sha256 hex của buffer", () => {
  assert.equal(contentHashOf(Buffer.from("")), FIXTURE_SHA);
  assert.equal(
    contentHashOf(Buffer.from("abc")),
    createHash("sha256").update("abc").digest("hex"),
  );
  assert.match(contentHashOf(Buffer.from("x")), /^[0-9a-f]{64}$/);
});

test("sha256FromRef: supabase URL công khai", () => {
  const ref = `https://xyz.supabase.co/storage/v1/object/public/crm-images/crm/${FIXTURE_SHA}.webp`;
  assert.equal(sha256FromRef(ref), FIXTURE_SHA);
  // có query string vẫn parse được file name
  assert.equal(sha256FromRef(`${ref}?token=abc`), FIXTURE_SHA);
});

test("sha256FromRef: path local /images/", () => {
  assert.equal(sha256FromRef(`/images/${FIXTURE_SHA}.webp`), FIXTURE_SHA);
  assert.equal(sha256FromRef(`/images/${FIXTURE_SHA}`), FIXTURE_SHA);
});

test("sha256FromRef: ref không managed/không hợp lệ → null", () => {
  assert.equal(sha256FromRef(""), null);
  assert.equal(sha256FromRef("https://cdn.example.com/img.webp"), null);
  assert.equal(sha256FromRef("/products/imported/abc.jpg"), null);
  assert.equal(sha256FromRef(`/images/nothex.webp`), null);
  assert.equal(sha256FromRef(`/images/${FIXTURE_SHA.slice(0, 10)}.webp`), null);
});

test("storageKeyForRef trả key content-address cho cả 2 mode", () => {
  assert.equal(
    storageKeyForRef(`https://xyz.supabase.co/storage/v1/object/public/crm-images/crm/${FIXTURE_SHA}.webp`),
    `${FIXTURE_SHA}.webp`,
  );
  assert.equal(storageKeyForRef(`/images/${FIXTURE_SHA}.webp`), `${FIXTURE_SHA}.webp`);
});

test("round-trip: hash của buffer = sha trong ref do filenameFor tạo", async () => {
  const sharp = (await import("sharp")).default;
  const buffer = await sharp({
    create: { width: 12, height: 9, channels: 3, background: "#f00" },
  })
    .webp({ quality: 80 })
    .toBuffer();
  const sha = contentHashOf(buffer);
  const ref = `/images/${sha}.webp`;
  assert.equal(sha256FromRef(ref), sha);
  assert.equal(storageKeyForRef(ref), `${sha}.webp`);
});

test("nhiều ref khác nhau của CÙNG file → cùng sha (dedup theo nội dung)", async () => {
  const sharp = (await import("sharp")).default;
  const buffer = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#0af" },
  })
    .webp()
    .toBuffer();
  const sha = contentHashOf(buffer);
  assert.equal(
    sha256FromRef(`/images/${sha}.webp`),
    sha256FromRef(`https://p.supabase.co/storage/v1/object/public/bucket/crm/${sha}.webp`),
  );
});

test("normalizeWebpBuffer: metadata đúng, giữ nguyên webp ≤1600 (không re-encode)", async () => {
  const sharp = (await import("sharp")).default;
  const small = await sharp({
    create: { width: 40, height: 30, channels: 3, background: "#0a0" },
  })
    .webp({ quality: 80 })
    .toBuffer();
  const { buffer, width, height, mimeType } = await normalizeWebpBuffer(small);
  assert.equal(width, 40);
  assert.equal(height, 30);
  assert.equal(mimeType, "image/webp");
  assert.equal(buffer.toString("hex"), small.toString("hex"));
});

test("normalizeWebpBuffer: ảnh lớn bị resize về ≤1600 và chuyển webp", async () => {
  const sharp = (await import("sharp")).default;
  const big = await sharp({
    create: { width: 2400, height: 1200, channels: 3, background: "#00f" },
  })
    .png()
    .toBuffer();
  const result = await normalizeWebpBuffer(big);
  assert.ok(result.width <= 1600 && result.height <= 1600);
  assert.equal(result.mimeType, "image/webp");
  assert.equal((await assetMetadataFromBuffer(result.buffer)).format, "webp");
});

test("assetMetadataFromBuffer đọc đúng width/height/format webp", async () => {
  const sharp = (await import("sharp")).default;
  const buf = await sharp({
    create: { width: 64, height: 48, channels: 3, background: "#ccc" },
  })
    .webp()
    .toBuffer();
  const meta = await assetMetadataFromBuffer(buf);
  assert.equal(meta.width, 64);
  assert.equal(meta.height, 48);
  assert.equal(meta.format, "webp");
});