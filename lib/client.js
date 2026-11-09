/**
 * dsh-context-bar — browser half.
 *
 * A hand-written module in the `window.__ModuleLoader__.load({ id, factory })`
 * shape every DSH client half uses (no ESM syntax). It requires only `react`
 * and the shared UI primitives (for DSH's own tooltip).
 *
 * One entry in the composer's status bar (`conversation.composer.dock`): a
 * 20-cell bar, the percentage and `used / window`, a mark where DSH's
 * auto-compaction starts, and the composition on hover. It reads the two
 * projections DSH's own ring reads (`contextPressure`, `contextBreakdown`):
 *  - the provider's figure (`projectedTokens`, else `pressureTokens`) when a
 *    route reports usage;
 *  - DSH's own estimate (the breakdown's sum) when it reports none — DSH's
 *    ring then shows nothing — or reported zeros (a figure under half the
 *    estimate), marked 估算. DSH's compaction measures the same way: it falls
 *    back to its estimate whenever the reported usage is missing or lower.
 * DSH's ring stays as it is; it also hides while a turn runs, this bar does not.
 */
window.__ModuleLoader__.load({
  id: "dsh-context-bar",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");
    const P = require("@deepseek-ai/dsh-client-ui-primitives");
    const h = React.createElement;

    const NS = "context-bar";
    /** Cells in the bar (5 % each). */
    const CELLS = 20;
    /** DSH compaction's defaults (dsh-compaction-basic): 80 % of the window, 64K headroom, 16 % kept verbatim. */
    const THRESHOLD_RATIO = 0.8;
    const HEADROOM = 65_536;
    const RETAIN_RATIO = 0.16;

    const DICTS = {
      en: {
        "bar.label": "Context",
        "bar.estimated": "est.",
        "bar.aria": "{percent} of context used",
        "tip.used": "{percent} of context used: {used} / {window}",
        "tip.usedNoWindow": "About {used} of context (this route states no context window)",
        "tip.real": "The provider's reported usage of the last request, plus an estimate of what was added since.",
        "tip.estimated": "This route reports no token usage (or zeros): DeepSeek Harness's own estimate, which its auto-compaction also goes by.",
        "tip.parts": "System prompt {system} · Tools {tools} · Messages {messages}",
        "tip.compact": "Auto-compaction at about {at} ({percent})",
        "tip.compactOff": "The window is too small for auto-compaction: type /compact when it fills up",
      },
      zh: {
        "bar.label": "上下文",
        "bar.estimated": "估算",
        "bar.aria": "上下文已用 {percent}",
        "tip.used": "上下文已用 {percent}：{used} / {window}",
        "tip.usedNoWindow": "上下文约 {used}（线路没有给出上下文长度）",
        "tip.real": "按服务商报告的上一轮用量，加上之后新增内容的估算。",
        "tip.estimated": "这条线路没有报告 token 用量（或报告为 0）：按 DeepSeek Harness 的估算显示，自动压缩也按这个估算判断。",
        "tip.parts": "系统提示词 {system} · 工具定义 {tools} · 对话消息 {messages}",
        "tip.compact": "约在 {at}（{percent}）时自动压缩",
        "tip.compactOff": "上下文太小，DeepSeek Harness 不会自动压缩；快满时请在对话里输入 /compact",
      },
    };

    /** A translator over one dictionary, for when the slot hands none. */
    const translator = (dict) => (key, params) => String(dict[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? ""));
    const fallbackT = translator(DICTS.zh);

    const finite = (value) => typeof value === "number" && Number.isFinite(value);

    /** A token count as DSH's own panel writes it: 950, 23.4K, 230K, 1.1M. */
    function formatTokens(value) {
      const scaled = (candidate) => (candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10));
      if (value < 1e3) return String(Math.round(value));
      if (value < 1e6) return `${scaled(value / 1e3)}K`;
      return `${scaled(value / 1e6)}M`;
    }

    /**
     * Where DSH starts auto-compacting a window: `min(80 %, window − output −
     * 64K)`. The output a request reserves is not in the projections; this
     * takes `min(128K, max(4K, window / 8))`, what dsh-cn-models,
     * dsh-intl-models and dsh-custom-models reserve (DSH's own gateway: 32K on
     * 256K). Null when DSH does not auto-compact: nothing is left, or the
     * point is at or under the tail it keeps verbatim (16 % of window −
     * output; resolveCompactSpec refuses that), below about 88K.
     */
    function compactAt(window) {
      if (!finite(window) || window <= 0) return null;
      const output = Math.min(131_072, Math.max(4_096, Math.floor(window / 8)));
      const budget = window - output;
      const at = Math.floor(Math.min(window * THRESHOLD_RATIO, budget - HEADROOM));
      return at > 0 && Math.floor(budget * RETAIN_RATIO) < at ? at : null;
    }

    /**
     * What the bar shows, from the two projections, or null when there is
     * nothing to show yet (no request, no surface).
     * @returns `{ used, window, percent, estimated, compactAt, parts }`.
     */
    function reading(pressure, breakdown) {
      const parts = breakdown && finite(breakdown.systemTokens) && finite(breakdown.toolsTokens) && finite(breakdown.messageTokens)
        ? { system: breakdown.systemTokens, tools: breakdown.toolsTokens, messages: breakdown.messageTokens }
        : null;
      const estimate = parts ? parts.system + parts.tools + parts.messages : null;
      const reported = finite(pressure?.projectedTokens) ? pressure.projectedTokens : finite(pressure?.pressureTokens) ? pressure.pressureTokens : null;
      // Zeros from a route that sends no usage read as a figure far under the estimate.
      const trusted = reported !== null && reported > 0 && !(estimate !== null && reported < estimate / 2);
      const used = trusted ? reported : estimate !== null && estimate > 0 ? estimate : null;
      if (used === null) return null;
      const window = finite(pressure?.contextWindow) && pressure.contextWindow > 0 ? pressure.contextWindow : null;
      return {
        used,
        window,
        percent: window ? Math.min(100, Math.round((used / window) * 100)) : null,
        estimated: !trusted,
        compactAt: compactAt(window),
        parts,
      };
    }

    /** The bar's tone: danger near the window's end, warn near where compaction starts. */
    function toneOf(view) {
      if (!view.window) return "normal";
      if (view.used >= view.window * 0.95) return "danger";
      if (view.used >= (view.compactAt ?? view.window * THRESHOLD_RATIO) * 0.9) return "warn";
      return "normal";
    }

    /** How many cells are lit (one at least once anything is used). */
    const litCells = (view) => (view.window ? Math.min(CELLS, Math.max(1, Math.round((view.used / view.window) * CELLS))) : 0);

    /** The hover text: the figures, where they come from, the composition, where compaction starts. */
    function tooltipText(t, view) {
      const lines = [view.window
        ? t("tip.used", { percent: `${view.percent}%`, used: formatTokens(view.used), window: formatTokens(view.window) })
        : t("tip.usedNoWindow", { used: formatTokens(view.used) })];
      lines.push(t(view.estimated ? "tip.estimated" : "tip.real"));
      if (view.parts) lines.push(t("tip.parts", { system: formatTokens(view.parts.system), tools: formatTokens(view.parts.tools), messages: formatTokens(view.parts.messages) }));
      if (view.window) {
        lines.push(view.compactAt
          ? t("tip.compact", { at: formatTokens(view.compactAt), percent: `${Math.round((view.compactAt / view.window) * 100)}%` })
          : t("tip.compactOff"));
      }
      return lines.join("\n");
    }

    const CSS = [
      ".dcb-root{--dcb-tint:var(--dsw-alias-label-tertiary);display:inline-flex;align-items:center;gap:6px;flex:none;padding:1px 8px;border-radius:var(--dsw-radius-sm,6px);color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));font-variant-numeric:tabular-nums;white-space:nowrap;cursor:default;outline:none}",
      ".dcb-root:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}",
      ".dcb-root:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}",
      ".dcb-root[data-tone=warn]{--dcb-tint:var(--dsw-alias-state-warn-primary)}",
      ".dcb-root[data-tone=danger]{--dcb-tint:var(--dsw-alias-state-error-primary)}",
      ".dcb-cells{position:relative;display:inline-flex;align-items:stretch;gap:1px;height:10px}",
      ".dcb-cell{width:4px;border-radius:1px;background:var(--dsw-alias-border-l3)}",
      ".dcb-cell[data-on]{background:var(--dcb-tint)}",
      ".dcb-mark{position:absolute;top:-2px;bottom:-2px;width:1px;margin-left:-.5px;border-radius:1px;background:var(--dsw-alias-label-secondary)}",
      ".dcb-percent{color:var(--dsw-alias-label-secondary)}",
      ".dcb-root[data-tone=warn] .dcb-percent{color:var(--dsw-alias-state-warn-primary)}",
      ".dcb-root[data-tone=danger] .dcb-percent{color:var(--dsw-alias-state-error-primary)}",
      ".dcb-tag{padding:0 4px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-xs,4px);font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}",
      "@media (max-width:720px){.dcb-label,.dcb-figures{display:none}}",
    ].join("");
    const STYLE_ID = "dsh-context-bar";

    /** Add the stylesheet once; returns its remover. */
    function installStyle() {
      if (typeof document === "undefined") return () => {};
      if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) !== null) return () => {};
      const tag = document.createElement("style");
      tag.dataset.pluginCss = STYLE_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
      return () => tag.remove();
    }

    /** The status-bar entry. Each projection is read through its hook, in a fixed order. */
    function ContextBar(props) {
      const use = typeof props.useProjection === "function" ? props.useProjection : null;
      const pressure = use ? use("contextPressure") : undefined;
      const breakdown = use ? use("contextBreakdown") : undefined;
      const t = typeof props.t === "function" ? props.t : fallbackT;
      const view = reading(pressure, breakdown);
      if (view === null) return null;
      const tone = toneOf(view);
      const lit = litCells(view);
      const children = [];
      if (view.window) {
        const cells = [];
        for (let index = 0; index < CELLS; index += 1) cells.push(h("span", { key: index, className: "dcb-cell", ...(index < lit ? { "data-on": "" } : {}) }));
        if (view.compactAt) cells.push(h("span", { key: "mark", className: "dcb-mark", style: { left: `${((view.compactAt / view.window) * 100).toFixed(2)}%` } }));
        children.push(h("span", { key: "cells", className: "dcb-cells", "aria-hidden": true }, cells));
      }
      children.push(h("span", { key: "label", className: "dcb-label" }, t("bar.label")));
      if (view.window) {
        children.push(h("span", { key: "percent", className: "dcb-percent" }, `${view.percent}%`));
        children.push(h("span", { key: "figures", className: "dcb-figures" }, `· ${formatTokens(view.used)} / ${formatTokens(view.window)}`));
      } else children.push(h("span", { key: "figures", className: "dcb-percent" }, formatTokens(view.used)));
      if (view.estimated) children.push(h("span", { key: "estimated", className: "dcb-tag" }, t("bar.estimated")));
      const tip = tooltipText(t, view);
      const anchor = h("span", {
        className: "dcb-root",
        "data-tone": tone,
        "data-estimated": view.estimated ? "true" : "false",
        role: "meter",
        tabIndex: 0,
        "aria-label": view.window ? t("bar.aria", { percent: `${view.percent}%` }) : t("tip.usedNoWindow", { used: formatTokens(view.used) }),
        ...(view.window ? { "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": view.percent } : {}),
        ...(typeof P?.Tooltip === "function" ? {} : { title: tip }),
      }, children);
      return typeof P?.Tooltip === "function" ? h(P.Tooltip, { label: () => tip, side: "top", delayMs: 200, portal: true, maxWidth: 340 }, anchor) : anchor;
    }

    function installLocale(ctx) {
      const locale = ctx.locale;
      if (locale === undefined || typeof locale.register !== "function") return;
      try {
        if (typeof locale.bind === "function" && locale.bind(NS)("bar.label") !== "bar.label") return;
      } catch {
        /* an unreadable locale face is not a reason to skip the registration */
      }
      try {
        ctx.effect(() => locale.register(NS, DICTS), "dsh-context-bar: locale namespace");
      } catch (error) {
        console.warn("dsh-context-bar: locale namespace already registered; reusing it", error);
      }
    }

    function apply(ctx) {
      installLocale(ctx);
      ctx.effect(() => installStyle(), "dsh-context-bar: stylesheet");
      const slots = ctx.slots;
      if (slots === undefined) return;
      // Beside DSH's own pills (activity, usage) and before its ring.
      ctx.effect(() => slots.inject("conversation.composer.dock", () => slots.register({
        name: "conversation.composer.dock",
        id: "context-bar",
        order: 2,
        locale: NS,
      }, ContextBar)), "dsh-context-bar: status bar");
    }

    exports.name = "dsh-context-bar";
    exports.apply = apply;
    exports.inject = ["slots", "locale"];
    /** Pure helpers, exposed for the self-test only. */
    exports.__internals = Object.freeze({ reading, compactAt, formatTokens, toneOf, litCells, tooltipText, translator, ContextBar, DICTS, CELLS, CSS });
    return module.exports;
  },
});
