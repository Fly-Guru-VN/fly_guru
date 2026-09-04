import assert from "node:assert/strict";
import test from "node:test";
import { privatePhotoPath } from "./privateStorage";

test("privatePhotoPath prefers the stored private path", () => {
  assert.equal(
    privatePhotoPath(
      "clients",
      "/client-id.webp",
      "https://example.supabase.co/storage/v1/object/public/clients/old.jpg?v=1",
    ),
    "client-id.webp",
  );
});

test("privatePhotoPath extracts a path from a legacy URL without its query", () => {
  assert.equal(
    privatePhotoPath(
      "clients",
      null,
      "https://example.supabase.co/storage/v1/object/public/clients/client-id.jpg?v=123",
    ),
    "client-id.jpg",
  );
});

test("privatePhotoPath rejects external and other-bucket URLs", () => {
  assert.equal(privatePhotoPath("clients", null, "https://example.com/photo.jpg"), null);
  assert.equal(
    privatePhotoPath(
      "clients",
      null,
      "https://example.supabase.co/storage/v1/object/public/shifts/shift/photo.jpg",
    ),
    null,
  );
  assert.equal(privatePhotoPath("clients", null, "not a URL"), null);
});
