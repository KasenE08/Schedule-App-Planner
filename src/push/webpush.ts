// Web Push message encryption (RFC 8291, aes128gcm). Runs on the phone, so the
// notification server only ever stores and forwards ciphertext.
import { concat, utf8 } from './b64';

const subtle = () => globalThis.crypto.subtle;
type Bytes = Uint8Array<ArrayBuffer>;
const buf = (b: Uint8Array) => b as Bytes;

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await subtle().importKey('raw', buf(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle().sign('HMAC', k, buf(data)));
}

/** HKDF with a single 32-byte expand block, truncated to `len`. */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const prk = await hmac(salt, ikm);
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, len);
}

const importPublic = (raw: Uint8Array) =>
  subtle().importKey('raw', buf(raw), { name: 'ECDH', namedCurve: 'P-256' }, true, []);

async function ecdh(priv: CryptoKey, pubRaw: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle().deriveBits({ name: 'ECDH', public: await importPublic(pubRaw) }, priv, 256));
}

async function keys(ikm: Uint8Array, salt: Uint8Array) {
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);
  return { key: await subtle().importKey('raw', buf(cek), 'AES-GCM', false, ['encrypt', 'decrypt']), nonce };
}

const keyInfo = (uaPublic: Uint8Array, asPublic: Uint8Array) => concat(utf8('WebPush: info\0'), uaPublic, asPublic);

export interface EncryptOptions {
  /** Fixed values for tests only; normally random. */
  salt?: Uint8Array;
  serverKeys?: CryptoKeyPair;
}

/**
 * Encrypts `plaintext` for a push subscription (its p256dh public key and auth secret).
 * Returns the complete request body: header (salt, record size, sender key) + ciphertext.
 */
export async function encryptPayload(
  plaintext: Uint8Array,
  uaPublic: Uint8Array,
  authSecret: Uint8Array,
  opts: EncryptOptions = {},
): Promise<Uint8Array> {
  const salt = opts.salt ?? globalThis.crypto.getRandomValues(new Uint8Array(16));
  const as =
    opts.serverKeys ?? ((await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair);
  const asPublic = new Uint8Array(await subtle().exportKey('raw', as.publicKey));
  const shared = await ecdh(as.privateKey, uaPublic);
  const ikm = await hkdf(authSecret, shared, keyInfo(uaPublic, asPublic), 32);
  const { key, nonce } = await keys(ikm, salt);
  const padded = concat(plaintext, new Uint8Array([2])); // single, final record
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: buf(nonce) }, key, buf(padded)));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

/** The receiving side of encryptPayload (what the phone's push service does); used in tests. */
export async function decryptPayload(body: Uint8Array, uaKeys: CryptoKeyPair, authSecret: Uint8Array): Promise<Uint8Array> {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const uaPublic = new Uint8Array(await subtle().exportKey('raw', uaKeys.publicKey));
  const shared = await ecdh(uaKeys.privateKey, asPublic);
  const ikm = await hkdf(authSecret, shared, keyInfo(uaPublic, asPublic), 32);
  const { key, nonce } = await keys(ikm, salt);
  const padded = new Uint8Array(
    await subtle().decrypt({ name: 'AES-GCM', iv: buf(nonce) }, key, buf(body.slice(21 + idlen))),
  );
  let end = padded.length - 1;
  while (end > 0 && padded[end] === 0) end--;
  return padded.slice(0, end); // drop the 0x02 delimiter
}
