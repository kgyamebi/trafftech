import { inflateRawSync, inflateSync } from "node:zlib";

const MAX_OUT = 2_000_000;

export function textFromFile(bytes: Uint8Array, name: string, mime: string): string {
  const file = name.toLowerCase();
  if (mime.startsWith("text/") || file.endsWith(".txt") || file.endsWith(".csv") || file.endsWith(".json") || file.endsWith(".md")) {
    return decodeText(bytes);
  }
  if (mime === "application/pdf" || file.endsWith(".pdf")) return textFromPdf(bytes);
  if (file.endsWith(".docx") || file.endsWith(".xlsx") || mime.includes("wordprocessingml") || mime.includes("spreadsheetml")) {
    return textFromOffice(bytes);
  }
  return "";
}

export function textFromPdf(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (const stream of pdfStreams(bytes)) {
    const text = textFromPdfOperators(stream);
    if ((text.match(/[A-Za-z]/g) ?? []).length >= 4) parts.push(text);
  }
  return parts.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 20_000);
}

export function textFromPdfOperators(content: string): string {
  const parts: string[] = [];
  let i = 0;
  while (i < content.length) {
    if (content[i] === "(") {
      const parsed = readLiteral(content, i);
      if (parsed) {
        parts.push(parsed.text);
        i = parsed.next;
        continue;
      }
    }
    if (content[i] === "<" && content[i + 1] !== "<") {
      const end = content.indexOf(">", i + 1);
      if (end > i) {
        const text = hexToText(content.slice(i + 1, end));
        if (text) parts.push(text);
        i = end + 1;
        continue;
      }
    }
    i += 1;
  }
  return parts.join(" ").replace(/[ \t]{2,}/g, " ").trim();
}

export function textFromOffice(bytes: Uint8Array): string {
  const files = unzip(bytes);
  const document = files.find((file) => file.name === "word/document.xml");
  if (document) return xmlText(document.text);
  const shared = files.find((file) => file.name === "xl/sharedStrings.xml");
  const sheets = files.filter((file) => file.name.startsWith("xl/worksheets/"));
  if (shared || sheets.length) {
    return [shared?.text ?? "", ...sheets.map((sheet) => sheet.text)].map(xmlText).filter(Boolean).join("\n").slice(0, 20_000);
  }
  return "";
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^\uFEFF/, "").slice(0, 20_000);
}

function pdfStreams(bytes: Uint8Array): string[] {
  const latin = Buffer.from(bytes).toString("latin1");
  const found: string[] = [];
  const marked = /\/Length\s+(\d+)[\s\S]{0,300}?stream\r?\n/g;
  for (const match of latin.matchAll(marked)) {
    const start = (match.index ?? 0) + match[0].length;
    const length = Number(match[1]);
    if (!Number.isFinite(length) || length < 0 || start + length > bytes.length) continue;
    const slice = bytes.subarray(start, start + length);
    const decoded = maybeInflate(slice, latin.slice(Math.max(0, (match.index ?? 0) - 400), match.index ?? 0));
    if (decoded) found.push(decoded);
  }
  if (found.length) return found;
  const loose = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (const match of latin.matchAll(loose)) {
    const raw = match[1] ?? "";
    if (raw.length > 8 && /[A-Za-z]/.test(raw)) found.push(raw);
  }
  return found;
}

function maybeInflate(slice: Uint8Array, header: string): string | null {
  const flate = /FlateDecode/.test(header);
  if (flate) {
    const inflated = inflate(slice);
    return inflated ? Buffer.from(inflated).toString("latin1") : null;
  }
  const asText = Buffer.from(slice).toString("latin1");
  return /[A-Za-z(]/.test(asText) ? asText : null;
}

function inflate(slice: Uint8Array): Buffer | null {
  try {
    return inflateRawSync(slice, { maxOutputLength: MAX_OUT });
  } catch {
    try {
      return inflateSync(slice, { maxOutputLength: MAX_OUT });
    } catch {
      return null;
    }
  }
}

function readLiteral(content: string, start: number): { text: string; next: number } | null {
  let text = "";
  let i = start + 1;
  while (i < content.length) {
    const char = content[i];
    if (char === "\\") {
      const next = content[i + 1] ?? "";
      const named: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
      if (named[next]) {
        text += named[next];
        i += 2;
        continue;
      }
      const octal = content.slice(i + 1, i + 4).match(/^[0-7]{1,3}/);
      if (octal) {
        text += String.fromCharCode(parseInt(octal[0], 8));
        i += 1 + octal[0].length;
        continue;
      }
      text += next;
      i += 2;
      continue;
    }
    if (char === ")") return { text, next: i + 1 };
    text += char;
    i += 1;
  }
  return null;
}

function hexToText(hex: string): string {
  const clean = hex.replace(/[^0-9A-Fa-f]/g, "");
  if (clean.length < 2) return "";
  const bytes: number[] = [];
  for (let i = 0; i + 1 < clean.length; i += 2) bytes.push(parseInt(clean.slice(i, i + 2), 16));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let text = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) text += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    return text;
  }
  return String.fromCharCode(...bytes.filter((value) => value === 10 || (value >= 32 && value < 127)));
}

function xmlText(xml: string): string {
  return xml
    .replace(/<w:tab\/>/g, " ")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<\/t>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 20_000);
}

function unzip(bytes: Uint8Array): { name: string; text: string }[] {
  const files: { name: string; text: string }[] = [];
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.length - offset);
    if (view.getUint32(0, true) !== 0x04034b50) break;
    const method = view.getUint16(8, true);
    const compressed = view.getUint32(18, true);
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    if (dataStart + compressed > bytes.length) break;
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength));
    const slice = bytes.subarray(dataStart, dataStart + compressed);
    let data: Uint8Array | null = null;
    if (method === 0) data = slice;
    else if (method === 8) data = inflate(slice);
    if (data && /word\/document\.xml|xl\/sharedStrings\.xml|xl\/worksheets\//.test(name)) {
      files.push({ name, text: new TextDecoder().decode(data) });
    }
    offset = dataStart + compressed;
  }
  return files;
}
