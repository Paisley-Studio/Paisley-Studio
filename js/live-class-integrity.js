/* =========================================================
   LIVE CLASS INTEGRITY MONITOR — js/live-class-integrity.js
   -----------------------------------------------------------
   Student-side only. Tracks browser-detectable integrity events while a
   student is in a live class:
     - visibility changes (tab hidden/shown)
     - window blur/focus
     - fullscreen enter/exit
     - attempts to leave the page (beforeunload)
     - time spent outside the class page

   IMPORTANT — browser limitation: this can only observe what the Page
   Visibility, fullscreen, and focus/blur APIs expose. It cannot detect a
   closed browser process, a second physical device, or anything outside
   this tab, and it never claims to. It also never claims screen recording
   is active — no screen-capture API is used here at all.

   USAGE (see live-class.html for the real wiring):

     LiveClassIntegrity.start(studentId, classId, classTitle, studentName, studentEmail)
       .then(monitor => {
         // monitor.sessionId is available once the session doc exists
         // call monitor.stop() when the student leaves the class
       });
========================================================= */

const LiveClassIntegrity = (function () {
  let injectedCss = false;

  // Point values per violation type. Bump these up or down to tune the
  // sensitivity of the counter. Anything not listed contributes 0.
  const VIOLATION_POINTS = {
    tab_hidden: 2,
    window_blur: 1,
    fullscreen_exited: 1,
    navigation_attempt: 3
  };

  function injectBannerCss() {
    if (injectedCss) return;
    injectedCss = true;
    const style = document.createElement('style');
    style.textContent = `
      #lciWarningBanner{
        position:fixed; top:0; left:0; right:0; z-index:9999;
        background:#E74C3C; color:#fff; font-family:'Quicksand',sans-serif;
        padding:.85rem 1.2rem; text-align:center; font-weight:700; font-size:.88rem;
        display:flex; align-items:center; justify-content:center; gap:.6rem;
        box-shadow:0 4px 18px rgba(0,0,0,.25);
        animation:lciSlideDown .3s ease;
      }
      @keyframes lciSlideDown{ from{ transform:translateY(-100%); } to{ transform:translateY(0); } }
      #lciWarningBanner button{
        background:rgba(255,255,255,.2); border:none; color:#fff; font-weight:800;
        padding:.3rem .7rem; border-radius:7px; cursor:pointer; font-family:inherit; font-size:.78rem;
      }
    `;
    document.head.appendChild(style);
  }

  function showWarningBanner(message) {
    injectBannerCss();
    let el = document.getElementById('lciWarningBanner');
    if (el) el.remove();
    el = document.createElement('div');
    el.id = 'lciWarningBanner';
    el.innerHTML = `<i class="fas fa-triangle-exclamation"></i> <span>${message}</span> <button type="button">Dismiss</button>`;
    el.querySelector('button').onclick = () => el.remove();
    document.body.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 10000);
  }

  function start(studentId, classId, classTitle, studentName, studentEmail) {
    let sessionId = null;
    let fullscreenWarned = false;
    let hiddenAt = null;
    let blurredAt = null;
    let joinTime = Date.now();
    let stopped = false;
    let sessionIsNew = false;

    const listeners = [];
    function on(target, event, handler) {
      target.addEventListener(event, handler);
      listeners.push([target, event, handler]);
    }

    function log(eventType, extra) {
      if (!sessionId || stopped) return;
      recordLiveClassEvent({
        studentId, classId, sessionId, eventType,
        duration: (extra && extra.duration) || 0,
        metadata: (extra && extra.metadata) || {}
      }).catch(err => console.error('Could not record live-class event:', err));
      touchLiveClassSession(sessionId).catch(() => {});

      // Bump the violation counter if this event counts as a violation.
      const points = VIOLATION_POINTS[eventType] || 0;
      if (points > 0) {
        bumpLiveClassViolationCount(sessionId, points).catch(() => {});
      }
    }

    function handleVisibility() {
      if (document.hidden) {
        hiddenAt = Date.now();
        log('tab_hidden');
      } else if (hiddenAt) {
        const duration = Math.round((Date.now() - hiddenAt) / 1000);
        log('tab_returned', { duration });
        hiddenAt = null;
      }
    }

    function handleBlur() {
      blurredAt = Date.now();
      log('window_blur');
    }
    function handleFocus() {
      if (blurredAt) {
        const duration = Math.round((Date.now() - blurredAt) / 1000);
        log('window_focus', { duration });
        blurredAt = null;
      }
    }

    function handleFullscreenChange() {
      const inFullscreen = !!(document.fullscreenElement);
      if (!inFullscreen) {
        log('fullscreen_exited');
        if (!fullscreenWarned) {
          fullscreenWarned = true;
          showWarningBanner('Please stay in the class. Your classroom activity is being monitored for evaluation.');
          log('fullscreen_exit_warning_shown');
        }
      } else {
        log('fullscreen_entered');
      }
    }

    function handleBeforeUnload(e) {
      log('navigation_attempt');
      if (sessionId) {
        const totalDuration = Math.round((Date.now() - joinTime) / 1000);
        try { markLiveClassSessionLeft(sessionId, totalDuration); } catch(_) {}
      }
      e.preventDefault();
      e.returnValue = '';
    }

    on(document, 'visibilitychange', handleVisibility);
    on(window, 'blur', handleBlur);
    on(window, 'focus', handleFocus);
    on(document, 'fullscreenchange', handleFullscreenChange);
    on(window, 'beforeunload', handleBeforeUnload);

    const startPromise = findOpenSessionForStudent(studentId, classId)
      .then(function (existing) {
        if (existing && !existing.classLeftAt) {
          if (existing.classJoinedAt && existing.classJoinedAt.seconds) {
            joinTime = existing.classJoinedAt.seconds * 1000;
          }
          sessionId = existing.id;
          sessionIsNew = false;
          return { id: existing.id };
        }
        return startLiveClassSession({
          studentId,
          studentName: studentName || '',
          studentEmail: studentEmail || '',
          classId,
          classTitle: classTitle || ''
        }).then(function (ref) {
          sessionId = ref.id;
          sessionIsNew = true;
          return ref;
        });
      })
      .then(function () {
        if (sessionIsNew) {
          return markLiveClassSessionJoined(sessionId);
        }
        return Promise.resolve();
      })
      .then(function () {
        return {
          get sessionId() { return sessionId; },
          stop(reason) {
            if (stopped) return Promise.resolve();
            stopped = true;
            listeners.forEach(([target, event, handler]) => target.removeEventListener(event, handler));
            const totalDuration = Math.round((Date.now() - joinTime) / 1000);
            if (sessionId) {
              log('class_left', { metadata: { reason: reason || 'left' } });
              return markLiveClassSessionLeft(sessionId, totalDuration);
            }
            return Promise.resolve();
          }
        };
      });

    return startPromise;
  }

  return { start, showWarningBanner };
})();