// identity-verify.js — the world's verify leaf (boundary primitive).
//
// The world holds NO private key. It only ever verifies signatures with public
// material: eth via ecrecover (the signer's address is recovered from the sig),
// ed25519 natively. crypto isn't absorbed by witness-world yet, so this is a JS
// leaf; the authored policy (recognition) lives in the plugin around it.
//
// The canonical message formats are the agreed scheme — they must stay
// byte-identical to the daemon's identity-crypto.mjs.

import crypto from "node:crypto";
import * as secp from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hmac } from "@noble/hashes/hmac.js";

secp.hashes.sha256 = sha256;
secp.hashes.hmacSha256 = (key, msg) => hmac(sha256, key, msg);

const enc = (s) => new TextEncoder().encode(s);
const eip191 = (msg) => keccak_256(enc(`\x19Ethereum Signed Message:\n${msg.length}${msg}`));
const ED_SPKI = Buffer.from("302a300506032b6570032100", "hex");
const ethAddr = (pub65) => "0x" + Buffer.from(keccak_256(pub65.slice(1))).slice(-20).toString("hex");

// Proves `sig` over `message` was made by the holder of identity `id`,
// dispatching on the declared scheme. No secret involved.
export function verifyIdentity({ scheme, id, message, sig }) {
  try {
    if (scheme === "eth") {
      const recRaw = secp.recoverPublicKey(Buffer.from(sig, "base64"), eip191(message), { prehash: false });
      const recovered = ethAddr(secp.Point.fromBytes(recRaw).toBytes(false));
      return recovered.toLowerCase() === String(id).toLowerCase();
    }
    if (scheme === "ed25519") {
      const pub = crypto.createPublicKey({
        key: Buffer.concat([ED_SPKI, Buffer.from(id, "base64")]), format: "der", type: "spki"
      });
      return crypto.verify(null, Buffer.from(message), pub, Buffer.from(sig, "base64"));
    }
  } catch { /* fall through */ }
  return false;
}

// The agreed signing scheme — byte-identical to the daemon's.
export const canonical = {
  claim: ({ label, scheme, id }) => `tilth-net/identity.claim\n${label}\n${scheme}\n${id}`,
  recognize: ({ ofLabel, ofId }) => `tilth-net/identity.recognize\n${ofLabel}\n${ofId}`,
  docPut: ({ docId, content, id }) => `tilth-net/doc.put\n${docId}\n${content}\n${id}`
};
