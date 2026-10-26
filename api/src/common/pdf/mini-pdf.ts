/**
 * A very small PDF writer (no dependency): A4 pages, the built-in Helvetica and Helvetica-Bold, text, lines and
 * filled rectangles. Enough for an invoice. Text is written as WinAnsi (cp1252) hex strings, so French accents and
 * typographic quotes come out right; a character outside cp1252 becomes "?".
 *
 * Coordinates are in points from the TOP-LEFT of the page (the writer flips them for PDF), page size 595 x 842.
 */
export const PAGE_W = 595;
export const PAGE_H = 842;

/** cp1252 bytes for the characters between 0x80 and 0x9F (everything else below 0x100 maps to itself). */
const CP1252_HIGH: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c,
  'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b,
  'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

export function toWinAnsi(text: string): Buffer {
  const out: number[] = [];
  for (const ch of text.normalize('NFC')) {
    const code = ch.codePointAt(0)!;
    if (CP1252_HIGH[ch] !== undefined) out.push(CP1252_HIGH[ch]);
    else if (code === 0x202f || code === 0x00a0) out.push(0x20); // narrow / no-break space -> space
    else if (code === 0x2192) out.push(0x2d, 0x3e); // arrow -> ->
    else if (code === 0x00b7) out.push(0xb7);
    else if (code < 0x20) out.push(0x20);
    else if (code < 0x100 && !(code >= 0x80 && code <= 0x9f)) out.push(code);
    else out.push(0x3f);
  }
  return Buffer.from(out);
}

const hex = (b: Buffer) => `<${b.toString('hex')}>`;
const num = (n: number) => (Math.round(n * 100) / 100).toString();

/** Average glyph widths (per 1000 em) of Helvetica, enough to right-align and wrap text without font metrics files. */
const HELV: Record<string, number> = {
  ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015, I: 278, J: 500, M: 833, W: 944, f: 278, i: 222, j: 222, l: 222, m: 833, r: 333, t: 278, w: 722,
  '|': 260, '·': 278,
};
const HELV_BOLD_EXTRA = 1.06;

/** Width of a string in points at a font size (approximate: exact enough for layout). */
export function textWidth(text: string, size: number, bold = false): number {
  let w = 0;
  for (const ch of text) {
    if (HELV[ch] !== undefined) w += HELV[ch];
    else if (ch >= '0' && ch <= '9') w += 556;
    else if (ch >= 'A' && ch <= 'Z') w += 667;
    else w += 530;
  }
  return (w / 1000) * size * (bold ? HELV_BOLD_EXTRA : 1);
}

interface Page {
  ops: string[];
}

export class PdfDoc {
  private pages: Page[] = [];
  private current!: Page;

  constructor(private readonly meta: { title?: string; author?: string } = {}) {
    this.addPage();
  }

  addPage(): void {
    this.current = { ops: [] };
    this.pages.push(this.current);
  }

  get pageCount(): number {
    return this.pages.length;
  }

  /** Draw text with its baseline at `y` (from the top). `align: 'right'` ends the text at `x`. */
  text(x: number, y: number, text: string, opts: { size?: number; bold?: boolean; align?: 'left' | 'right' | 'center'; gray?: number } = {}): void {
    const size = opts.size ?? 10;
    const w = textWidth(text, size, opts.bold);
    const px = opts.align === 'right' ? x - w : opts.align === 'center' ? x - w / 2 : x;
    const g = opts.gray ?? 0;
    this.current.ops.push(`${num(g)} g BT /${opts.bold ? 'F2' : 'F1'} ${num(size)} Tf ${num(px)} ${num(PAGE_H - y)} Td ${hex(toWinAnsi(text))} Tj ET`);
  }

  line(x1: number, y1: number, x2: number, y2: number, opts: { width?: number; gray?: number } = {}): void {
    this.current.ops.push(`${num(opts.gray ?? 0.6)} G ${num(opts.width ?? 0.5)} w ${num(x1)} ${num(PAGE_H - y1)} m ${num(x2)} ${num(PAGE_H - y2)} l S`);
  }

  /** A filled rectangle whose top-left corner is (x, y). */
  rect(x: number, y: number, w: number, h: number, gray = 0.93): void {
    this.current.ops.push(`${num(gray)} g ${num(x)} ${num(PAGE_H - y - h)} ${num(w)} ${num(h)} re f`);
  }

  /** The finished file. */
  toBuffer(): Buffer {
    const objects: Buffer[] = [];
    const add = (body: string | Buffer): number => {
      objects.push(Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1'));
      return objects.length; // object numbers start at 1
    };
    // 1 catalog, 2 pages, 3 helvetica, 4 helvetica-bold, then (page, content) pairs, then info.
    add('<< /Type /Catalog /Pages 2 0 R >>');
    add(''); // pages (filled below)
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids: number[] = [];
    for (const page of this.pages) {
      const stream = Buffer.from(page.ops.join('\n'), 'latin1');
      const contentNo = objects.length + 2;
      const pageNo = add(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNo} 0 R >>`,
      );
      kids.push(pageNo);
      add(Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'latin1'), stream, Buffer.from('\nendstream', 'latin1')]));
    }
    objects[1] = Buffer.from(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`, 'latin1');
    const infoParts = [
      this.meta.title ? `/Title ${hex(toWinAnsi(this.meta.title))}` : '',
      this.meta.author ? `/Author ${hex(toWinAnsi(this.meta.author))}` : '',
      `/Producer ${hex(toWinAnsi('Somba&Teka'))}`,
    ].filter(Boolean);
    const infoNo = add(`<< ${infoParts.join(' ')} >>`);

    const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
    const offsets: number[] = [];
    let pos = chunks[0].length;
    objects.forEach((body, i) => {
      offsets.push(pos);
      const part = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), body, Buffer.from('\nendobj\n', 'latin1')]);
      chunks.push(part);
      pos += part.length;
    });
    const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
    chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoNo} 0 R >>\nstartxref\n${pos}\n%%EOF\n`, 'latin1'));
    return Buffer.concat(chunks);
  }
}
