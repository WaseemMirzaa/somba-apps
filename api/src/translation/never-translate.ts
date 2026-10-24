/**
 * Text that is copied as-is instead of being sent to a translator: it has no language to translate, and a
 * translator would only mangle it (and bill for it). Seller and store names never reach this code at all:
 * they are not translatable fields.
 */
const SIZE = /^(?:[2-6]?X{0,3}[SL]|XS|XXS|M|OS|ONE SIZE)$/i;
const REGION_SIZE = /^(?:EU|US|UK|FR|CM|IT|JP)\s?\d{1,3}(?:[.,]\d)?$/i;
/** 128GB, 5000 mAh, 25 W, 1.5L, 20cm, 12 V, 60Hz… */
const MEASURE = /^\d+(?:[.,]\d+)?\s?(?:GB|TB|MB|KB|mAh|Ah|W|kW|V|Hz|kg|g|mg|cm|mm|m|km|ml|cl|l|L|"|in|inch|pcs|x)$/i;
/** A single token mixing letters and digits: A15, XM5, S24, RTX4090. */
const MODEL_TOKEN = /^(?=.*\d)(?=.*\p{L})[\p{L}\d\-+./]+$/u;
/** A word followed by a number or a model token: iPhone 15, Galaxy S24, Pixel 8. ("Pixel 8 Pro" has a plain word after it: translated.) */
const WORD_MODEL = /^\p{L}+\s+(?=\S*\d)\S+$/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s().-]{7,}$/;
const URL_LIKE = /^(?:https?:\/\/|www\.)\S+$/i;

/** True when the text carries language worth translating. */
export function shouldTranslate(text: string | null | undefined): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  if (!/\p{L}/u.test(t)) return false; // digits, symbols, punctuation only
  if (SIZE.test(t) || REGION_SIZE.test(t) || MEASURE.test(t)) return false;
  if (EMAIL.test(t) || PHONE.test(t) || URL_LIKE.test(t)) return false;
  if (!/\s/.test(t) && MODEL_TOKEN.test(t)) return false;
  if (WORD_MODEL.test(t)) return false;
  return true;
}
