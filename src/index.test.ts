import { describe, expect, test } from 'vitest';
import { CBOR } from '@cbortech/cbor';
import { CborByteString } from '@cbortech/cbor/ast';
import { CborHashExt, hash } from './index';

const SHA1_FOO = '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33';
const SHA256_64_FOO = '2c26b46b68ffc68f';
const SHA256_FOO =
  '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae';
const SHA512_256_FOO =
  'd58042e6aa5a335e03ad576c6a9e43b41591bfd2077f72dec9df7930e492055d';
const SHAKE128_32_FOO =
  'f84e95cb5fbd2038863ab27d3cdeac295ad2d4ab96ad1f4b070c0bf36078ef08';
const SHA384_FOO =
  '98c11ffdfdd540676b1a137cb1a22b2a70350c9a44171d6b1180c6be5cbb2ee3f79d532c8a1dd9ef2e8e08e752a3babb';
const SHA512_FOO =
  'f7fbba6e0636f890e56fbbf3283e524c6fa3204ae298382d624741d0dc6638326e282c41be5e4254d8820772c5518a2c5a8c0c7f7eda19594a7eb539453e1ed7';
const SHAKE256_64_FOO =
  '1af97f7818a28edfdfce5ec66dbdc7e871813816d7d585fe1f12475ded5b6502b7723b74e2ee36f2651a10a8eaca72aa9148c3c761aaceac8f6d6cc64381ed39';

const cbor = new CBOR({ extensions: [hash] });

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

describe("hash — hash'...'", () => {
  test("hash'foo' produces a SHA-256 byte string", () => {
    const value = cbor.fromEDN("hash'foo'");

    expect(value).toBeInstanceOf(CborHashExt);
    expect(value).toBeInstanceOf(CborByteString);
    expect((value as CborByteString).value).toEqual(fromHex(SHA256_FOO));
    expect(value.toEDN()).toBe("hash'foo'");
  });

  test('raw app-string form is accepted', () => {
    const value = cbor.fromEDN('hash`foo`');

    expect(value).toBeInstanceOf(CborHashExt);
    expect((value as CborByteString).value).toEqual(fromHex(SHA256_FOO));
    expect(value.toEDN()).toBe("hash'foo'");
  });

  test('appStrings:false falls back to plain byte-string notation', () => {
    const value = cbor.fromEDN("hash'foo'");

    expect(value.toEDN({ appStrings: false })).toBe(`h'${SHA256_FOO}'`);
  });

  test("hash'' hashes empty input", () => {
    const value = cbor.fromEDN("hash''");
    const expected =
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    expect((value as CborByteString).value).toEqual(fromHex(expected));
  });
});

describe('hash — app-sequence form', () => {
  test("hash<<'foo'>> uses default SHA-256 over byte-string input", () => {
    const value = cbor.fromEDN("hash<<'foo'>>");

    expect((value as CborByteString).value).toEqual(fromHex(SHA256_FOO));
    expect(value.toEDN()).toBe("hash<<'foo'>>");
  });

  test('hash<<"foo">> normalizes text input to hash string form', () => {
    const value = cbor.fromEDN('hash<<"foo">>');

    expect((value as CborByteString).value).toEqual(fromHex(SHA256_FOO));
    expect(value.toEDN()).toBe("hash'foo'");
  });

  test("hash<<h'0102', -16>> hashes raw bytes", () => {
    const value = cbor.fromEDN("hash<<h'0102', -16>>");
    const expected =
      'a12871fee210fb8619291eaea194581cbd2531e4b23759d225f6806923f63222';

    expect((value as CborByteString).value).toEqual(fromHex(expected));
    expect(value.toEDN()).toBe("hash<<h'0102'>>");
  });
});

describe('hash — COSE algorithms', () => {
  test.each([
    [-14, 'SHA-1', SHA1_FOO, 20],
    [-15, 'SHA-256/64', SHA256_64_FOO, 8],
    [-16, 'SHA-256', SHA256_FOO, 32],
    [-17, 'SHA-512/256', SHA512_256_FOO, 32],
    [-18, 'SHAKE128', SHAKE128_32_FOO, 32],
    [-43, 'SHA-384', SHA384_FOO, 48],
    [-44, 'SHA-512', SHA512_FOO, 64],
    [-45, 'SHAKE256', SHAKE256_64_FOO, 64],
  ])('supports %s / %s', (id, name, expected, length) => {
    const byId = cbor.fromEDN(`hash<<'foo', ${id}>>`);
    const byName = cbor.fromEDN(`hash<<'foo', "${name}">>`);

    expect((byId as CborByteString).value).toEqual(fromHex(expected));
    expect((byName as CborByteString).value).toEqual(fromHex(expected));
    expect((byId as CborByteString).value).toHaveLength(length);
  });

  test('non-default algorithms serialize with the registered COSE name', () => {
    const value = cbor.fromEDN('hash<<"foo", -44>>');

    expect(value.toEDN()).toBe('hash<<\'foo\', "SHA-512">>');
  });

  test('explicit default algorithm is omitted for text input', () => {
    const value = cbor.fromEDN('hash<<"foo", "SHA-256">>');

    expect(value.toEDN()).toBe("hash'foo'");
  });

  test('explicit default algorithm ID is omitted for text input', () => {
    const value = cbor.fromEDN('hash<<"foo", -16>>');

    expect(value.toEDN()).toBe("hash'foo'");
  });
});

describe('hash — serialization options', () => {
  test('explicit default algorithm ID is omitted for byte-string input', () => {
    const value = cbor.fromEDN("hash<<'foo', -16>>");

    expect(value.toEDN()).toBe("hash<<'foo'>>");
  });

  test('printable byte-string input stays in sqstr notation by default', () => {
    const value = cbor.fromEDN("hash<<'foo', -44>>");

    expect(value.toEDN()).toBe('hash<<\'foo\', "SHA-512">>');
  });

  test('binary byte-string input stays in hex notation by default', () => {
    const value = cbor.fromEDN("hash<<h'0102', -44>>");

    expect(value.toEDN()).toBe('hash<<h\'0102\', "SHA-512">>');
  });

  test("sqstr:none serializes byte-string input as h'...'", () => {
    const value = cbor.fromEDN("hash<<'foo'>>");

    expect(value.toEDN({ sqstr: 'none' })).toBe("hash<<h'666f6f'>>");
  });

  test('bstrEncoding controls byte-string input notation', () => {
    const value = cbor.fromEDN("hash<<h'0102', -44>>");

    expect(value.toEDN({ bstrEncoding: 'base64' })).toBe(
      'hash<<b64\'AQI\', "SHA-512">>'
    );
  });
});

describe('hash — CBOR round-trip', () => {
  test('encoded hash output decodes as the same byte string', () => {
    const encoded = cbor.fromEDN("hash'foo'").toCBOR();
    const decoded = cbor.fromCBOR(encoded);

    expect(decoded).toBeInstanceOf(CborByteString);
    expect((decoded as CborByteString).value).toEqual(fromHex(SHA256_FOO));
  });
});

describe('hash — invalid input', () => {
  test('uppercase HASH prefix is not claimed by this extension', () => {
    const value = cbor.fromEDN("HASH'foo'");

    expect(value).not.toBeInstanceOf(CborHashExt);
    expect(value.toEDN()).toBe("HASH'foo'");
  });

  test.each([
    'hash<<>>',
    'hash<<\'foo\', -16, "extra">>',
    'hash<<42>>',
    "hash<<'foo', 999>>",
    'hash<<\'foo\', "MD5">>',
  ])('%s throws SyntaxError', (source) => {
    expect(() => cbor.fromEDN(source)).toThrow(SyntaxError);
  });
});
