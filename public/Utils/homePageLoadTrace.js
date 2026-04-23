/**
 * One session per full page load. First log call creates `loadId` (send this to support for GCL search).
 * Logs a plain object so DevTools shows an expandable tree; `loadId` is still easy to copy for GCL.
 */

function randomSegment() {
  return Math.random().toString(36).slice(2, 10);
}

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

let session = null;

function ensureSession() {
  if (session) {
    return session;
  }
  const t0 = nowMs();
  session = {
    loadId: `hpl_${Date.now()}_${randomSegment()}_${randomSegment()}`,
    t0,
  };
  return session;
}

/**
 * @param {string} phase
 * @param {Record<string, unknown>} [detail]
 */
function logHomePageLoadPhase(phase, detail) {
  const s = ensureSession();
  const elapsed = Math.round(nowMs() - s.t0);
  const payload = {
    type: 'HomePageLoad',
    loadId: s.loadId,
    phase,
    elapsedSinceStartMs: elapsed,
    wallTimeIso: new Date().toISOString(),
  };
  if (detail && typeof detail === 'object') {
    payload.detail = detail;
  }
  console.log('[HomePageLoad]', payload);
}

function getHomePageLoadId() {
  return ensureSession().loadId;
}

module.exports = {
  logHomePageLoadPhase,
  getHomePageLoadId,
};
