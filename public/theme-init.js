/* ONE·WAY — pre-paint theme sync. Non-module, runs synchronously in <head>
 * BEFORE the stylesheet so the first paint is already themed (no flash).
 * Keep this tiny and dependency-free. The full API lives in
 * src/ui/components/theme.js and is idempotent with this.
 *
 * localStorage['oneway.theme'] = 'light' | 'dark' | 'system' (default 'system').
 *  - 'light' / 'dark'  -> <html data-theme> is set explicitly.
 *  - 'system'          -> attribute removed; tokens.css follows the OS via
 *                         @media (prefers-color-scheme) guarded on :not([data-theme="light"]).
 */
(function () {
  var el = document.documentElement;
  var mode = "system";
  try {
    var stored = localStorage.getItem("oneway.theme");
    if (stored === "light" || stored === "dark" || stored === "system") {
      mode = stored;
    }
  } catch (e) {
    /* private mode / storage disabled — fall through to 'system' */
  }

  var prefersDark = false;
  try {
    prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch (e) {
    /* no matchMedia — assume light */
  }

  var resolved = mode === "system" ? (prefersDark ? "dark" : "light") : mode;

  if (mode === "system") {
    el.removeAttribute("data-theme");
  } else {
    el.setAttribute("data-theme", mode);
  }
  // hint native form controls / scrollbars immediately
  el.style.colorScheme = resolved;
})();
