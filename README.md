# @cbortech/hash-extension

Cryptographic hash application-string extension for [`@cbortech/cbor`](https://www.npmjs.com/package/@cbortech/cbor).

This extension implements the `hash` application-extension identifier from CBOR Extended Diagnostic Notation (EDN). It computes a cryptographic hash and returns the output as a CBOR byte string.

## Installation

```bash
npm install @cbortech/cbor @cbortech/hash-extension
```

## Usage

```ts
import { CBOR } from '@cbortech/cbor';
import { hash } from '@cbortech/hash-extension';

const cbor = new CBOR({ extensions: [hash] });

// Parse CBOR-EDN containing hash values.
const document = cbor.parse(`{
  "hash": hash'foo'
}`);
// document.hash is a bare Uint8Array.

// Convert CBOR-EDN containing a hash value into CBOR.
const encoded = cbor.fromEDN("hash'foo'").toCBOR();
// encoded is CBOR binary data stored as a Uint8Array.
// Inspect the encoded CBOR value with toHexDump():
console.log(CBOR.fromCBOR(encoded).toHexDump());
// 58 20 2C 26 B4 6B 68 FF C6 8F F9 9B 45 3C 1D 30 41 34 13 42 2D 70 64 83 BF A0 F9 8A 5E 88 62 66 E7 AE  -- h'2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae'

// Format CBOR-EDN with hash values as h'...'.
console.log(cbor.format(`{ "hash" : hash'foo' }`, { appStrings: false }));
// {"hash":h'2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae'}
```

## EDN Forms

- `hash'foo'` computes SHA-256 over the UTF-8 text `foo`.
- `hash<<'foo'>>` computes SHA-256 over the byte string `foo`.
- `hash<<"foo">>` computes SHA-256 over the UTF-8 text `foo`.
- `hash<<h'0102', -16>>` computes SHA-256 over raw bytes.
- `hash<<'foo', -44>>` selects an algorithm by COSE integer ID.
- `hash<<'foo', "SHA-512">>` selects an algorithm by COSE algorithm name.

No uppercase `HASH` variant is defined.

## Supported Algorithms

- `-14` / `SHA-1`
- `-15` / `SHA-256/64`
- `-16` / `SHA-256`
- `-17` / `SHA-512/256`
- `-18` / `SHAKE128`
- `-43` / `SHA-384`
- `-44` / `SHA-512`
- `-45` / `SHAKE256`

## License

Apache-2.0
