/** The text a PDF made by `PdfDoc` shows: every `<hex> Tj`, decoded from WinAnsi (latin1 is close enough for tests). */
export function pdfText(buf: Buffer): string[] {
  const out: string[] = [];
  for (const m of buf.toString('latin1').matchAll(/<([0-9a-f]*)> Tj/g)) out.push(Buffer.from(m[1], 'hex').toString('latin1'));
  return out;
}
