import { describe, expect, it } from 'vitest';
import { decryptPayload, encryptPayload } from '../src/push/webpush';
import { fromB64url, toB64url, utf8 } from '../src/push/b64';

const subtle = globalThis.crypto.subtle;

/** Imports a P-256 key pair from a raw private scalar and raw public point (RFC test vector format). */
async function pair(d: string, pub: string, usage: KeyUsage[]): Promise<CryptoKeyPair> {
  const p = fromB64url(pub);
  const jwk = { kty: 'EC', crv: 'P-256', x: toB64url(p.slice(1, 33)), y: toB64url(p.slice(33, 65)) };
  return {
    privateKey: await subtle.importKey('jwk', { ...jwk, d }, { name: 'ECDH', namedCurve: 'P-256' }, true, usage),
    publicKey: await subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
  };
}

// RFC 8291 Appendix A
const V = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

describe('web push encryption', () => {
  it('matches the RFC 8291 test vector byte for byte', async () => {
    const body = await encryptPayload(utf8(V.plaintext), fromB64url(V.uaPublic), fromB64url(V.auth), {
      salt: fromB64url(V.salt),
      serverKeys: await pair(V.asPrivate, V.asPublic, ['deriveBits']),
    });
    expect(toB64url(body)).toBe(V.body);
  });

  it('the phone side can decrypt what the app encrypts', async () => {
    const ua = (await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    const uaPublic = new Uint8Array(await subtle.exportKey('raw', ua.publicKey));
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const msg = JSON.stringify({ title: 'Chem worksheet', body: 'Start now' });
    const body = await encryptPayload(utf8(msg), uaPublic, auth);
    expect(new TextDecoder().decode(await decryptPayload(body, ua, auth))).toBe(msg);
  });

  it('decrypts the RFC vector with the receiver keys', async () => {
    const ua = await pair(V.uaPrivate, V.uaPublic, ['deriveBits']);
    expect(new TextDecoder().decode(await decryptPayload(fromB64url(V.body), ua, fromB64url(V.auth)))).toBe(V.plaintext);
  });
});
