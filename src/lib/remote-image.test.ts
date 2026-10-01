import assert from "node:assert/strict";
import test from "node:test";

import { REMOTE_IMAGE_MAX_BYTES, fetchRemoteImageBytes, isPrivateAddress, remoteImageUrlError } from "./remote-image";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

test("blocks private, local, and non-web image addresses", () => {
  assert.equal(remoteImageUrlError("file:///C:/secret.png"), "이미지 주소를 확인하지 못했습니다.");
  assert.equal(remoteImageUrlError("http://127.0.0.1/a.png"), "이미지 주소를 확인하지 못했습니다.");
  assert.equal(remoteImageUrlError("http://192.168.0.20/a.png"), "이미지 주소를 확인하지 못했습니다.");
  assert.equal(remoteImageUrlError("http://169.254.169.254/latest"), "이미지 주소를 확인하지 못했습니다.");
  assert.equal(remoteImageUrlError("http://localhost/a.png"), "이미지 주소를 확인하지 못했습니다.");
  assert.equal(remoteImageUrlError("http://metadata.google.internal/a.png"), "이미지 주소를 확인하지 못했습니다.");
  assert.equal(remoteImageUrlError("http://printer.local/a.png"), "이미지 주소를 확인하지 못했습니다.");
  assert.equal(remoteImageUrlError("http://user:pass@example.com/a.png"), "이미지 주소를 확인하지 못했습니다.");
  assert.equal(remoteImageUrlError("http://example.com:8080/a.png"), "이미지 주소를 확인하지 못했습니다.");
  assert.equal(remoteImageUrlError("https://example.com/a.png"), null);
  assert.equal(isPrivateAddress("10.1.2.3"), true);
  assert.equal(isPrivateAddress("172.16.0.1"), true);
  assert.equal(isPrivateAddress("::1"), true);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
});

test("rejects a private lookup, a redirect, an oversized body, and a non-image", async () => {
  await assert.rejects(
    () => fetchRemoteImageBytes("https://example.com/a.png", { lookupHost: async () => ["10.0.0.8"], fetchImage: forbiddenFetch }),
    /이미지 주소를 확인하지 못했습니다/,
  );
  await assert.rejects(
    () =>
      fetchRemoteImageBytes("https://example.com/a.png", {
        lookupHost: async () => ["8.8.8.8"],
        fetchImage: async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret" } }),
      }),
    /이미지 주소를 확인하지 못했습니다/,
  );
  await assert.rejects(
    () =>
      fetchRemoteImageBytes("https://example.com/a.png", {
        lookupHost: async () => ["8.8.8.8"],
        fetchImage: async () => new Response("<html></html>", { status: 200, headers: { "Content-Type": "text/html" } }),
      }),
    /지원하지 않는 형식/,
  );
  const huge = new Uint8Array(REMOTE_IMAGE_MAX_BYTES + 1);
  await assert.rejects(
    () =>
      fetchRemoteImageBytes("https://example.com/a.png", {
        lookupHost: async () => ["8.8.8.8"],
        fetchImage: async () => new Response(huge, { status: 200 }),
      }),
    /제한을 넘었습니다/,
  );
});

test("returns image bytes without rewriting a valid png", async () => {
  const image = await fetchRemoteImageBytes("https://example.com/a.png", {
    lookupHost: async () => ["8.8.8.8"],
    fetchImage: async (_url, signal) => {
      assert.equal(signal.aborted, false);
      return new Response(PNG, { status: 200, headers: { "Content-Type": "image/png" } });
    },
  });
  assert.equal(image.kind, "png");
  assert.equal(image.mediaType, "image/png");
  assert.deepEqual(image.bytes, PNG);
});

function forbiddenFetch(): Promise<Response> {
  throw new Error("fetch should not run");
}
