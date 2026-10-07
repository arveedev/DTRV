/* Face / fingerprint on the person's own phone, through the phone's built-in passkey (WebAuthn, "platform" authenticator).
   It replaces typing the 3-digit code on that phone. It is a local convenience: the phone confirms its owner is present,
   and the app then acts for the person who enrolled. Nothing biometric ever leaves the phone or reaches the app. */
import { store } from '../lib/util.js';

const KEY = 'dtrv.bio', SKIP = 'dtrv.bioSkip';
const b64 = u8 => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const rand = n => crypto.getRandomValues(new Uint8Array(n));

let available = false;
/** Ask the phone once, at start-up, whether it has a screen lock / Face ID / fingerprint that apps may use. */
export async function bioInit() {
  try { available = !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); }
  catch { available = false; }
  return available;
}
export const bioAvailable = () => available;
export function bioFor() { try { return JSON.parse(store.get(KEY)); } catch { return null; } }
export const bioClear = () => store.set(KEY, null);
export const bioSkipped = code => store.get(SKIP) === code;
export const bioSkip = code => store.set(SKIP, code);

/** Create the passkey on this phone and remember it for `code`. Throws if the person cancels. */
export async function bioEnroll(code, name) {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: rand(32), rp: { name: 'DTRV', id: location.hostname },
    user: { id: new TextEncoder().encode('dtrv-' + code), name: 'dtrv-' + code, displayName: name || code },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
    attestation: 'none', timeout: 60000,
  } });
  store.set(KEY, JSON.stringify({ code, id: b64(new Uint8Array(cred.rawId)) })); store.set(SKIP, null);
}

/** Show Face ID / fingerprint. Resolves with the enrolled code, throws if it was cancelled or failed. */
export async function bioVerify() {
  const b = bioFor(); if (!b) throw new Error('Face / fingerprint is not set up on this phone');
  await navigator.credentials.get({ publicKey: {
    challenge: rand(32), rpId: location.hostname, userVerification: 'required', timeout: 60000,
    allowCredentials: [{ type: 'public-key', id: unb64(b.id), transports: ['internal'] }],
  } });
  return b.code;
}
