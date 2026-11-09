/**
 * dsh-context-bar — host half (no-op).
 *
 * The bar is the browser half (`lib/client.js`): it reads the session's
 * `contextPressure` and `contextBreakdown` projections, which DeepSeek
 * Harness's token meter already publishes to the composer's status bar.
 * Nothing runs here; the row makes the package a loadable bundle.
 *
 * @module dsh-context-bar
 */
export const name = "dsh-context-bar";
export const inject = [];

export function apply() {
  // Nothing to do on the host.
}
