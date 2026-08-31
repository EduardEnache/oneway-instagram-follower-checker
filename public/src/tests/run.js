// Test entry point. External (not inline) so it also runs under the production
// CSP (`script-src 'self'`) when the container serves /src/tests/index.html.
// Registers every suite, then runs once. Agents append imports here.
try {
  await import('./parser.test.js');
} catch (e) {
  console.warn('parser.test.js failed to load', e);
}
try {
  await import('./ui.test.js');
} catch (e) {
  console.warn('ui.test.js failed to load', e);
}
const { run } = await import('./harness.js');
await run();
