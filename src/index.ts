import { type CborExtension, type ToCDNOptions } from '@cbortech/cbor';
import {
  CborByteString,
  CborNint,
  CborTextString,
  CborUint,
  type CborItem,
} from '@cbortech/cbor/ast';
import { sha1 } from '@noble/hashes/legacy.js';
import { sha256, sha384, sha512, sha512_256 } from '@noble/hashes/sha2.js';
import { shake128_32, shake256_64 } from '@noble/hashes/sha3.js';

type HashFn = (data: Uint8Array) => Uint8Array;

const PREFIX_HASH = 'hash';
const DEFAULT_ALGORITHM_ID = -16;

const COSE_HASH_FN = new Map<number, HashFn>([
  [-14, sha1],
  [-15, (data) => sha256(data).slice(0, 8)],
  [-16, sha256],
  [-17, sha512_256],
  [-18, shake128_32],
  [-43, sha384],
  [-44, sha512],
  [-45, shake256_64],
]);

const COSE_NAME_TO_ID = new Map<string, number>([
  ['SHA-1', -14],
  ['SHA-256/64', -15],
  ['SHA-256', -16],
  ['SHA-512/256', -17],
  ['SHAKE128', -18],
  ['SHA-384', -43],
  ['SHA-512', -44],
  ['SHAKE256', -45],
]);

const COSE_ID_TO_NAME = new Map<number, string>(
  [...COSE_NAME_TO_ID.entries()].map(([name, id]) => [id, name])
);

export class CborHashExt extends CborByteString {
  private readonly input: CborTextString | CborByteString;
  private readonly algorithmId: number;

  constructor(
    output: Uint8Array,
    input: CborTextString | CborByteString,
    algorithmId: number
  ) {
    super(output);
    this.input = input;
    this.algorithmId = algorithmId;
  }

  override _toCDN(options: ToCDNOptions | undefined, depth: number): string {
    if (options?.appStrings === false) return super._toCDN(options, depth);

    const isDefault = this.algorithmId === DEFAULT_ALGORITHM_ID;

    if (this.input instanceof CborTextString && isDefault) {
      return `${PREFIX_HASH}${escapeAppString(this.input.value)}`;
    }

    const dataEdn =
      this.input instanceof CborTextString
        ? escapeAppString(this.input.value)
        : serializeBytes(
            this.input.value,
            options?.bstrEncoding ?? 'hex',
            options?.sqstr
          );

    if (isDefault) return `${PREFIX_HASH}<<${dataEdn}>>`;

    const algorithmName = COSE_ID_TO_NAME.get(this.algorithmId);
    const algorithmEdn =
      algorithmName === undefined
        ? String(this.algorithmId)
        : `"${algorithmName}"`;
    return `${PREFIX_HASH}<<${dataEdn}, ${algorithmEdn}>>`;
  }
}

function resolveAlgorithmId(item: CborItem): number {
  if (item instanceof CborUint) return Number(item.value);
  if (item instanceof CborNint) return Number(item.value);
  if (item instanceof CborTextString) {
    const id = COSE_NAME_TO_ID.get(item.value);
    if (id === undefined) {
      throw new SyntaxError(
        `hash: unknown algorithm name: ${JSON.stringify(item.value)}`
      );
    }
    return id;
  }
  throw new SyntaxError('hash: algorithm must be an integer or text string');
}

function computeHash(
  input: CborTextString | CborByteString,
  algorithmId: number
): CborHashExt {
  const data =
    input instanceof CborTextString
      ? new TextEncoder().encode(input.value)
      : input.value;
  const fn = COSE_HASH_FN.get(algorithmId);
  if (fn === undefined) {
    throw new SyntaxError(`hash: unsupported COSE algorithm ID ${algorithmId}`);
  }
  return new CborHashExt(fn(data), input, algorithmId);
}

export const hash: CborExtension = {
  appStringPrefixes: [PREFIX_HASH],

  parseAppString(_prefix: string, content: string): CborItem {
    return computeHash(new CborTextString(content), DEFAULT_ALGORITHM_ID);
  },

  parseAppSequence(_prefix: string, items: CborItem[]): CborItem {
    if (items.length === 0 || items.length > 2) {
      throw new SyntaxError(
        `hash<<...>>: expected 1 or 2 items, got ${items.length}`
      );
    }

    const input = items[0];
    if (
      !(input instanceof CborTextString) &&
      !(input instanceof CborByteString)
    ) {
      throw new SyntaxError(
        'hash: first argument must be a text or byte string'
      );
    }

    const algorithmId =
      items.length === 2 ? resolveAlgorithmId(items[1]) : DEFAULT_ALGORITHM_ID;
    return computeHash(input, algorithmId);
  },
};

export default hash;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '');
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_');
}

const B32_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const H32_ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUV';

function base32Encode(bytes: Uint8Array, alphabet: string): string {
  let result = '';
  let buffer = 0;
  let bufferBits = 0;

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bufferBits += 8;
    while (bufferBits >= 5) {
      bufferBits -= 5;
      result += alphabet[(buffer >> bufferBits) & 0x1f];
    }
  }

  if (bufferBits > 0) result += alphabet[(buffer << (5 - bufferBits)) & 0x1f];
  return result;
}

function serializeBytes(
  bytes: Uint8Array,
  encoding?: 'hex' | 'base64' | 'base64url' | 'base32' | 'base32hex',
  sqstr?: 'printable-string' | 'string' | 'none'
): string {
  if (sqstr === 'string') {
    const text = tryDecodeUtf8(bytes);
    if (text !== null) return escapeSingleQuoted(text);
  }

  if (sqstr === 'printable-string' || sqstr === undefined) {
    const text = tryDecodeUtf8(bytes);
    if (text !== null && !hasNonPrintable(text)) {
      return escapeSingleQuoted(text);
    }
  }

  switch (encoding) {
    case 'base64':
      return `b64'${toBase64(bytes)}'`;
    case 'base64url':
      return `b64'${toBase64Url(bytes)}'`;
    case 'base32':
      return `b32'${base32Encode(bytes, B32_ALPHA)}'`;
    case 'base32hex':
      return `h32'${base32Encode(bytes, H32_ALPHA)}'`;
    case 'hex':
    default:
      return `h'${toHex(bytes)}'`;
  }
}

function tryDecodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function hasNonPrintable(value: string): boolean {
  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (codePoint !== undefined && (codePoint < 0x20 || codePoint === 0x7f)) {
      return true;
    }
  }
  return false;
}

function escapeAppString(value: string): string {
  return escapeQuoted(value, "'");
}

function escapeSingleQuoted(value: string): string {
  return escapeQuoted(value, "'");
}

function escapeQuoted(value: string, quote: string): string {
  let result = quote;
  const quoteCodePoint = quote.codePointAt(0);

  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) continue;

    switch (char) {
      case '\\':
        result += '\\\\';
        break;
      case '\n':
        result += '\\n';
        break;
      case '\r':
        result += '\\r';
        break;
      case '\t':
        result += '\\t';
        break;
      default:
        if (codePoint === quoteCodePoint) {
          result += `\\${quote}`;
        } else if (
          codePoint < 0x20 ||
          codePoint === 0x7f ||
          codePoint === 0x2028 ||
          codePoint === 0x2029 ||
          codePoint === 0x200b ||
          codePoint === 0x200c ||
          codePoint === 0x200d ||
          codePoint === 0xfeff
        ) {
          result += `\\u${codePoint.toString(16).padStart(4, '0')}`;
        } else {
          result += char;
        }
    }
  }

  return result + quote;
}
