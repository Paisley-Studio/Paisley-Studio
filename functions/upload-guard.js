/* =========================================================
   Paisley Tech Studio — upload guard
   ---------------------------------------------------------
   Builders upload pictures, videos, sounds and fonts into their IDE
   projects (techWork/{uid}/..., techGroupWork/{groupId}/...). The
   storage rules check the declared type and size, but a declared type
   is only a name: a script renamed cat.png, saved with image/png,
   passes them. This trigger reads the first bytes of every new upload
   there, and deletes anything whose contents are not really the kind
   of file it claims to be, or that hides web code (a "polyglot").

   Paisley VS Code and the Advanced IDE run the same check in the
   browser first (CodeLab.checkUpload), so builders hear why at once;
   this is the second lock, for anything that bypasses the page.

   checkTechUpload: Storage onObjectFinalized. Region: the bucket's
   (UPLOAD_GUARD_REGION in functions/.env to override; the bucket is in us-east1).
========================================================= */
const { onObjectFinalized } = require("firebase-functions/v2/storage");
const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();

const REGION = process.env.UPLOAD_GUARD_REGION || "us-east1";
/* The default bucket (FIREBASE_CONFIG at deploy time; firebase-config.js storageBucket otherwise). */
function bucketName() {
  try { const c = JSON.parse(process.env.FIREBASE_CONFIG || "{}"); if (c.storageBucket) return c.storageBucket; } catch (e) { /* fall through */ }
  return process.env.UPLOAD_GUARD_BUCKET || "paisley-89c77.firebasestorage.app";
}
const GUARDED = /^(techWork|techGroupWork)\//;
const HEAD_BYTES = 65536;

const SIGS = [
  ["image/png", [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]], ["image/jpeg", [0xFF, 0xD8, 0xFF]], ["image/gif", "GIF87a"], ["image/gif", "GIF89a"],
  ["image/bmp", "BM"], ["image/x-icon", [0, 0, 1, 0]], ["video/webm", [0x1A, 0x45, 0xDF, 0xA3]], ["audio/ogg", "OggS"], ["audio/flac", "fLaC"],
  ["audio/mpeg", "ID3"], ["font/woff", "wOFF"], ["font/woff2", "wOF2"], ["font/otf", "OTTO"], ["font/ttf", [0, 1, 0, 0]], ["font/ttf", "true"]
];
const ascii = (b, from, to) => { let s = ""; for (let i = from; i < to && i < b.length; i++) s += String.fromCharCode(b[i]); return s; };
function startsWith(b, sig) {
  const arr = typeof sig === "string" ? [...sig].map((c) => c.charCodeAt(0)) : sig;
  return arr.every((v, i) => b[i] === v);
}
/* What a file really is, from its first bytes (mirrors sniffBytes in js/tech/code-lab.js). */
function sniffBytes(b) {
  for (const [type, sig] of SIGS) if (startsWith(b, sig)) return type;
  if (startsWith(b, "RIFF")) { const k = ascii(b, 8, 12); if (k === "WEBP") return "image/webp"; if (k === "WAVE") return "audio/wav"; if (k === "AVI ") return "video/x-msvideo"; }
  if (ascii(b, 4, 8) === "ftyp") {
    const brand = ascii(b, 8, 12).toLowerCase();
    if (/^avi[fs]/.test(brand)) return "image/avif";
    if (/^(hei[cxms]|hev[cxms]|mif1|msf1)/.test(brand)) return "image/heic";
    if (/^(m4a|m4b|f4a)/.test(brand)) return "audio/mp4";
    if (/^qt/.test(brand)) return "video/quicktime";
    if (/^3g/.test(brand)) return "video/3gpp";
    return "video/mp4";
  }
  if (b[0] === 0xFF && (b[1] & 0xF6) === 0xF0) return "audio/aac";
  if (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0) return "audio/mpeg";
  return "";
}
const HIDDEN_CODE = /<script|<\?php|<html|<iframe|<svg|<object|<embed|javascript:/i;

/* { ok, reason } for an upload declared as contentType whose first bytes are head. */
function verdict(contentType, head) {
  const ct = String(contentType || "").toLowerCase();
  if (/svg/.test(ct)) return { ok: false, reason: "SVG pictures can carry code" };
  const found = sniffBytes(head);
  if (!found) return { ok: false, reason: "contents are not a picture, video, sound or font" };
  const fk = found.split("/")[0], ck = /^(image|video|audio|font)\//.test(ct) ? ct.split("/")[0] : "";
  const av = /^(audio|video)$/.test(fk) && /^(audio|video)$/.test(ck) && /(mp4|webm|ogg|quicktime|3gpp|matroska|x-m4a)/.test(found + " " + ct);
  if (ck && ck !== fk && !av) return { ok: false, reason: `declared ${ct} but is ${found}` };
  if (HIDDEN_CODE.test(Buffer.from(head).toString("latin1"))) return { ok: false, reason: "web code hidden inside" };
  return { ok: true, type: found };
}

exports.checkTechUpload = onObjectFinalized({ bucket: bucketName(), region: REGION, memory: "256MiB", timeoutSeconds: 60 }, async (event) => {
  const obj = event.data || {}, name = obj.name || "";
  if (!GUARDED.test(name)) return;
  const ct = String(obj.contentType || "").toLowerCase();
  /* The rules let only media (and octet-stream fonts) in here; anything else is checked the same way. */
  const file = admin.storage().bucket(obj.bucket).file(name);
  let head;
  try { [head] = await file.download({ start: 0, end: HEAD_BYTES - 1 }); }
  catch (e) { console.warn("upload guard: could not read", name, e.message || e); return; }
  const v = verdict(ct, head);
  if (v.ok) return;
  console.warn("upload guard: deleted", name, "-", v.reason);
  await file.delete().catch((e) => console.warn("upload guard: delete failed", name, e.message || e));
  /* The builder's timeline says what happened, so a coach or the Studio Desk can see it. */
  const parts = name.split("/");
  if (parts[0] === "techWork" && parts[1]) {
    await admin.firestore().collection("techActivity").add({
      studentId: parts[1], type: "upload_blocked", by: "system",
      label: `An upload was removed: ${parts[parts.length - 1].replace(/^\d+_/, "").slice(0, 120)} (${v.reason})`,
      at: admin.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});
  }
});

exports._test = { sniffBytes, verdict };
