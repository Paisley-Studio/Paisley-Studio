/* =========================================================
   STORAGE HELPERS — Paisley Studio LMS
   -----------------------------------------------------------
   Thin wrapper around Firebase Storage, matching the style of
   firestore-helpers.js / lms-helpers.js: plain functions, no
   build step, no framework.

   This file is deliberately NOT loaded on every page (unlike
   firebase-config.js). Only load it — and the Storage SDK
   script tag below — on pages that actually upload/delete
   files: activity builder, exam/homework question editors,
   homework submission, exam "show your working" question
   uploads. Loading the Storage SDK on every marketing/dashboard
   page that never uploads anything would be dead weight.

   Required script tag order on any page that uses this file:

     <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js"></script>
     <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore-compat.js"></script>
     <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-storage-compat.js"></script>
     <script src="../firebase-config.js"></script>
     <script src="../js/uploads/storage-helpers.js"></script>

   (adjust relative paths per page location, same as every other
   shared helper file in this project)
========================================================= */

const storage = firebase.storage();

// 25MB — keep in sync with the limit enforced server-side in storage.rules.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const ALLOWED_UPLOAD_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'audio/mpeg',
  'audio/wav',
  'video/mp4'
];

/**
 * Validate a File before attempting to upload it.
 * Returns a human-readable error string, or null if the file is fine.
 * Always call this before uploadFile() so the user gets a clear message
 * instead of a raw Firebase Storage error (per the project's error-
 * handling convention — see lms-helpers.js's handleErr()).
 */
function validateUploadFile(file) {
  if (!file) return 'No file selected.';
  if (file.size > MAX_UPLOAD_BYTES) {
    return 'That file is too large. Please upload a file under 25MB.';
  }
  if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
    return 'That file type isn\'t supported. Please upload a PDF, image, audio, or video file.';
  }
  return null;
}

/**
 * Build a storage path for one of the fixed locations defined in
 * storage.rules. Keeping path construction in one place means the
 * client paths and the rules paths can never silently drift apart.
 *
 *   storagePath('activities', activityId, 'questions', questionId, fileName)
 *     -> activities/{activityId}/questions/{questionId}/{fileName}
 */
function storagePath(...segments) {
  return segments.map(s => String(s).trim().replace(/^\/+|\/+$/g, '')).join('/');
}

/**
 * Upload a single file to the given storage path.
 *
 * @param {string} path        - built with storagePath(...)
 * @param {File}   file        - the File object from an <input type="file">
 * @param {function} [onProgress] - optional callback(percent:0-100)
 * @returns {Promise<{fileUrl:string, fileName:string, fileType:string, storagePath:string}>}
 */
function uploadFile(path, file, onProgress) {
  const err = validateUploadFile(file);
  if (err) return Promise.reject(new Error(err));

  // Prefix a timestamp so two students/tutors uploading a file with the
  // same original name never collide.
  const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const fullPath = `${path}/${safeName}`;
  const ref = storage.ref(fullPath);
  const task = ref.put(file, { contentType: file.type });

  return new Promise((resolve, reject) => {
    task.on('state_changed',
      (snap) => {
        if (typeof onProgress === 'function') {
          const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
          onProgress(pct);
        }
      },
      (uploadErr) => {
        // Mirror the project's convention of never exposing raw Firebase
        // errors to end users (see lms-helpers.js handleErr()).
        reject(new Error('Upload failed: ' + (uploadErr.code === 'storage/unauthorized'
          ? 'you don\'t have permission to upload here.'
          : 'please check your connection and try again.')));
      },
      () => {
        ref.getDownloadURL().then(url => {
          resolve({
            fileUrl: url,
            fileName: file.name,
            fileType: file.type,
            storagePath: fullPath
          });
        }).catch(reject);
      }
    );
  });
}

/**
 * Delete a previously uploaded file by its storage path (the
 * `storagePath` value returned from uploadFile()), not its download URL.
 */
function deleteFile(path) {
  if (!path) return Promise.resolve();
  return storage.ref(path).delete().catch(delErr => {
    // A file that's already gone shouldn't block the caller (e.g. deleting
    // a question that references a file removed by a previous action).
    if (delErr.code === 'storage/object-not-found') return;
    throw delErr;
  });
}
