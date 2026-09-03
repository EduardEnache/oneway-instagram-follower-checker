/* ONE·WAY — public-demo client telemetry.
 *
 * Loaded by the PUBLIC nginx variant only, as a CLASSIC script (no modules),
 * after /public-extras/config.js and /public-extras/sentry.min.js.
 *
 * Hard rule: telemetry must NEVER throw into the app. A missing window.Sentry
 * or missing window.__OW_PUBLIC__ degrades to a silent no-op. Every external
 * call below is wrapped defensively.
 *
 * This file is the ONLY listener for the app's CustomEvent('oneway:event').
 */
(function () {
  'use strict';

  // --- a. Read config ------------------------------------------------------
  var cfg = window.__OW_PUBLIC__ || {};
  var haveSentry = !!(window.Sentry && cfg.sentryDsn);
  // The /__e beacon path needs no config, so we always install the listener.
  // Sentry + Cloudflare are each skipped unless their config is present.

  // --- b. Init Sentry ----------------------------------------------------
  if (haveSentry) {
    try {
      window.Sentry.init({
        dsn: cfg.sentryDsn,
        environment: cfg.sentryEnv || 'public',
        release: cfg.release,
        sampleRate: typeof cfg.sampleRate === 'number' ? cfg.sampleRate : 1.0,
        tracesSampleRate: 0,
        sendDefaultPii: false,
        maxBreadcrumbs: 40,
        beforeBreadcrumb: function (b) {
          return (b && (b.category === 'console' || b.category === 'ui.click')) ? null : b;
        },
        beforeSend: function (event) {
          // LOAD-BEARING: the data domain here is Instagram follower lists.
          // This beforeSend + sendDefaultPii:false pair is what keeps names,
          // usernames, cookies and headers out of every event. Do not remove.
          if (event.request) { delete event.request.cookies; delete event.request.headers; }
          if (event.user) delete event.user;
          return event;
        },
      });
    } catch (e) { haveSentry = false; }
  }

  // --- c. Inject the Cloudflare Web Analytics beacon --------------------
  // Done dynamically so the token stays out of the committed nginx config.
  if (cfg.cfBeacon) {
    try {
      var s = document.createElement('script');
      s.defer = true;
      s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
      s.setAttribute('data-cf-beacon', JSON.stringify({ token: cfg.cfBeacon }));
      document.head.appendChild(s);
    } catch (e) {}
  }

  // --- f. About-page correction ---------------------------------------
  // The self-hosted build ships `connect-src 'none'`; this public instance
  // relaxes the CSP so the beacons above can leave the page. Patch the
  // rendered About DOM to say so — we must NOT edit about-view.js itself.
  function annotateAboutPage() {
    try {
      var root = document.querySelector('.ow-view');
      if (!root) return;
      if (root.querySelector('.ow-public-about-note')) return; // idempotent
      var note = document.createElement('div');
      note.className = 'ow-public-about-note';
      var p = document.createElement('p');
      p.textContent =
        'Note for the public demo: on this instance the Content-Security-Policy ' +
        "is relaxed to connect-src 'self' plus the Cloudflare and Sentry hosts, " +
        'so the "zero requests" self-check above will show anonymous page-view ' +
        'and error-report beacon requests. The self-hosted build from source ' +
        "ships connect-src 'none' and makes no network calls at all.";
      note.appendChild(p);
      if (root.firstChild) root.insertBefore(note, root.firstChild);
      else root.appendChild(note);
    } catch (e) {}
  }

  // --- d. Listen for app events -----------------------------------------
  // The app emits 8 event names: app_loaded, view_opened, export_selected,
  // parse_succeeded, parse_failed, contacts_matched, data_exported,
  // snapshot_saved. Handle any name defensively.
  try {
    window.addEventListener('oneway:event', function (ev) {
      var d = (ev && ev.detail) || {};
      if (!d.name) return;

      try {
        if (window.Sentry) {
          window.Sentry.addBreadcrumb({
            category: 'oneway',
            level: 'info',
            message: d.name,
            data: d.data || {},
          });
        }
      } catch (e) {}

      try {
        var qs = new URLSearchParams({ n: d.name });
        var data = d.data || {};
        for (var k in data) {
          if (Object.prototype.hasOwnProperty.call(data, k)) qs.set(k, String(data[k]));
        }
        navigator.sendBeacon('/__e?' + qs.toString());
      } catch (e) {}

      // Escalate the one event worth quota: a real friend's export failing to parse.
      try {
        if (d.name === 'parse_failed' && window.Sentry) {
          window.Sentry.captureMessage(
            'parse_failed: ' + ((d.data && d.data.code) || 'unknown'),
            'warning'
          );
        }
      } catch (e) {}

      // About-page correction — the view DOM exists only after this event.
      try {
        if (d.name === 'view_opened' && d.data && d.data.view === 'about') annotateAboutPage();
      } catch (e) {}
    });
  } catch (e) {}

  // --- e. Persistent disclosure strip ---------------------------------
  // Non-dismissible info bar, inserted as the first child of <body>, before #app.
  // Built with createElement + textContent — no innerHTML with interpolation.
  function insertBanner() {
    try {
      if (!document.body) return;
      if (document.querySelector('.ow-public-banner')) return;

      var bar = document.createElement('div');
      bar.className = 'ow-public-banner';
      bar.setAttribute('role', 'note');

      var strong = document.createElement('strong');
      strong.textContent = 'This is the public demo of ONE·WAY.';
      bar.appendChild(strong);
      bar.appendChild(document.createTextNode(
        ' Your export is still parsed only in this tab and is never uploaded. ' +
        'Unlike the self-hosted version, this page '
      ));
      var em = document.createElement('em');
      em.textContent = 'does';
      bar.appendChild(em);
      bar.appendChild(document.createTextNode(
        ' send anonymous page-view counts and JavaScript error reports. ' +
        'No usernames, names or export contents are ever sent. '
      ));

      // TODO(user): point at your repo README
      var a1 = document.createElement('a');
      a1.href = 'https://github.com/';
      a1.textContent = "What's the difference?";
      bar.appendChild(a1);
      bar.appendChild(document.createTextNode(' · '));
      var a2 = document.createElement('a');
      a2.href = 'https://github.com/';
      a2.textContent = 'Self-host it';
      bar.appendChild(a2);

      var app = document.getElementById('app');
      if (app && app.parentNode === document.body) document.body.insertBefore(bar, app);
      else document.body.insertBefore(bar, document.body.firstChild);
    } catch (e) {}
  }

  try {
    if (document.body) insertBanner();
    else document.addEventListener('DOMContentLoaded', insertBanner);
  } catch (e) {}
})();
