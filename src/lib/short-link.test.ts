import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRedirectUrl,
  isSafeTargetPath,
  isValidSlug,
  normalizeSlug,
  normalizeTargetPath,
} from "./short-link.ts";

test("normalizeSlug: bỏ dấu, hạ chữ, gạch ngang hoá", () => {
  assert.equal(normalizeSlug("M75300H"), "m75300h");
  assert.equal(normalizeSlug("Gạch Thẻ Đỏ"), "gach-the-do");
  assert.equal(normalizeSlug("  ebg__mosaic  "), "ebg-mosaic");
});

test("isValidSlug: chặn slug rỗng, quá ngắn, gạch đầu/cuối, ký tự lạ", () => {
  assert.equal(isValidSlug("m75300h"), true);
  assert.equal(isValidSlug("ebg-mosaic-202610"), true);
  assert.equal(isValidSlug("a"), false);
  assert.equal(isValidSlug("-abc"), false);
  assert.equal(isValidSlug("abc-"), false);
  assert.equal(isValidSlug("Abc"), false);
  assert.equal(isValidSlug("a b"), false);
});

test("isSafeTargetPath: chỉ nhận path nội bộ, chặn open-redirect", () => {
  assert.equal(isSafeTargetPath("/"), true);
  assert.equal(isSafeTargetPath("/lp/gach-the"), true);
  assert.equal(isSafeTargetPath("https://evil.com"), false);
  assert.equal(isSafeTargetPath("//evil.com"), false);
  assert.equal(isSafeTargetPath("lp/gach-the"), false);
  assert.equal(isSafeTargetPath("/a\\b"), false);
});

test("normalizeTargetPath: rỗng thành '/', thiếu gạch đầu thì thêm", () => {
  assert.equal(normalizeTargetPath(""), "/");
  assert.equal(normalizeTargetPath("lp/gach-the"), "/lp/gach-the");
  assert.equal(normalizeTargetPath("/lp/mosaic"), "/lp/mosaic");
});

test("buildRedirectUrl: ghép UTM vào đích, bỏ UTM rỗng", () => {
  const url = buildRedirectUrl("https://embangach.com", "/", {
    utm_source: "facebook",
    utm_medium: "paid",
    utm_content: "m75300h_post",
    utm_campaign: "",
  });
  assert.equal(
    url,
    "https://embangach.com/?utm_source=facebook&utm_medium=paid&utm_content=m75300h_post",
  );
});

test("buildRedirectUrl: không có UTM thì trả path trần", () => {
  assert.equal(buildRedirectUrl("https://embangach.com", "/", {}), "https://embangach.com/");
});

test("buildRedirectUrl: bỏ gạch chéo cuối của origin để không thành '//'", () => {
  assert.equal(
    buildRedirectUrl("https://embangach.com///", "/lp/mosaic", {}),
    "https://embangach.com/lp/mosaic",
  );
});

test("buildRedirectUrl: path không an toàn trả null (chặn redirect ra ngoài)", () => {
  assert.equal(buildRedirectUrl("https://embangach.com", "https://evil.com", {}), null);
  assert.equal(buildRedirectUrl("https://embangach.com", "//evil.com", {}), null);
});

test("buildRedirectUrl: UTM được encode đúng, không phá query string", () => {
  const url = buildRedirectUrl("https://embangach.com", "/", {
    utm_content: "m75300h post & more",
  });
  assert.equal(url, "https://embangach.com/?utm_content=m75300h+post+%26+more");
});

test("buildRedirectUrl: giữ `fbclid` Meta mang vào, nhưng UTM lưu sẵn thắng khi trùng key", () => {
  const incoming = new URLSearchParams("fbclid=abc123&utm_campaign=hacked");
  const url = buildRedirectUrl(
    "https://embangach.com",
    "/",
    { utm_campaign: "ebg_chung_traffic_202609" },
    incoming,
  );
  const parsed = new URL(url!);
  assert.equal(parsed.searchParams.get("fbclid"), "abc123");
  assert.equal(parsed.searchParams.get("utm_campaign"), "ebg_chung_traffic_202609");
});

test("buildRedirectUrl: không có query đến thì hành xử như trước", () => {
  assert.equal(
    buildRedirectUrl("https://embangach.com", "/", { utm_source: "facebook" }, null),
    "https://embangach.com/?utm_source=facebook",
  );
});
