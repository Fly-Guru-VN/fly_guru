import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BLOCKS_MAX,
  contentChanged,
  coverPath,
  excerpt,
  inlineSegments,
  isJournalPhotoPath,
  paragraphs,
  parseBody,
  parseYouTube,
  plainText,
  safeHref,
  slugify,
  slugWithSuffix,
} from "@/lib/journal";

// Журнал (0064). Запуск: npm test
//
// Главное здесь — parseBody: это единственный фильтр между тем, что прислал
// браузер, и тем, что увидит посетитель сайта. Он обязан выкидывать всё, чего
// мы не умеем показать, и чужие пути к файлам.

const PHOTO = "2026/0f8fad5b-d9cb-469f-a165-70867728950e.jpg";

test("parseBody пропускает только известные блоки", () => {
  const body = parseBody([
    { type: "text", text: "Первый абзац" },
    { type: "photo", path: PHOTO, w: 1600, h: 1200 },
    { type: "html", html: "<script>alert(1)</script>" },
    { type: "text", text: 42 },
    "просто строка",
    null,
  ]);
  assert.deepEqual(body, [
    { type: "text", text: "Первый абзац" },
    { type: "photo", path: PHOTO, w: 1600, h: 1200 },
  ]);
});

test("parseBody выкидывает лишние поля блока", () => {
  const body = parseBody([{ type: "text", text: "абзац", onclick: "x()" }]);
  assert.deepEqual(body, [{ type: "text", text: "абзац" }]);
});

test("фото с чужим путём или без размеров не попадает в пост", () => {
  assert.deepEqual(
    parseBody([
      { type: "photo", path: "../clients/secret.jpg", w: 10, h: 10 },
      { type: "photo", path: "https://evil.example/x.jpg", w: 10, h: 10 },
      { type: "photo", path: PHOTO },
      { type: "photo", path: PHOTO, w: -1, h: 10 },
      { type: "photo", path: PHOTO, w: 1.5, h: 10 },
    ]),
    [],
  );
});

test("пустые абзацы выкидываются, лишние пустые строки схлопываются", () => {
  assert.deepEqual(
    parseBody([
      { type: "text", text: "   \n  " },
      { type: "text", text: "раз  \r\n\r\n\r\n\r\nдва" },
    ]),
    [{ type: "text", text: "раз\n\nдва" }],
  );
});

test("тело не массив — пустой пост, а не падение", () => {
  assert.deepEqual(parseBody(null), []);
  assert.deepEqual(parseBody({ type: "text" }), []);
  assert.deepEqual(parseBody("[]"), []);
});

test("блоков не больше предела", () => {
  const many = Array.from({ length: BLOCKS_MAX + 5 }, (_, i) => ({
    type: "text",
    text: `абзац ${i}`,
  }));
  assert.equal(parseBody(many).length, BLOCKS_MAX);
});

test("путь фото: только свой формат", () => {
  assert.equal(isJournalPhotoPath(PHOTO), true);
  assert.equal(isJournalPhotoPath("2026/not-a-uuid.jpg"), false);
  assert.equal(isJournalPhotoPath(`${PHOTO}.html`), false);
  assert.equal(isJournalPhotoPath(`x/${PHOTO}`), false);
});

test("абзацы делятся пустой строкой, одиночный перенос остаётся внутри", () => {
  assert.deepEqual(paragraphs("раз\nещё раз\n\nдва"), ["раз\nещё раз", "два"]);
});

test("обложка — первое фото поста", () => {
  assert.equal(coverPath([{ type: "text", text: "a" }]), null);
  assert.equal(
    coverPath([
      { type: "text", text: "a" },
      { type: "photo", path: PHOTO, w: 1, h: 1 },
    ]),
    PHOTO,
  );
});

test("описание режется по слову и получает многоточие", () => {
  const blocks = parseBody([
    { type: "text", text: "Как починить крыло электрофойла своими руками" },
    { type: "text", text: "и не потерять сезон" },
  ]);
  assert.equal(
    excerpt(blocks),
    "Как починить крыло электрофойла своими руками и не потерять сезон",
  );
  assert.equal(excerpt(blocks, 30), "Как починить крыло…");
});

test("адрес поста — латиницей из русского заголовка", () => {
  assert.equal(slugify("Как починить крыло?"), "kak-pochinit-krylo");
  assert.equal(slugify("Ёлка, щука и объём"), "elka-schuka-i-obem");
  assert.equal(slugify("Lift 5 — обзор 2026"), "lift-5-obzor-2026");
  assert.equal(slugify("Nha Trang đẹp"), "nha-trang-dep");
  assert.equal(slugify("🔥🔥🔥"), "post");
  assert.ok(slugify("очень ".repeat(40)).length <= 80);
  assert.doesNotMatch(slugify("очень ".repeat(40)), /-$/);
});

test("занятый адрес получает номер", () => {
  assert.equal(slugWithSuffix("kak-pochinit-krylo", 1), "kak-pochinit-krylo");
  assert.equal(slugWithSuffix("kak-pochinit-krylo", 2), "kak-pochinit-krylo-2");
  assert.ok(slugWithSuffix("a".repeat(80), 12).length <= 80);
});

test("пометку «изменено» даёт правка текста, а не категории", () => {
  const body = [{ type: "text" as const, text: "абзац" }];
  assert.equal(contentChanged({ title: "Т", body }, { title: "Т", body }), false);
  assert.equal(contentChanged({ title: "Т", body }, { title: "Т2", body }), true);
  assert.equal(
    contentChanged({ title: "Т", body }, { title: "Т", body: [{ type: "text", text: "другой" }] }),
    true,
  );
});

test("заголовок, список, видео и подпись к фото разбираются", () => {
  assert.deepEqual(
    parseBody([
      { type: "heading", text: "  Что  взять\nс собой " },
      { type: "list", ordered: true, items: ["Купальник", " ", "Крем от\nсолнца"] },
      { type: "list", items: [] },
      { type: "photo", path: PHOTO, w: 10, h: 10, caption: " Крыло после ремонта " },
      { type: "video", provider: "youtube", id: "dQw4w9WgXcQ", vertical: true },
      { type: "video", provider: "youtube", id: "<script>" },
      { type: "video", provider: "vimeo", id: "dQw4w9WgXcQ" },
    ]),
    [
      { type: "heading", text: "Что взять с собой" },
      { type: "list", ordered: true, items: ["Купальник", "Крем от солнца"] },
      { type: "photo", path: PHOTO, w: 10, h: 10, caption: "Крыло после ремонта" },
      { type: "video", provider: "youtube", id: "dQw4w9WgXcQ", vertical: true },
    ],
  );
});

test("ссылка в тексте: только http(s) и свои пути", () => {
  assert.equal(safeHref("https://flyguru.pro/training"), "https://flyguru.pro/training");
  assert.equal(safeHref("/training"), "/training");
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("JaVaScRiPt:alert(1)"), null);
  assert.equal(safeHref("data:text/html,<b>"), null);
  assert.equal(safeHref("//evil.example"), null);
  assert.equal(safeHref("https://"), null);
});

test("разметка [текст](адрес) и голые адреса становятся ссылками", () => {
  assert.deepEqual(inlineSegments("Запишитесь на [обучение](/training)."), [
    { text: "Запишитесь на " },
    { text: "обучение", href: "/training" },
    { text: "." },
  ]);
  assert.deepEqual(inlineSegments("Видео: https://youtu.be/abc, смотрите!"), [
    { text: "Видео: " },
    { text: "https://youtu.be/abc", href: "https://youtu.be/abc" },
    { text: ", смотрите!" },
  ]);
  // Опасный адрес — остаётся только текст ссылки.
  assert.deepEqual(inlineSegments("[жми](javascript:alert(1))"), [
    { text: "жми" },
    { text: ")" },
  ]);
  assert.equal(plainText("См. [прайс](/prices) и https://flyguru.pro"), "См. прайс и https://flyguru.pro");
});

test("описание берёт абзацы и списки, без подзаголовков и разметки", () => {
  const blocks = parseBody([
    { type: "heading", text: "Заголовок раздела" },
    { type: "text", text: "Смотрите [прайс](/prices)." },
    { type: "list", items: ["раз", "два"] },
  ]);
  assert.equal(excerpt(blocks), "Смотрите прайс. раз два");
});

test("ссылки YouTube из приложения превращаются в id ролика", () => {
  const id = "dQw4w9WgXcQ";
  assert.deepEqual(parseYouTube(`https://www.youtube.com/watch?v=${id}&t=10`), { id, vertical: false });
  assert.deepEqual(parseYouTube(`https://youtu.be/${id}?si=xyz`), { id, vertical: false });
  assert.deepEqual(parseYouTube(`https://m.youtube.com/watch?v=${id}`), { id, vertical: false });
  assert.deepEqual(parseYouTube(`https://youtube.com/shorts/${id}?feature=share`), { id, vertical: true });
  assert.deepEqual(parseYouTube(`https://www.youtube.com/embed/${id}`), { id, vertical: false });
  assert.equal(parseYouTube("https://vimeo.com/123"), null);
  assert.equal(parseYouTube("не ссылка"), null);
  assert.equal(parseYouTube(`javascript://youtube.com/watch?v=${id}`), null);
  assert.equal(parseYouTube("https://www.youtube.com/watch?v=short"), null);
});
