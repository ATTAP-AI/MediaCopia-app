/* MediaCopia — envelope encryption for sync, ported from CatchAll's crypto.js (Web Crypto, no libraries).

     passphrase --PBKDF2-SHA256 (600k)--> key-encryption key (KEK)
     KEK --AES-GCM wrap--> data key (random AES-256-GCM), stored on the server as the "keyring"
     data key --AES-GCM--> every synced record

   The server only ever sees the wrapped key and encrypted records. Each record is bound to its id with
   AES-GCM additional data, so records can't be swapped between ids. "Remember on this device" seals the data
   key with a non-extractable key the browser keeps, so the passphrase is needed once per device. */
window.MC = window.MC || {};
MC.crypto = (() => {
  const PBKDF2_ITERATIONS = 600_000;
  const AES = { name: 'AES-GCM', length: 256 };
  const enc = new TextEncoder(), dec = new TextDecoder();
  const randomBytes = n => crypto.getRandomValues(new Uint8Array(n));
  const gcm = (iv, aad) => ({ name: 'AES-GCM', iv, ...(aad ? { additionalData: enc.encode(aad) } : {}) });

  async function deriveKek(passphrase, salt, iterations) {
    const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, AES, false, ['wrapKey', 'unwrapKey']);
  }
  async function wrapDataKey(dataKey, passphrase) {
    const salt = randomBytes(16), iv = randomBytes(12);
    const kek = await deriveKek(passphrase, salt, PBKDF2_ITERATIONS);
    const wrapped = new Uint8Array(await crypto.subtle.wrapKey('raw', dataKey, kek, gcm(iv)));
    return { v: 1, kdf: 'PBKDF2-SHA256', iterations: PBKDF2_ITERATIONS, salt, iv, wrapped };
  }
  async function createKeyring(passphrase) {
    const dataKey = await crypto.subtle.generateKey(AES, true, ['encrypt', 'decrypt']);
    return { dataKey, keyring: await wrapDataKey(dataKey, passphrase) };
  }
  // Throws Error('WRONG_PASSPHRASE') when GCM authentication fails.
  async function unlockKeyring(keyring, passphrase) {
    const kek = await deriveKek(passphrase, keyring.salt, keyring.iterations);
    try { return await crypto.subtle.unwrapKey('raw', keyring.wrapped, kek, gcm(keyring.iv), AES, true, ['encrypt', 'decrypt']); }
    catch { throw new Error('WRONG_PASSPHRASE'); }
  }
  async function sealForDevice(dataKey) {
    const deviceKey = await crypto.subtle.generateKey(AES, false, ['wrapKey', 'unwrapKey']);
    const iv = randomBytes(12);
    const wrapped = new Uint8Array(await crypto.subtle.wrapKey('raw', dataKey, deviceKey, gcm(iv)));
    return { deviceKey, iv, wrapped };
  }
  const openForDevice = sealed => crypto.subtle.unwrapKey('raw', sealed.wrapped, sealed.deviceKey, gcm(sealed.iv), AES, true, ['encrypt', 'decrypt']);

  async function encryptJSON(key, obj, aad) {
    const iv = randomBytes(12);
    const ct = new Uint8Array(await crypto.subtle.encrypt(gcm(iv, aad), key, enc.encode(JSON.stringify(obj))));
    return { iv, ct };
  }
  const decryptJSON = async (key, iv, ct, aad) => JSON.parse(dec.decode(new Uint8Array(await crypto.subtle.decrypt(gcm(iv, aad), key, ct))));

  function toB64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function fromB64(str) {
    const bin = atob(str), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const keyringToJSON = k => ({ v: k.v, kdf: k.kdf, iterations: k.iterations, salt: toB64(k.salt), iv: toB64(k.iv), wrapped: toB64(k.wrapped) });
  const keyringFromJSON = j => ({ v: j.v, kdf: j.kdf, iterations: Number(j.iterations) || PBKDF2_ITERATIONS, salt: fromB64(j.salt), iv: fromB64(j.iv), wrapped: fromB64(j.wrapped) });

  // A public fingerprint of the data key, so devices can tell whether they share the same key without revealing it.
  async function keyFingerprint(key) {
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', raw));
    raw.fill(0);
    return [...hash.subarray(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  return { createKeyring, wrapDataKey, unlockKeyring, sealForDevice, openForDevice, encryptJSON, decryptJSON, toB64, fromB64, keyringToJSON, keyringFromJSON, keyFingerprint };
})();
