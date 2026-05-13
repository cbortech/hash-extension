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

const value = cbor.fromEDN("hash'foo'");
console.log(value.toEDN({ appStrings: false }));
// h'2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae'

const sha512 = cbor.fromEDN('hash<<"foo", "SHA-512">>');
console.log(sha512.toEDN());
// hash<<'foo', "SHA-512">>
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
