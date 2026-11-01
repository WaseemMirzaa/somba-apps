import { pdfText } from '../../testing/pdf-text';
import { PdfDoc, textWidth, toWinAnsi } from './mini-pdf';

describe('mini PDF writer', () => {
  it('writes a well-formed file: header, objects, xref with right offsets, trailer', () => {
    const doc = new PdfDoc({ title: 'Test', author: 'Somba' });
    doc.text(40, 60, 'Hello', { size: 12 });
    doc.line(40, 70, 200, 70);
    doc.rect(40, 80, 100, 20);
    const buf = doc.toBuffer();
    const text = buf.toString('latin1');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    // Every xref offset points at "N 0 obj".
    const xref = /xref\n0 (\d+)\n([\s\S]*?)trailer/.exec(text)!;
    const entries = xref[2].trim().split('\n').slice(1);
    entries.forEach((e, i) => {
      const off = Number(e.slice(0, 10));
      expect(text.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
    expect(Number(xref[1])).toBe(entries.length + 1);
    const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
  });

  it('each page content stream length matches', () => {
    const doc = new PdfDoc();
    doc.text(10, 10, 'one');
    doc.addPage();
    doc.text(10, 10, 'two');
    const text = doc.toBuffer().toString('latin1');
    expect(doc.pageCount).toBe(2);
    expect(/\/Count 2/.test(text)).toBe(true);
    for (const m of text.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)) expect(m[2].length).toBe(Number(m[1]));
  });

  it('keeps French accents and typographic characters (WinAnsi), replaces what it cannot show', () => {
    const doc = new PdfDoc();
    doc.text(10, 10, 'Facture émise à Kinshasa — n° 5, l’été « ok » €');
    doc.text(10, 30, 'Chinese 汉字');
    const shown = pdfText(doc.toBuffer());
    expect(shown[0]).toBe(Buffer.from([...toWinAnsi('Facture émise à Kinshasa — n° 5, l’été « ok » €')]).toString('latin1'));
    expect(toWinAnsi('é')[0]).toBe(0xe9);
    expect(toWinAnsi('’')[0]).toBe(0x92);
    expect(toWinAnsi('€')[0]).toBe(0x80);
    expect(toWinAnsi('汉').toString()).toBe('?');
    expect(toWinAnsi('a b').toString()).toBe('a b');
  });

  it('right-aligned text ends where asked', () => {
    const w = textWidth('12.50', 10);
    const doc = new PdfDoc();
    doc.text(500, 100, '12.50', { size: 10, align: 'right' });
    const x = Number(/BT \/F1 10 Tf ([\d.]+) /.exec(doc.toBuffer().toString('latin1'))![1]);
    expect(x + w).toBeCloseTo(500, 1);
  });
});
