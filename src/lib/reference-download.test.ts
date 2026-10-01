import assert from "node:assert/strict";
import test from "node:test";

import {
  extensionForMedia,
  isLibraryUploadPath,
  loadReferenceImageBlob,
  referenceDownloadName,
  sanitizeDownloadBase,
} from "./reference-download";

test("builds a windows-safe download name from the visible label", () => {
  assert.equal(referenceDownloadName("신라 금관 여성", "jpeg"), "신라_금관_여성.jpg");
  assert.equal(referenceDownloadName('a<b>c:"d/e\\f|g?h*i', "png"), "a_b_c_d_e_f_g_h_i.png");
  assert.equal(referenceDownloadName("   ", "jpg"), "reference-image.jpg");
  assert.equal(referenceDownloadName("CON", "jpg"), "reference-image.jpg");
  assert.equal(referenceDownloadName("photo.JPEG", "png"), "photo.jpg");
  assert.equal(sanitizeDownloadBase("../secret"), "secret");
  assert.equal(extensionForMedia("image/webp", null), "webp");
  assert.equal(extensionForMedia("", "https://example.com/a.jpeg?x=1"), "jpg");
});

test("downloads the original web image through the existing proxy before a thumbnail", async () => {
  const calls: string[] = [];
  const blob = new Blob([Uint8Array.from([1, 2, 3])], { type: "image/jpeg" });
  const fetchImpl = async (input: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${input}`);
    if (input === "https://cdn.example/full.jpg") {
      return new Response("blocked", { status: 403 });
    }
    if (input === "/api/pose-image") {
      assert.equal(init?.body, JSON.stringify({ url: "https://cdn.example/full.jpg" }));
      return new Response(blob, { status: 200, headers: { "Content-Type": "image/jpeg" } });
    }
    throw new Error("unexpected request");
  };

  const loaded = await loadReferenceImageBlob(
    {
      imageUrl: "https://cdn.example/full.jpg",
      thumbnailUrl: "https://cdn.example/thumb.jpg",
      label: "신라 금관 여성",
    },
    fetchImpl,
  );

  assert.equal(loaded.ok, true);
  if (loaded.ok) assert.equal(loaded.name, "신라_금관_여성.jpg");
  assert.deepEqual(calls, [
    "GET https://cdn.example/full.jpg",
    "POST /api/pose-image",
  ]);
});

test("downloads a stored library upload without the remote proxy", async () => {
  const calls: string[] = [];
  const fetchImpl = async (input: string) => {
    calls.push(input);
    return new Response(Uint8Array.from([1]), { status: 200, headers: { "Content-Type": "image/png" } });
  };
  const loaded = await loadReferenceImageBlob(
    {
      imageUrl: "/api/library/uploads/11111111-1111-4111-8111-111111111111",
      thumbnailUrl: "/api/library/uploads/11111111-1111-4111-8111-111111111111",
      label: "내 사진.png",
    },
    fetchImpl,
  );
  assert.equal(isLibraryUploadPath("/api/library/uploads/11111111-1111-4111-8111-111111111111"), true);
  assert.equal(loaded.ok, true);
  if (loaded.ok) assert.equal(loaded.name, "내_사진.png");
  assert.deepEqual(calls, ["/api/library/uploads/11111111-1111-4111-8111-111111111111"]);
});

test("uses the thumbnail only after the original cannot be loaded", async () => {
  const calls: string[] = [];
  const fetchImpl = async (input: string, init?: RequestInit) => {
    calls.push(String(init?.body ?? input));
    if (String(init?.body ?? "").includes("full.jpg")) return new Response(null, { status: 400 });
    if (input.startsWith("https://")) return new Response(null, { status: 404 });
    return new Response(Uint8Array.from([9]), { status: 200, headers: { "Content-Type": "image/jpeg" } });
  };
  const loaded = await loadReferenceImageBlob(
    {
      imageUrl: "https://cdn.example/full.jpg",
      thumbnailUrl: "https://cdn.example/thumb.jpg",
      label: "",
    },
    fetchImpl,
  );
  assert.equal(loaded.ok, true);
  if (loaded.ok) assert.equal(loaded.name, "reference-image.jpg");
  assert.equal(calls.some((call) => call.includes("thumb.jpg")), true);
  assert.equal(calls.some((call) => call.includes("127.0.0.1") || call.includes("localhost")), false);
});
