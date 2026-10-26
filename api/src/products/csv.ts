/** A small CSV reader (RFC 4180): quoted cells, "" escapes, commas / semicolons / tabs, CRLF or LF, a leading BOM. */

/** Picks the delimiter that splits the header line into the most cells (French Excel writes semicolons). */
export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  let best: ',' | ';' | '\t' = ',';
  let bestCount = -1;
  for (const d of [',', ';', '\t'] as const) {
    // Count delimiters outside quotes.
    let inQ = false;
    let n = 0;
    for (const ch of first) {
      if (ch === '"') inQ = !inQ;
      else if (ch === d && !inQ) n++;
    }
    if (n > bestCount) {
      best = d;
      bestCount = n;
    }
  }
  return best;
}

/** Parses CSV text into rows of cells. Fully blank lines are skipped. */
export function parseCsv(input: string, delimiter = detectDelimiter(input)): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let sawAny = false;
  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    if (row.some((c) => c.trim() !== '') || sawAny) rows.push(row);
    row = [];
    sawAny = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') {
      inQuotes = true;
      sawAny = true;
    } else if (ch === delimiter) endCell();
    else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      endRow();
    } else if (ch === '\n') endRow();
    else cell += ch;
  }
  if (cell !== '' || row.length) endRow();
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}
