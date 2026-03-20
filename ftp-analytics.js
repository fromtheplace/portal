// ═══════════════════════════════════════════════════════════════════
//  ftp-analytics.js  —  FTP Play Tracker
//  Drop this file alongside portal.html / channel.html / catalogue
//  and include with <script src="ftp-analytics.js"></script>
//
//  BEFORE DEPLOYING: replace YOUR_WRITE_TOKEN with your ftp_write token
// ═══════════════════════════════════════════════════════════════════

const FTP_ANALYTICS = (() => {

  const HOST      = 'https://api.europe-west2.gcp.tinybird.co';
  const ENDPOINT  = `${HOST}/v0/events?name=ftp_plays`;
  const TOKEN     = 'p.eyJ1IjogIjkxM2Y0MzdlLTc5OTItNGJjYS05MTY1LWQzYzBiMmE0ZGRkNiIsICJpZCI6ICI1MGNkYTg5My00MzFiLTQzMDQtYWQ2Zi1lNjc2MzgxZDY0ZTkiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.MLqG3Z-dTLtWWZqCvDIFD80tVyqtoxJUh2Ns6ieQkZE';

  // Stable per-tab session ID
  const SESSION_ID = (
    sessionStorage.getItem('ftp_sid') ||
    (() => {
      const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('ftp_sid', id);
      return id;
    })()
  );

  // Dedupe guard — don't fire the same video_id twice within 10 seconds
  const _recentFires = {};
  function isDupe(videoId) {
    const now = Date.now();
    if (_recentFires[videoId] && now - _recentFires[videoId] < 10_000) return true;
    _recentFires[videoId] = now;
    return false;
  }

  function send(payload) {
    const body = JSON.stringify({
      event_id:   (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now()),
      ts:         new Date().toISOString().replace('T', ' ').slice(0, 19),
      session_id: SESSION_ID,
      // defaults — overridden by payload
      event_type: 'play',
      video_id:   '',
      title:      '',
      artist:     '',
      genre:      '',
      source:     'unknown',
      ...payload,
    });

    const url = `${ENDPOINT}&token=${TOKEN}`;

    // sendBeacon is fire-and-forget, survives page unload
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
    } else {
      fetch(url, {
        method:    'POST',
        body,
        headers:   { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(() => { /* silent fail — never break the player */ });
    }
  }

  return {

    // ── Call when a track starts playing ──────────────────────────
    // track: { id, title, artist, genre }
    // source: 'channel' | 'catalogue' | 'portal'
    play(track, source) {
      if (!track?.id) return;
      if (isDupe(track.id + source)) return;
      send({
        event_type: 'play',
        video_id:   track.id,
        title:      track.title   || '',
        artist:     track.artist  || '',
        genre:      track.genre   || '',
        source:     source        || 'unknown',
      });
    },

    // ── Call when user clicks a portal channel card ───────────────
    // ch: channel object from CHANNELS array
    // videoId: the resolved now-playing video id (can be null)
    portalClick(ch, videoId) {
      send({
        event_type: 'portal_click',
        video_id:   videoId || '',
        title:      ch.name  || '',
        artist:     '',
        genre:      '',
        source:     'portal',
      });
    },

    // ── Call when user skips a track ──────────────────────────────
    skip(track, source) {
      if (!track?.id) return;
      send({
        event_type: 'skip',
        video_id:   track.id,
        title:      track.title  || '',
        artist:     track.artist || '',
        genre:      track.genre  || '',
        source:     source       || 'unknown',
      });
    },

  };

})();
