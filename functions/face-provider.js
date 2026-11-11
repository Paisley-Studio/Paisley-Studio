/* =========================================================
   Paisley Studio — face recognition provider (server side only)
   -----------------------------------------------------------
   The attendance system talks to a recognition engine only through the
   interface below, so the engine can be changed without touching
   functions/face-recognition.js or functions/attendance.js:

     configured()                 -> boolean
     health()                     -> { ok, detail }
     enroll(subject, base64Jpeg)  -> { ok }          replaces the subject's reference face
     remove(subject)              -> { ok }          deletes the subject and every stored example
     recognize(base64Jpeg)        -> { faces: [{ probability, matches: [{ subject, similarity }] }] }

   Errors: an engine that cannot be reached, times out or answers with a
   server error throws ProviderUnavailable. Callers then fall back to the
   normal check-in. Nothing here ever invents a match.

   First implementation: CompreFace (self-hosted, Apache-2.0), Recognition
   service, default FaceNet build. The engine URL and the Recognition API key come from
   the environment (COMPREFACE_URL, COMPREFACE_API_KEY in functions/.env, never
   committed) or, if those are unset, from privateConfig/faceRecognition,
   which the Studio Desk sets in Admin > Attendance > Facial recognition and
   which the Firestore rules let no client read. Credentials never reach a browser.

   Images are sent to the engine as base64 and are not written anywhere by
   this code. Only enroll() asks the engine to keep a reference example.
========================================================= */
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();

class ProviderUnavailable extends Error {
  constructor(msg) { super(msg || "The recognition engine is unavailable."); this.name = "ProviderUnavailable"; }
}
class ProviderRejected extends Error {   // the engine understood the request but refused it (e.g. no face in the reference photo)
  constructor(msg) { super(msg); this.name = "ProviderRejected"; }
}

const DET_PROB = 0.8;          // face detection confidence below this is treated as "no face"
const TIMEOUT_MS = 12000;

let cfgCache = null, cfgAt = 0;
async function engineConfig(fresh) {
  if (process.env.COMPREFACE_URL && process.env.COMPREFACE_API_KEY) {
    return { provider: "compreface", url: process.env.COMPREFACE_URL.replace(/\/+$/, ""), apiKey: process.env.COMPREFACE_API_KEY, source: "environment" };
  }
  if (!fresh && cfgCache && Date.now() - cfgAt < 60000) return cfgCache;
  const s = await admin.firestore().collection("privateConfig").doc("faceRecognition").get();
  const d = s.exists ? s.data() : {};
  cfgCache = { provider: d.provider || "compreface", url: String(d.url || "").replace(/\/+$/, ""), apiKey: d.apiKey || "", source: s.exists ? "studio_desk" : "none" };
  cfgAt = Date.now();
  return cfgCache;
}
function resetCache() { cfgCache = null; }

/* ---------------- CompreFace ---------------- */
function compreFace(cfg) {
  async function req(method, path, body) {
    if (!cfg.url || !cfg.apiKey) throw new ProviderUnavailable("The recognition engine is not configured.");
    if (!/^https:\/\//i.test(cfg.url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(cfg.url)) {
      throw new ProviderUnavailable("The recognition engine must be reached over HTTPS.");
    }
    let res;
    try {
      res = await fetch(cfg.url + path, {
        method, headers: Object.assign({ "x-api-key": cfg.apiKey }, body ? { "Content-Type": "application/json" } : {}),
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch (e) { throw new ProviderUnavailable("The recognition engine could not be reached."); }
    let json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    if (res.status >= 500 || res.status === 401 || res.status === 403) {
      throw new ProviderUnavailable(res.status === 401 || res.status === 403 ? "The recognition engine refused the API key." : "The recognition engine returned an error.");
    }
    return { status: res.status, json: json || {} };
  }
  // CompreFace answers 400 with code 28 when it finds no face in the image.
  const noFace = (r) => r.status === 400 && (r.json.code === 28 || /no face/i.test(String(r.json.message || "")));
  return {
    name: "compreface",
    configured: () => !!(cfg.url && cfg.apiKey),
    async health() {
      const r = await req("GET", "/api/v1/recognition/subjects");
      return r.status === 200 ? { ok: true, detail: "Connected" } : { ok: false, detail: "Unexpected answer (" + r.status + ")" };
    },
    async remove(subject) {
      const r = await req("DELETE", "/api/v1/recognition/subjects/" + encodeURIComponent(subject));
      // 404 / 400 (unknown subject) means there is nothing stored, which is what we want.
      return { ok: r.status === 200 || r.status === 404 || r.status === 400 };
    },
    async enroll(subject, b64) {
      await this.remove(subject);
      const r = await req("POST", "/api/v1/recognition/faces?subject=" + encodeURIComponent(subject) + "&det_prob_threshold=" + DET_PROB, { file: b64 });
      if (noFace(r)) throw new ProviderRejected("No face was found in the photo. Use a clear, front-facing photo of one person.");
      if (r.status !== 200 && r.status !== 201) throw new ProviderRejected(String(r.json.message || "The engine did not accept the photo."));
      return { ok: true };
    },
    async recognize(b64) {
      const r = await req("POST", "/api/v1/recognition/recognize?limit=0&prediction_count=2&det_prob_threshold=" + DET_PROB, { file: b64 });
      if (noFace(r)) return { faces: [] };
      if (r.status !== 200) throw new ProviderRejected(String(r.json.message || "The engine could not read the picture."));
      const faces = (r.json.result || []).map((f) => ({
        probability: Number((f.box && f.box.probability) || 0),
        matches: (f.subjects || []).map((m) => ({ subject: String(m.subject), similarity: Number(m.similarity) || 0 })).sort((a, b) => b.similarity - a.similarity)
      }));
      return { faces };
    }
  };
}

const PROVIDERS = { compreface: compreFace };
let override = null;   // tests only (see functions/test/face.emulator.test.js); never set in production code

async function provider(fresh) {
  if (override) return override;
  const cfg = await engineConfig(fresh);
  const make = PROVIDERS[cfg.provider] || PROVIDERS.compreface;
  return Object.assign(make(cfg), { source: cfg.source });
}

module.exports = { provider, engineConfig, resetCache, ProviderUnavailable, ProviderRejected, _setTestProvider: (p) => { override = p; } };
