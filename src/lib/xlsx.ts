import { deflateRawSync } from "node:zlib";

// Сборка файла Excel (.xlsx) без единой библиотеки.
//
// Зачем вообще: CSV русский Excel открывает как есть — вся строка падает в
// колонку A, потому что разделителем он считает запятую, а не точку с запятой
// (это зависит от настроек Windows, и менять их ради одного файла никто не
// будет). Готовый .xlsx открывается правильно всегда: колонки на местах,
// суммы — числа, а не текст, шапка закреплена, над ней стоит фильтр.
//
// Почему свой сборщик, а не пакет с npm: .xlsx — это обычный ZIP с несколькими
// XML внутри, и для нашей задачи (плоская таблица без формул и картинок) кода
// выходит меньше, чем весит любая библиотека. В проекте семь зависимостей,
// и тянуть восьмую на пять мегабайт ради одной кнопки не хочется.
//
// Что умеет: строки и числа, жирная шапка, ширина колонок по содержимому,
// закреплённая первая строка и автофильтр. Больше и не нужно.

export type XlsxValue = string | number | null;

// ── ZIP ───────────────────────────────────────────────────────────────────
// Своя таблица CRC32: zlib отдаёт crc32 только начиная с Node 22, а на Vercel
// версия может быть и старше.
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Buffer;
}

// Обычный ZIP со сжатием deflate. Дата/время файлов — нули: содержимое от них
// не зависит, а одинаковый файл при каждой выгрузке удобнее для сравнения.
function zip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const compressed = deflateRawSync(e.data);
    const crc = crc32(e.data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // версия, необходимая для распаковки
    local.writeUInt16LE(0x0800, 6); // имена файлов в UTF-8
    local.writeUInt16LE(8, 8); // метод сжатия: deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    locals.push(local, compressed);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // чем создан
    central.writeUInt16LE(20, 6); // что нужно для распаковки
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42); // где лежит локальный заголовок
    name.copy(central, 46);
    centrals.push(central);

    offset += local.length + compressed.length;
  }

  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, cd, end]);
}

// ── XML ───────────────────────────────────────────────────────────────────
// Управляющие символы (кроме переноса и табуляции) Excel не принимает вовсе —
// файл считается битым. В исходнике их нельзя написать литералом, поэтому
// регулярка собирается из escape-последовательностей.
const CONTROL_CHARS = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]", "g");

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(CONTROL_CHARS, "");
}

// Номер колонки (с единицы) → буквы: 1 → A, 27 → AA.
function colName(n: number): string {
  let s = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    s = String.fromCharCode(65 + rest) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function cell(ref: string, v: XlsxValue, bold: boolean): string {
  const style = bold ? ' s="1"' : "";
  if (v === null || v === "") return `<c r="${ref}"${style}/>`;
  if (typeof v === "number" && Number.isFinite(v)) {
    return `<c r="${ref}"${style}><v>${v}</v></c>`;
  }
  // Текст пишем прямо в ячейку (inlineStr): отдельный словарь строк
  // (sharedStrings) экономит место в больших книгах, а у нас таблица на
  // сотню строк — лишний файл внутри архива только усложнил бы сборку.
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

// Два стиля: обычный (0) и жирный (1) — им размечена шапка.
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function workbook(sheetName: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

// Ширина колонки в «символах»: по самой длинной ячейке, с потолком — иначе
// примечание на пол-экрана растянет колонку так, что таблицу не видно.
function widths(rows: XlsxValue[][]): number[] {
  const max: number[] = [];
  for (const row of rows) {
    row.forEach((v, i) => {
      const len = v === null ? 0 : String(v).length;
      max[i] = Math.max(max[i] ?? 0, len);
    });
  }
  return max.map((n) => Math.min(Math.max(n + 2, 9), 42));
}

// Первая строка — шапка: жирная, закреплена при прокрутке и с автофильтром
// (в Excel по ней сразу можно отсортировать и отфильтровать что угодно).
//
// totalRow — последняя строка является итоговой. Её надо оставить ВНЕ области
// фильтра: иначе первая же сортировка в Excel уносит «Итого» куда-то в
// середину таблицы, к строкам с той же буквой.
export function buildXlsx(
  sheetName: string,
  rows: XlsxValue[][],
  { totalRow = false }: { totalRow?: boolean } = {},
): Buffer {
  const cols = widths(rows);
  const colsXml = cols.length
    ? `<cols>${cols
        .map(
          (w, i) =>
            `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`,
        )
        .join("")}</cols>`
    : "";

  const body = rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => cell(`${colName(c + 1)}${r + 1}`, v, r === 0))
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");

  const lastCol = colName(Math.max(cols.length, 1));
  const dimension = `A1:${lastCol}${Math.max(rows.length, 1)}`;
  const filterRef = `A1:${lastCol}${Math.max(rows.length - (totalRow ? 1 : 0), 1)}`;
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${dimension}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${colsXml}<sheetData>${body}</sheetData><autoFilter ref="${filterRef}"/></worksheet>`;

  return zip([
    { name: "[Content_Types].xml", data: Buffer.from(CONTENT_TYPES, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(ROOT_RELS, "utf8") },
    { name: "xl/workbook.xml", data: Buffer.from(workbook(sheetName), "utf8") },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(WORKBOOK_RELS, "utf8") },
    { name: "xl/styles.xml", data: Buffer.from(STYLES, "utf8") },
    { name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheet, "utf8") },
  ]);
}

// Заголовки ответа для скачивания книги. Имя файла дублируется в filename* —
// без него браузер может испортить кириллицу, если она попадёт в имя.
export function xlsxHeaders(fileName: string): Record<string, string> {
  return {
    "Content-Type":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  };
}
