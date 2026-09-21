// ═══════════════════════════════════════════════════════════════════
//  ftp-analytics.js — FTP Play Tracker
//  Batched Tinybird analytics
// ═══════════════════════════════════════════════════════════════════

const FTP_ANALYTICS = (() => {

  const HOST     = 'https://api.europe-west2.gcp.tinybird.co';
  const ENDPOINT = `${HOST}/v0/events?name=ftp_plays`;
  const TOKEN    = 'YOUR_WRITE_TOKEN';

  const SESSION_ID = (
    sessionStorage.getItem('ftp_sid') ||
    (() => {
      const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('ftp_sid', id);
      return id;
    })()
  );

  // ── Batching ────────────────────────────────────────────────────
  // Events are collected locally and sent together instead of making
  // one HTTP request per event.
  const QUEUE = [];
  const FLUSH_INTERVAL = 5000;
  const MAX_BATCH_SIZE = 5;

  let flushTimer = null;
  let sending = false;

  // ── Play dedupe ─────────────────────────────────────────────────
  // Same video + source cannot generate another play event within 10s.
  const recentFires = {};

  function isDupe(videoId) {
    const now = Date.now();

    if (
      recentFires[videoId] &&
      now - recentFires[videoId] < 10_000
    ) {
      return true;
    }

    recentFires[videoId] = now;

    // Prevent this object growing indefinitely.
    for (const key in recentFires) {
      if (now - recentFires[key] > 60_000) {
        delete recentFires[key];
      }
    }

    return false;
  }

  function makeEvent(payload) {
    return {
      event_id:
        crypto.randomUUID?.() ||
        Math.random().toString(36).slice(2) + Date.now(),

      ts: new Date().toISOString().replace('T', ' ').slice(0, 19),

      session_id: SESSION_ID,

      event_type: 'play',
      video_id: '',
      title: '',
      artist: '',
      genre: '',
      source: 'unknown',

      ...payload,
    };
  }

  function queueEvent(payload) {
    QUEUE.push(makeEvent(payload));

    if (QUEUE.length >= MAX_BATCH_SIZE) {
      flush();
      return;
    }

    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flush();
      }, FLUSH_INTERVAL);
    }
  }

  async function flush() {
    if (sending || !QUEUE.length) return;

    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    sending = true;

    // Take the current batch out of the queue.
    const batch = QUEUE.splice(0, MAX_BATCH_SIZE);

    try {
      // Tinybird Events API accepts newline-delimited JSON.
      const body = batch.map(event => JSON.stringify(event)).join('\n');

      const response = await fetch(`${ENDPOINT}&token=${TOKEN}`, {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/x-ndjson',
        },
        keepalive: true,
        credentials: 'omit',
      });

if (!response.ok) {
  throw new Error(`Tinybird returned HTTP ${response.status}`);
}

    } catch (_) {
      // Put failed events back at the front of the queue.
      QUEUE.unshift(...batch);
    } finally {
      sending = false;

      if (QUEUE.length) {
        flushTimer = setTimeout(() => {
          flushTimer = null;
          flush();
        }, 1000);
      }
    }
  }

  // Flush when leaving/backgrounding the page.
  function flushOnExit() {
    if (!QUEUE.length) return;

    const body = QUEUE
      .splice(0)
      .map(event => JSON.stringify(event))
      .join('\n');

    try {
      fetch(`${ENDPOINT}&token=${TOKEN}`, {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/x-ndjson',
        },
        keepalive: true,
        credentials: 'omit',
      });
    } catch (_) {}
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushOnExit();
    }
  });

  window.addEventListener('pagehide', flushOnExit);

  return {

    // ── Track when a song starts / qualifies as a play ─────────────
    play(track, source) {
      if (!track?.id) return;

      const key = `${track.id}${source || 'unknown'}`;

      if (isDupe(key)) return;

      queueEvent({
        event_type: 'play',
        video_id: track.id,
        title: track.title || '',
        artist: track.artist || '',
        genre: track.genre || '',
        source: source || 'unknown',
      });
    },

    // ── Portal channel click ──────────────────────────────────────
    portalClick(ch, videoId) {
      queueEvent({
        event_type: 'portal_click',
        video_id: videoId || '',
        title: ch?.name || '',
        artist: '',
        genre: '',
        source: 'portal',
      });
    },

    // ── Track skip ────────────────────────────────────────────────
    skip(track, source) {
      if (!track?.id) return;

      queueEvent({
        event_type: 'skip',
        video_id: track.id,
        title: track.title || '',
        artist: track.artist || '',
        genre: track.genre || '',
        source: source || 'unknown',
      });
    },

    // ── Force pending events to Tinybird ──────────────────────────
    flush,
  };

})();
