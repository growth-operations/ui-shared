// CRM-card field encryption helpers.
//
// Used to encrypt small values (e.g. a token or secret) before storing them on a
// CRM record property, deriving the key from the record's own identity so the
// ciphertext is scoped to that record. These are generic Web Crypto helpers and
// are ported as-is — no app-specific names. The PBKDF2 salt is a fixed constant
// ("hubspot-ats"); it only needs to be stable across encrypt/decrypt, not secret.
//
// getKeyFromContext derives the key from `${context.extension.objectTypeId}-${context.crm.objectId}`,
// so this is only usable in a CRM-card context where context.crm.objectId exists.

// Convert string to base64 (UTF-8 safe).
export function strToBase64(str) {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function toSolidBytes(match, p1) {
      return String.fromCharCode("0x" + p1);
    })
  );
}

// Convert base64 to string (UTF-8 safe).
export function base64ToStr(str) {
  return decodeURIComponent(
    atob(str)
      .split("")
      .map(function (c) {
        return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
      })
      .join("")
  );
}

// Convert string to Uint8Array.
function strToUint8Array(str) {
  return Uint8Array.from(str.split("").map((ch) => ch.charCodeAt(0)));
}

// Derive an AES-GCM key bound to the current CRM record.
export async function getKeyFromContext(context) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    strToUint8Array(`${context.extension.objectTypeId}-${context.crm.objectId}`),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: strToUint8Array("hubspot-ats"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encrypt(data, context) {
  const key = await getKeyFromContext(context);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedData = strToUint8Array(JSON.stringify(data));

  const encryptedContent = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    encodedData
  );

  // Combine IV and encrypted content.
  const encryptedArray = new Uint8Array(iv.length + encryptedContent.byteLength);
  encryptedArray.set(iv);
  encryptedArray.set(new Uint8Array(encryptedContent), iv.length);

  // Convert to base64 for storage.
  return strToBase64(String.fromCharCode.apply(null, encryptedArray));
}

export async function decrypt(encryptedData, context) {
  const key = await getKeyFromContext(context);

  // Convert from base64 and split IV and content.
  const encryptedArray = strToUint8Array(base64ToStr(encryptedData));
  const iv = encryptedArray.slice(0, 12);
  const content = encryptedArray.slice(12);

  const decryptedContent = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    key,
    content
  );

  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(decryptedContent));
}
