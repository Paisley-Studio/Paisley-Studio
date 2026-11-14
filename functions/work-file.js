/* =========================================================
   fetchWorkFile — hand a student's file to the marking screen
   -----------------------------------------------------------
   The ink grader downloads the student's file straight from Storage,
   which needs CORS on the bucket (cors.json). When the browser download
   is blocked or fails, it asks this callable for the same bytes instead.

   Safe by construction:
     - staff only: admins, tutors (not suspended), approved Tech coaches;
     - only a Firebase Storage download URL of this project's bucket, and
       only with that file's own download token (exactly what the URL
       already grants), so it reaches nothing the caller could not open;
     - files up to MAX_BYTES (callable responses are size-limited).
   Returns { data: base64, contentType, size, name }.
========================================================= */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const W = require("./work-shared");

if (!admin.apps.length) admin.initializeApp();
const MAX_BYTES = 20 * 1024 * 1024;

/* https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<encoded path>?alt=media&token=<t> */
function parseDownloadUrl(raw) {
  let u;
  try { u = new URL(String(raw || "")); } catch (e) { return null; }
  if (u.protocol !== "https:" || u.hostname !== "firebasestorage.googleapis.com") return null;
  const m = /^\/v0\/b\/([^/]+)\/o\/(.+)$/.exec(u.pathname);
  if (!m) return null;
  let path;
  try { path = decodeURIComponent(m[2]); } catch (e) { return null; }
  if (!path || path.indexOf("..") !== -1) return null;
  return { bucket: decodeURIComponent(m[1]), path, token: u.searchParams.get("token") || "" };
}

async function isStaff(uid) {
  const db = admin.firestore();
  const [a, t, c] = await Promise.all([
    db.collection("admins").doc(uid).get(),
    db.collection("tutorAccounts").doc(uid).get(),
    db.collection("techCoaches").doc(uid).get()
  ]);
  if (a.exists) return true;
  if (t.exists && String((t.data() || {}).status || "Active") !== "Suspended") return true;
  if (c.exists && ["Active", "Approved"].indexOf(String((c.data() || {}).status || "")) !== -1) return true;
  return false;
}

async function fetchWorkFile(uid, data) {
  if (!(await isStaff(uid))) throw new HttpsError("permission-denied", "Only staff can open handed-in work.");
  const ref = parseDownloadUrl(data && data.url);
  if (!ref || !ref.token) throw new HttpsError("invalid-argument", "This is not a Paisley storage link.");
  const bucket = admin.storage().bucket();
  if (ref.bucket !== bucket.name) throw new HttpsError("permission-denied", "This file is not in the Paisley storage bucket.");
  const file = bucket.file(ref.path);
  let meta;
  try { [meta] = await file.getMetadata(); } catch (e) {
    if (e && e.code === 404) throw new HttpsError("not-found", "The file is no longer in storage. Ask the student to upload it again.");
    throw e;
  }
  const tokens = String((meta.metadata || {}).firebaseStorageDownloadTokens || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (tokens.indexOf(ref.token) === -1) throw new HttpsError("permission-denied", "This file link is no longer valid. Ask the student to upload the work again.");
  const size = Number(meta.size || 0);
  if (size > MAX_BYTES) throw new HttpsError("resource-exhausted", "This file is too large to pass through the server (" + Math.round(size / 1048576) + " MB). Set CORS on the storage bucket so the browser can download it directly.");
  const [buf] = await file.download();
  return { data: buf.toString("base64"), contentType: meta.contentType || "", size: buf.length, name: ref.path.split("/").pop() };
}

exports.fetchWorkFile = onCall({ cors: true, region: W.LOCATION, memory: "512MiB", timeoutSeconds: 120 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Please sign in again.");
  return fetchWorkFile(request.auth.uid, request.data || {});
});
exports._internals = { parseDownloadUrl, isStaff, MAX_BYTES };
