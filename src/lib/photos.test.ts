import assert from "node:assert/strict";
import test from "node:test";
import {
  checkPhoto,
  isClientPhotoStoragePath,
  isShiftPhotoStoragePath,
} from "./photos";

test("принимает JPEG только с настоящей сигнатурой", async () => {
  const photo = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "photo.jpg", {
    type: "image/jpeg",
  });
  assert.deepEqual(await checkPhoto(photo), { ext: "jpg" });
});

test("не доверяет поддельному MIME изображения", async () => {
  const fake = new File(["<script>alert(1)</script>"], "photo.jpg", {
    type: "image/jpeg",
  });
  assert.deepEqual(await checkPhoto(fake), {
    error: "Файл повреждён или не является поддерживаемым фото.",
  });
});

test("не принимает сигнатуру другого формата под разрешённым MIME", async () => {
  const pngAsJpeg = new File(
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    "photo.jpg",
    { type: "image/jpeg" },
  );
  assert.equal((await checkPhoto(pngAsJpeg)).error !== undefined, true);
});

test("путь снимка обязан принадлежать своей смене и типу", () => {
  const photo = {
    shift_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    phase: "open",
    kind: "board",
    path: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/open-board-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg",
  };
  assert.equal(isShiftPhotoStoragePath(photo), true);
  assert.equal(
    isShiftPhotoStoragePath({
      ...photo,
      path: "cccccccc-cccc-4ccc-8ccc-cccccccccccc/open-board-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg",
    }),
    false,
  );
  assert.equal(
    isShiftPhotoStoragePath({ ...photo, path: `${photo.shift_id}/../foreign.jpg` }),
    false,
  );
});

test("путь фото клиента нельзя подменить чужим объектом", () => {
  const clientId = "f5b17d79-9017-4bf6-a5b7-2da28cd5c92f";
  assert.equal(isClientPhotoStoragePath(clientId, `${clientId}.jpg`), true);
  assert.equal(
    isClientPhotoStoragePath(
      clientId,
      `${clientId}/6130d8a3-deda-46a6-8e17-0a2eea250bd9.webp`,
    ),
    true,
  );
  assert.equal(
    isClientPhotoStoragePath(
      clientId,
      "a1e57527-0d93-43d4-a2ef-928c3ce538ee/6130d8a3-deda-46a6-8e17-0a2eea250bd9.webp",
    ),
    false,
  );
  assert.equal(isClientPhotoStoragePath(clientId, "../avatars/admin.jpg"), false);
});
