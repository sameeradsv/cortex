const PBKDF2_ITERATIONS = 390_000;
const EXPORT_FORMAT = "cortex-encrypted-export";

function toBuffer(length: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new ArrayBuffer(length));
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function b64encode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function b64decode(s: string): Uint8Array<ArrayBuffer> {
  const bytes = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const buf = new Uint8Array(new ArrayBuffer(bytes.length));
  buf.set(bytes);
  return buf;
}

export async function encryptBlob(plaintext: string, passphrase: string): Promise<Record<string, string>> {
  const salt = toBuffer(16);
  const iv = toBuffer(12);
  crypto.getRandomValues(salt);
  crypto.getRandomValues(iv);
  const key = await deriveKey(passphrase, salt);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  return {
    format: EXPORT_FORMAT,
    version: "2",
    cipher: "aes-gcm-256",
    kdf: "pbkdf2-sha256",
    iterations: String(PBKDF2_ITERATIONS),
    salt: b64encode(salt.buffer as ArrayBuffer),
    iv: b64encode(iv.buffer as ArrayBuffer),
    ciphertext: b64encode(ciphertext),
  };
}

export async function decryptBlob(
  blob: Record<string, string>,
  passphrase: string,
): Promise<string> {
  if (blob.format !== EXPORT_FORMAT && blob.format !== "canopy-encrypted-export") {
    throw new Error("Unrecognized export format");
  }
  const salt = b64decode(blob.salt);
  const iv = b64decode(blob.iv);
  const ciphertext = b64decode(blob.ciphertext);
  const key = await deriveKey(passphrase, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext.buffer as ArrayBuffer,
  );
  return new TextDecoder().decode(plaintext);
}
