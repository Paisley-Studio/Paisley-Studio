/* =========================================================
   Paisley TECH — coach access  (window.TechCoachAccess)
   ---------------------------------------------------------
   Used by /tech/coach (sign-in) and /tech/coach/dashboard.

   TechCoachAccess.resolve(user) -> Promise<{ state, coach }>
     state 'active' | 'paused' | 'none'
   A coach is techCoaches/{uid}. If that doc does not exist yet but the
   Studio Desk invited this email (techCoachInvites/{email}, written on
   the Tutors page), the coach record is created from the invite here.
   That covers a brand-new coach whose record was not saved at creation
   time, and an existing Paisley login (e.g. a tutor) made a coach.

   TechCoachAccess.readSlug()     slug from /tech/coach/{slug} or ?slug=
   TechCoachAccess.lookup(slug)   public techCoachSlugs/{slug} doc data, or null

   Needs the global Firestore `db` (firebase-config.js).
========================================================= */
(function (g) {
  'use strict';
  var FV = function () { return firebase.firestore.FieldValue; };

  async function claimFromInvite(user) {
    if (!user.email) return false;
    var invRef = db.collection('techCoachInvites').doc(user.email.toLowerCase());
    var inv;
    try { inv = await invRef.get(); } catch (e) { return false; }
    if (!inv.exists) return false;
    var v = inv.data() || {};
    if (v.revoked || (v.uid && v.uid !== user.uid)) return false;
    await db.collection('techCoaches').doc(user.uid).set({
      name: v.name || user.displayName || '', email: user.email, phone: v.phone || '',
      disciplines: Array.isArray(v.disciplines) ? v.disciplines : [], bio: '', slug: v.slug || '',
      status: 'Active', createdBy: v.createdBy || '', claimedFromInvite: true,
      createdAt: FV().serverTimestamp(), updatedAt: FV().serverTimestamp()
    });
    invRef.update({ uid: user.uid, claimedAt: FV().serverTimestamp() }).catch(function () { });
    return true;
  }

  async function resolve(user) {
    var ref = db.collection('techCoaches').doc(user.uid);
    var d = await ref.get();
    if (!d.exists && await claimFromInvite(user)) d = await ref.get();
    if (!d.exists) return { state: 'none', coach: null };
    var coach = Object.assign({ id: d.id }, d.data());
    return { state: coach.status === 'Active' ? 'active' : 'paused', coach: coach };
  }

  function readSlug() {
    var q = new URLSearchParams(location.search).get('slug');
    if (q) return q.trim().toLowerCase();
    var parts = location.pathname.split('/').filter(Boolean);       // ['tech','coach','jane-wanjiru']
    if (parts[0] !== 'tech' || parts[1] !== 'coach' || parts.length < 3) return '';
    var last = parts[2];
    if (!last || /\.html?$/i.test(last) || last === 'dashboard' || last === 'index') return '';
    return decodeURIComponent(last).trim().toLowerCase();
  }

  async function lookup(slug) {
    if (!slug || !/^[a-z0-9-]{1,64}$/.test(slug)) return null;
    var d = await db.collection('techCoachSlugs').doc(slug).get();
    return d.exists ? d.data() : null;
  }

  g.TechCoachAccess = { resolve: resolve, readSlug: readSlug, lookup: lookup };
})(window);
