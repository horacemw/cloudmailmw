import { customAlphabet, nanoid } from 'nanoid';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** URL-safe short id (22 chars) for public identifiers. */
export const shortId = customAlphabet(ALPHABET, 22);

/** Reasonable slug from a display name, safe for URLs & DNS TXT tokens. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || shortId().slice(0, 8);
}

export function opaqueToken(bytes = 32): string {
  return nanoid(bytes);
}
