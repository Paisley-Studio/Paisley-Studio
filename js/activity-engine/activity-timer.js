/* =========================================================
   ACTIVITY ENGINE — activity-timer.js
   Optional countdown, used when activity.config.timeLimitSeconds is set.
   Framework-agnostic: takes DOM-free callbacks so any template/page can
   render the remaining time however it likes.
========================================================= */

function createActivityTimer(totalSeconds, onTick, onExpire) {
  let remaining = totalSeconds;
  let intervalId = null;

  function start() {
    if (!totalSeconds || totalSeconds <= 0) return; // untimed activity
    intervalId = setInterval(() => {
      remaining--;
      if (typeof onTick === 'function') onTick(remaining);
      if (remaining <= 0) {
        stop();
        if (typeof onExpire === 'function') onExpire();
      }
    }, 1000);
  }

  function stop() {
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
  }

  function formatMMSS(sec) {
    const s = Math.max(0, sec);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
  }

  return { start, stop, formatMMSS, get remaining() { return remaining; } };
}
