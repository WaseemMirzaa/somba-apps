import { ValueTransformer } from 'typeorm';

/** Keeps DECIMAL columns as JS numbers instead of strings. */
export class NumericTransformer implements ValueTransformer {
  // Return undefined for nullish so TypeORM falls back to the column DEFAULT
  // (instead of forcing NULL into a NOT NULL column with a default).
  to(value?: number | null): number | undefined {
    return value === null || value === undefined ? undefined : value;
  }
  from(value?: string | null): number | null {
    if (value === null || value === undefined) return null;
    return parseFloat(value as string);
  }
}

export const numeric = new NumericTransformer();
