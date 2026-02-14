/**
 * Redly Package Utilities
 *
 * Redly-specific serialization helpers that support full Unicode (UTF-8),
 * unlike the legacy packageUtils which use Latin-1 for backward compatibility.
 */

import { strToU8 } from 'fflate';

/**
 * Recursively sort all object keys so that `JSON.stringify` produces
 * deterministic output suitable for checksumming.
 */
const deepSortKeys = (value: unknown): unknown => {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(deepSortKeys);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort((a, b) => a.localeCompare(b))) {
      sorted[key] = deepSortKeys(obj[key]);
    }
    return sorted;
  }
  return value;
};

/**
 * Serialize a value to UTF-8 encoded bytes via JSON.stringify.
 *
 * Uses proper UTF-8 encoding (not Latin-1) to support full Unicode,
 * including CJK characters, emoji, diacritics, etc.
 *
 * Object keys are sorted for deterministic checksums.
 * Round-trip validation ensures the JSON is correct before encoding.
 */
export const redlyJsonToBytes = (value: unknown): Uint8Array => {
  const sorted = deepSortKeys(value);
  const json = JSON.stringify(sorted);

  // Round-trip validation
  JSON.parse(json);

  // strToU8 without `true` flag = proper UTF-8 encoding
  return strToU8(json);
};

/**
 * Concatenate multiple Uint8Array chunks into a single array.
 */
export const redlyConcatBytes = (chunks: Uint8Array[]): Uint8Array => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

/**
 * Compute SHA-256 hex hash of bytes.
 * Returns empty string if crypto.subtle is unavailable.
 */
export const redlySha256Hex = async (bytes: Uint8Array): Promise<string> => {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return '';
};

/**
 * Verify the output begins with the ZIP local file header (PK\x03\x04).
 */
export const redlyVerifyZipHeader = (bytes: Uint8Array): void => {
  if (
    !bytes ||
    bytes.length < 4 ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b ||
    bytes[2] !== 0x03 ||
    bytes[3] !== 0x04
  ) {
    throw new Error(
      'Export produced invalid ZIP: missing PK header. ' +
        `Got bytes [${bytes?.[0]}, ${bytes?.[1]}, ${bytes?.[2]}, ${bytes?.[3]}] (expected [80, 75, 3, 4]).`,
    );
  }
};
