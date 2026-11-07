import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { textFromFile, textFromOffice, textFromPdf } from "./file-text";

describe("text pulled from a file", () => {
  it("reads a PDF text layer, including a compressed stream", () => {
    const plain = "BT (Insurance expiry 12/03/2026) Tj ET";
    const open = textFromPdf(Buffer.from(`%PDF-1.1
1 0 obj
<< /Length ${plain.length} >>
stream
${plain}
endstream
endobj
`));
    expect(open).toContain("Insurance expiry 12/03/2026");

    const content = "BT (Policy EN-100) Tj ET";
    const packed = deflateRawSync(Buffer.from(content));
    const head = Buffer.from(`%PDF-1.4
1 0 obj
<< /Filter /FlateDecode /Length ${packed.length} >>
stream\n`);
    const file = Buffer.concat([head, packed, Buffer.from("\nendstream\nendobj\n")]);
    expect(textFromPdf(file)).toContain("Policy EN-100");
  });

  it("reads a Word document and a spreadsheet from their stored text", () => {
    const docx = storedZip([{
      name: "word/document.xml",
      data: "<w:p><w:r><w:t>Roadworthiness expiry 01/06/2027</w:t></w:r></w:p>",
    }]);
    expect(textFromOffice(docx)).toContain("Roadworthiness expiry 01/06/2027");
    const sheet = storedZip([{
      name: "xl/sharedStrings.xml",
      data: "<sst><si><t>Insurance</t></si><si><t>Policy EN-9</t></si></sst>",
    }]);
    expect(textFromFile(sheet, "cover.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toContain("Policy EN-9");
    expect(textFromFile(new Uint8Array(), "empty.pdf", "application/pdf")).toBe("");
  });
});

function storedZip(files: { name: string; data: string }[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const encoder = new TextEncoder();
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.data);
    const header = new Uint8Array(30 + name.length + data.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(8, 0, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, name.length, true);
    header.set(name, 30);
    header.set(data, 30 + name.length);
    chunks.push(header);
  }
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
