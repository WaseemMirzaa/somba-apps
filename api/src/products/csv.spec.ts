import { detectDelimiter, parseCsv } from './csv';

describe('parseCsv', () => {
  it('reads plain rows, CRLF or LF, and skips blank lines', () => {
    expect(parseCsv('a,b,c\r\n1,2,3\n\n4,5,6\n')).toEqual([['a', 'b', 'c'], ['1', '2', '3'], ['4', '5', '6']]);
  });
  it('handles quotes, escaped quotes, commas and newlines inside cells', () => {
    expect(parseCsv('name,note\n"Smith, J.","said ""hi""\nthen left"\nplain,""')).toEqual([['name', 'note'], ['Smith, J.', 'said "hi"\nthen left'], ['plain', '']]);
  });
  it('detects semicolons (French Excel) and tabs, ignoring delimiters in quotes', () => {
    expect(detectDelimiter('nom;prix;stock')).toBe(';');
    expect(detectDelimiter('a\tb\tc')).toBe('\t');
    expect(detectDelimiter('"a;b",c,d')).toBe(',');
    expect(parseCsv('nom;prix\nStylo;1,50')).toEqual([['nom', 'prix'], ['Stylo', '1,50']]);
  });
  it('drops a UTF-8 byte-order mark and keeps empty cells and a last line without a newline', () => {
    expect(parseCsv('﻿a,b,c\n1,,3')).toEqual([['a', 'b', 'c'], ['1', '', '3']]);
  });
  it('an empty file has no rows', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('\n\n')).toEqual([]);
  });
});
