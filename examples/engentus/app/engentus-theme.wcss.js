import {
  createWcssStylesheet,
  group,
  keyframes,
  media,
  rule
} from "../../../src/uplift/wcss-grammar.js";

const SHELL_TOKENS = {
  "--dk": "#2C3C63",
  "--mid": "#344C6C",
  "--brd": "#3D5880",
  "--brdl": "#e2e8f0",
  "--t1": "#f1f5f9",
  "--t2": "#94a3b8",
  "--t3": "#475569",
  "--tdark": "#1e293b",
  "--blue": "#8CC4D4",
  "--blu2": "#5AAABF",
  "--bluf": "#DCF0F5",
  "--red": "#dc2626",
  "--grn": "#16a34a",
  "--ylw": "#EC7424",
  "--pur": "#7c3aed",
  "--sw": "284px",
  "--th": "44px",
  "--sch": "50px"
};

const CHART_TOKENS = {
  "--dk": "#2C3C63",
  "--mid": "#344C6C",
  "--brd": "#3D5880",
  "--t1": "#f1f5f9",
  "--t2": "#94a3b8",
  "--t3": "#475569",
  "--blue": "#8CC4D4"
};

export const ENGENTUS_SHELL_THEME_STYLESHEET = createWcssStylesheet({
  name: "Engentus shell theme grammar",
  blocks: [
    group("foundation", [
      rule("*, *::before, *::after", {
        "box-sizing": "border-box",
        margin: "0",
        padding: "0"
      }),
      rule(":root", SHELL_TOKENS),
      rule("body", {
        "font-family": "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        background: "var(--dk)",
        color: "var(--t1)",
        height: "100vh",
        overflow: "hidden",
        display: "flex",
        "flex-direction": "column",
        "font-size": "12.5px"
      }),
      rule("a", {
        color: "inherit",
        "text-decoration": "none"
      }),
      rule("#tb-brand img, .auth-brand img", {
        width: "auto",
        "flex-shrink": "0"
      })
    ]),

    group("toolbar", [
      rule("#tb", {
        height: "var(--th)",
        background: "var(--dk)",
        "border-bottom": "1px solid var(--brd)",
        display: "flex",
        "align-items": "center",
        "flex-shrink": "0",
        "z-index": "50"
      }),
      rule("#tb-brand", {
        padding: "0 14px",
        "min-width": "var(--sw)",
        "border-right": "1px solid var(--brd)",
        height: "100%",
        display: "flex",
        "align-items": "center",
        gap: "8px",
        "letter-spacing": "-.02em",
        transition: "background .15s",
        "user-select": "none"
      }, [
        rule("&.clickable", { cursor: "pointer" }),
        rule("&.clickable:hover", { background: "rgba(255,255,255,.05)" })
      ]),
      rule("#tb-divider", {
        width: "1px",
        height: "24px",
        background: "var(--brd)",
        "flex-shrink": "0"
      }),
      rule("#tb-goodman-tools", {
        display: "flex",
        "align-items": "center",
        flex: "1"
      }),
      rule(".tb-site-summary", {
        "font-size": "11px",
        color: "var(--t2)",
        "padding-left": "12px"
      }),
      rule(".mode-pill", {
        display: "flex",
        background: "var(--mid)",
        "border-radius": "6px",
        padding: "2px",
        margin: "0 12px",
        gap: "2px"
      }),
      rule(".mode-btn", {
        background: "none",
        border: "none",
        color: "var(--t2)",
        padding: "4px 14px",
        "border-radius": "4px",
        cursor: "pointer",
        "font-size": "12px",
        "font-weight": "500",
        transition: "all .15s"
      }, [
        rule("&.on", {
          background: "var(--blue)",
          color: "var(--dk)"
        })
      ]),
      rule("#tb-wins", {
        display: "flex",
        gap: "2px",
        "margin-left": "auto",
        "padding-right": "8px",
        "align-items": "center"
      }),
      rule(".tbw", {
        background: "none",
        border: "1px solid transparent",
        "border-radius": "6px",
        color: "var(--t2)",
        padding: "5px 10px",
        cursor: "pointer",
        "font-size": "12px",
        "font-weight": "500",
        transition: "all .15s",
        display: "flex",
        "align-items": "center",
        gap: "5px"
      }, [
        rule("&:hover", {
          "border-color": "var(--brd)",
          color: "var(--t1)"
        })
      ]),
      rule("#user-prof", {
        display: "flex",
        "align-items": "center",
        gap: "8px",
        padding: "0 14px",
        cursor: "pointer",
        "border-left": "1px solid var(--brd)",
        height: "100%",
        "flex-shrink": "0",
        "user-select": "none",
        transition: "background .15s",
        position: "relative"
      }, [
        rule("&:hover", { background: "rgba(255,255,255,.04)" })
      ]),
      rule("#up-avatar", {
        width: "28px",
        height: "28px",
        "border-radius": "50%",
        background: "var(--blue)",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        "font-size": "10px",
        "font-weight": "700",
        color: "var(--dk)",
        "flex-shrink": "0"
      }),
      rule("#up-info", {
        display: "flex",
        "flex-direction": "column",
        gap: "1px"
      }),
      rule("#up-name", {
        "font-size": "11.5px",
        "font-weight": "600",
        color: "var(--t1)",
        "line-height": "1.2"
      }),
      rule("#up-role", {
        "font-size": "9.5px",
        color: "var(--t2)",
        "line-height": "1.2"
      }),
      rule("#up-caret", {
        "font-size": "9px",
        color: "transparent",
        "margin-left": "2px",
        position: "relative"
      }, [
        rule("&::before", {
          content: "\"\\25BE\"",
          color: "var(--t2)",
          position: "absolute",
          inset: "0"
        })
      ]),
      rule("#up-menu", {
        position: "absolute",
        top: "calc(100% + 2px)",
        right: "0",
        background: "var(--mid)",
        border: "1px solid var(--brd)",
        "border-radius": "8px",
        "min-width": "170px",
        "z-index": "200",
        "box-shadow": "0 8px 24px rgba(0,0,0,.3)",
        padding: "4px",
        display: "none"
      }, [
        rule("&.open", { display: "block" })
      ]),
      rule(".up-mi", {
        display: "flex",
        "align-items": "center",
        gap: "8px",
        padding: "7px 10px",
        "border-radius": "5px",
        "font-size": "12px",
        color: "var(--t1)",
        cursor: "pointer",
        transition: "background .1s"
      }, [
        rule("&:hover", { background: "rgba(255,255,255,.07)" })
      ]),
      rule(".up-mi-icon", {
        "font-size": "13px",
        width: "16px",
        "text-align": "center",
        "flex-shrink": "0",
        color: "var(--t2)"
      }),
      rule(".up-sep", {
        height: "1px",
        background: "var(--brd)",
        margin: "3px 0"
      }),
      rule(".up-mi-signout", { color: "#f87171" })
    ]),

    group("auth", [
      rule(".surface-auth-view", {
        flex: "1",
        "min-height": "100vh"
      }),
      rule("#view-login", {
        perspective: "2200px",
        "perspective-origin": "50% 50%"
      }),
      rule("#view-signout", {
        perspective: "2200px",
        "perspective-origin": "50% 50%"
      }),
      rule(".auth-book", {
        width: "100%",
        height: "100%",
        display: "flex",
        "flex-shrink": "0",
        position: "relative",
        "transform-origin": "right center",
        transition: "transform 0.9s cubic-bezier(0.77, 0, 0.175, 1)",
        "backface-visibility": "hidden",
        "will-change": "transform"
      }, [
        rule("&::after", {
          content: "\"\"",
          position: "absolute",
          inset: "0",
          background: "linear-gradient(to left, rgba(0,0,0,.6) 0%, rgba(0,0,0,.15) 18%, transparent 45%)",
          "pointer-events": "none",
          opacity: "0",
          transition: "opacity 0.9s cubic-bezier(0.77, 0, 0.175, 1)"
        }),
        rule("&.folding::after", { opacity: "1" }),
        rule("&.folding", { transform: "rotateY(-90deg)" }),
        rule("&.incoming", {
          transform: "rotateY(90deg)",
          animation: "authBookIncoming 0.9s cubic-bezier(0.77, 0, 0.175, 1) forwards"
        })
      ]),
      keyframes("authBookIncoming", [
        { step: "to", declarations: { transform: "rotateY(0deg)" } }
      ]),
      keyframes("authSpin", [
        { step: "to", declarations: { transform: "rotate(360deg)" } }
      ]),
      rule("#view-signout .auth-book", {
        "transform-origin": "left center"
      }),
      rule("#view-signout .auth-book::after", {
        background: "linear-gradient(to right, rgba(0,0,0,.6) 0%, rgba(0,0,0,.15) 18%, transparent 45%)"
      }),
      rule(".auth-left", {
        flex: "0 0 55%",
        background: "linear-gradient(160deg, rgba(12,20,42,0.91) 0%, rgba(36,54,90,0.86) 55%, rgba(18,28,55,0.93) 100%), url(../img/main.png) center / cover no-repeat",
        display: "flex",
        "flex-direction": "column",
        padding: "32px 40px",
        position: "relative",
        overflow: "hidden"
      }, [
        rule("&::before", {
          content: "\"\"",
          position: "absolute",
          inset: "0",
          "background-image": "linear-gradient(rgba(140,196,212,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(140,196,212,.035) 1px, transparent 1px)",
          "background-size": "44px 44px",
          "pointer-events": "none"
        })
      ]),
      rule(".auth-right", {
        flex: "1",
        background: "#f8fafc",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        padding: "40px 36px"
      }),
      rule(".auth-brand", {
        display: "flex",
        "align-items": "center",
        gap: "10px",
        position: "relative",
        "z-index": "1"
      }),
      rule(".auth-brand-div", {
        width: "1px",
        height: "20px",
        background: "rgba(140,196,212,.35)"
      }),
      rule(".auth-hero", {
        flex: "1",
        display: "flex",
        "flex-direction": "column",
        "justify-content": "center",
        position: "relative",
        "z-index": "1",
        padding: "0 8px"
      }),
      rule(".auth-hero img, .auth-form-logo img", {
        "align-self": "flex-start"
      }),
      rule(".auth-tagline", {
        "font-size": "28px",
        "font-weight": "700",
        color: "var(--t1)",
        "line-height": "1.22",
        "margin-bottom": "14px",
        "letter-spacing": "-.025em"
      }, [
        rule("em", {
          color: "var(--blue)",
          "font-style": "normal"
        })
      ]),
      rule(".auth-sub", {
        "font-size": "13px",
        color: "rgba(148,163,184,.85)",
        "line-height": "1.65",
        "margin-bottom": "34px",
        "max-width": "380px"
      }),
      rule(".auth-bullets", {
        "list-style": "none",
        display: "flex",
        "flex-direction": "column",
        gap: "12px"
      }),
      rule(".auth-bullet", {
        display: "flex",
        "align-items": "center",
        gap: "11px",
        "font-size": "12.5px",
        color: "rgba(241,245,249,.78)"
      }),
      rule(".auth-bullet-dot", {
        width: "6px",
        height: "6px",
        "border-radius": "50%",
        background: "var(--blue)",
        "flex-shrink": "0",
        "box-shadow": "0 0 0 3px rgba(140,196,212,.18)"
      }),
      rule(".auth-footer", {
        "font-size": "10px",
        color: "rgba(148,163,184,.45)",
        position: "relative",
        "z-index": "1"
      }),
      rule(".auth-form-wrap", {
        width: "100%",
        "max-width": "372px"
      }),
      rule(".auth-form-logo", {
        "margin-bottom": "26px"
      }),
      rule(".auth-form-title, .auth-so-title", {
        "font-size": "22px",
        "font-weight": "700",
        color: "#0f172a",
        "margin-bottom": "5px",
        "letter-spacing": "-.025em"
      }),
      rule(".auth-form-sub, .auth-so-sub", {
        "font-size": "12px",
        color: "#64748b",
        "margin-bottom": "26px"
      }),
      rule(".ms-btn", {
        width: "100%",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        gap: "11px",
        padding: "12px 18px",
        background: "#2f2f2f",
        color: "#fff",
        border: "none",
        "border-radius": "6px",
        "font-size": "13.5px",
        "font-weight": "500",
        cursor: "pointer",
        transition: "background .15s",
        "letter-spacing": ".01em",
        "margin-bottom": "20px",
        "font-family": "inherit"
      }, [
        rule("&:hover", { background: "#1a1a1a" }),
        rule("&.pending", {
          "pointer-events": "none",
          opacity: "0.92"
        }),
        rule("&.pending svg, &.folding svg", {
          display: "none"
        }),
        rule("&.pending::before", {
          content: "\"\"",
          display: "inline-block",
          width: "13px",
          height: "13px",
          border: "2px solid rgba(255,255,255,.28)",
          "border-top-color": "rgba(255,255,255,.9)",
          "border-radius": "50%",
          animation: "authSpin 0.65s linear infinite",
          "vertical-align": "-2px",
          "margin-right": "5px",
          "flex-shrink": "0"
        })
      ]),
      rule(".auth-submit.pending", {
        "pointer-events": "none",
        opacity: "0.92"
      }),
      rule(".auth-divider", {
        display: "flex",
        "align-items": "center",
        gap: "12px",
        "margin-bottom": "20px"
      }),
      rule(".auth-divider-line", {
        flex: "1",
        height: "1px",
        background: "#e2e8f0"
      }),
      rule(".auth-divider-text", {
        "font-size": "11px",
        color: "#94a3b8",
        "white-space": "nowrap"
      }),
      rule(".auth-field", { "margin-bottom": "14px" }),
      rule(".auth-field label", {
        display: "block",
        "font-size": "11.5px",
        "font-weight": "600",
        color: "#374151",
        "margin-bottom": "5px"
      }),
      rule(".auth-input", {
        width: "100%",
        padding: "10px 12px",
        border: "1px solid #d1d5db",
        "border-radius": "6px",
        "font-size": "13px",
        color: "#0f172a",
        background: "#fff",
        transition: "border-color .15s, box-shadow .15s",
        outline: "none",
        "font-family": "inherit"
      }, [
        rule("&:focus", {
          "border-color": "var(--blue)",
          "box-shadow": "0 0 0 3px rgba(140,196,212,.2)"
        })
      ]),
      rule(".auth-pw-wrap", { position: "relative" }),
      rule(".auth-pw-toggle", {
        position: "absolute",
        right: "10px",
        top: "50%",
        transform: "translateY(-50%)",
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "#94a3b8",
        "font-size": "14px",
        padding: "2px",
        "line-height": "1"
      }, [
        rule("&:hover", { color: "#475569" })
      ]),
      rule(".auth-forgot", {
        "text-align": "right",
        "margin-top": "-8px",
        "margin-bottom": "20px"
      }),
      rule(".auth-forgot a", {
        "font-size": "11px",
        color: "var(--blu2)",
        "text-decoration": "none"
      }, [
        rule("&:hover", { "text-decoration": "underline" })
      ]),
      rule(".auth-submit", {
        width: "100%",
        display: "inline-block",
        "align-items": "center",
        "justify-content": "center",
        gap: "11px",
        padding: "11.5px",
        background: "var(--dk)",
        color: "#fff",
        border: "none",
        "border-radius": "6px",
        "font-size": "13.5px",
        "font-weight": "600",
        cursor: "pointer",
        transition: "background .15s",
        "letter-spacing": ".015em",
        "font-family": "inherit"
      }, [
        rule("&:hover", { background: "#1e2f52" })
      ]),
      rule(".auth-form-footer", {
        "margin-top": "22px",
        "font-size": "10.5px",
        color: "#94a3b8",
        "text-align": "center",
        "line-height": "1.65"
      }),
      rule(".auth-form-footer a", {
        color: "var(--blu2)",
        "text-decoration": "none"
      }, [
        rule("&:hover", { "text-decoration": "underline" })
      ]),
      rule(".auth-signout-icon", {
        width: "54px",
        height: "54px",
        "border-radius": "50%",
        background: "var(--grn)",
        border: "none",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        margin: "0 auto 20px",
        "font-size": "24px",
        color: "#fff"
      }),
      rule(".auth-so-title", {
        "font-size": "21px",
        "font-weight": "700",
        color: "#0f172a",
        "margin-bottom": "9px",
        "letter-spacing": "-.025em",
        "text-align": "center"
      }),
      rule(".auth-so-sub", {
        "font-size": "12.5px",
        color: "#64748b",
        "text-align": "center",
        "margin-bottom": "28px",
        "line-height": "1.55"
      })
    ]),

    group("home", [
      rule("#view-home", {
        flex: "1",
        display: "flex",
        "flex-direction": "column",
        overflow: "hidden"
      }),
      rule("#news-panel", {
        width: "var(--sw)",
        "min-width": "var(--sw)",
        background: "var(--mid)",
        "border-right": "1px solid var(--brd)",
        display: "flex",
        "flex-direction": "column",
        overflow: "hidden"
      }),
      rule(".news-hdr", {
        padding: "11px 13px",
        "border-bottom": "1px solid var(--brd)",
        "font-size": "9.5px",
        "font-weight": "700",
        "text-transform": "uppercase",
        "letter-spacing": ".08em",
        color: "var(--t2)",
        display: "flex",
        "align-items": "center",
        "justify-content": "space-between"
      }),
      rule(".news-live", {
        display: "flex",
        "align-items": "center",
        gap: "5px",
        "font-size": "9px",
        color: "#4ade80",
        "font-weight": "600"
      }),
      rule(".news-live-dot", {
        width: "5px",
        height: "5px",
        "border-radius": "50%",
        background: "#4ade80",
        animation: "livepulse 2s infinite"
      }),
      keyframes("livepulse", [
        { step: "0%, 100%", declarations: { opacity: "1" } },
        { step: "50%", declarations: { opacity: ".3" } }
      ]),
      rule(".news-list, #sb-scroll, #mill-sb-scroll, #mill-force-sb-scroll", {
        flex: "1",
        "overflow-y": "auto",
        "overflow-x": "hidden"
      }),
      rule(".news-list", { padding: "8px" }),
      rule(".news-list::-webkit-scrollbar, #sb-scroll::-webkit-scrollbar, #mill-sb-scroll::-webkit-scrollbar, #mill-force-sb-scroll::-webkit-scrollbar", {
        width: "4px"
      }),
      rule(".news-list::-webkit-scrollbar-thumb, #sb-scroll::-webkit-scrollbar-thumb, #mill-sb-scroll::-webkit-scrollbar-thumb, #mill-force-sb-scroll::-webkit-scrollbar-thumb", {
        background: "var(--brd)",
        "border-radius": "2px"
      }),
      rule(".news-item", {
        background: "rgba(0,0,0,.18)",
        "border-radius": "6px",
        padding: "9px 10px",
        "margin-bottom": "7px",
        "border-left": "3px solid transparent",
        cursor: "pointer",
        transition: "background .12s"
      }, [
        rule("&:hover", { background: "rgba(0,0,0,.3)" })
      ]),
      rule(".ni-alert", { "border-left-color": "var(--ylw)" }),
      rule(".ni-product", { "border-left-color": "#4ade80" }),
      rule(".ni-industry", { "border-left-color": "#a78bfa" }),
      rule(".ni-platform", { "border-left-color": "var(--blue)" }),
      rule(".ni-cat", {
        "font-size": "8.5px",
        "font-weight": "700",
        "text-transform": "uppercase",
        "letter-spacing": ".05em",
        "margin-bottom": "3px"
      }),
      rule(".ni-alert .ni-cat", { color: "var(--ylw)" }),
      rule(".ni-product .ni-cat", { color: "#4ade80" }),
      rule(".ni-industry .ni-cat", { color: "#a78bfa" }),
      rule(".ni-platform .ni-cat", { color: "var(--blue)" }),
      rule(".ni-title", {
        "font-size": "11.5px",
        color: "var(--t1)",
        "line-height": "1.38",
        "margin-bottom": "4px"
      }),
      rule(".ni-time", {
        "font-size": "9.5px",
        color: "var(--t2)"
      }),
      rule("#module-area", {
        flex: "1",
        "overflow-y": "auto",
        padding: "22px 24px"
      }),
      rule("#module-area::-webkit-scrollbar", { width: "5px" }),
      rule("#module-area::-webkit-scrollbar-thumb", {
        background: "var(--brd)",
        "border-radius": "3px"
      }),
      rule(".mod-area-hdr", { "margin-bottom": "18px" }),
      rule(".mod-area-hdr h2", {
        "font-size": "15px",
        "font-weight": "700",
        color: "var(--t1)",
        "margin-bottom": "5px"
      }),
      rule(".mod-area-meta", {
        display: "flex",
        "align-items": "center",
        gap: "10px"
      }),
      rule(".mod-area-meta p", {
        "font-size": "11px",
        color: "var(--t2)"
      }),
      rule(".mill-pill", {
        display: "inline-flex",
        "align-items": "center",
        gap: "5px",
        background: "rgba(140,196,212,.1)",
        border: "1px solid rgba(140,196,212,.22)",
        "border-radius": "4px",
        padding: "2px 9px",
        "font-size": "10px",
        color: "var(--blue)",
        "font-weight": "600"
      }),
      rule("#module-grid", {
        display: "grid",
        "grid-template-columns": "repeat(4, 1fr)",
        gap: "12px"
      }),
      rule(".mod-card", {
        background: "var(--mid)",
        border: "1px solid var(--brd)",
        "border-radius": "10px",
        padding: "16px 14px 13px",
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        gap: "7px",
        "text-align": "center",
        transition: "all .18s",
        position: "relative",
        "min-height": "148px"
      }, [
        rule("&.active", {
          "border-color": "rgba(140,196,212,.45)",
          cursor: "pointer",
          background: "rgba(140,196,212,.06)"
        }),
        rule("&.active:hover", {
          background: "rgba(140,196,212,.13)",
          "border-color": "var(--blue)",
          transform: "translateY(-2px)",
          "box-shadow": "0 6px 20px rgba(0,0,0,.25)"
        }),
        rule("&.locked", { opacity: ".35" })
      ]),
      rule(".mod-icon", {
        width: "64px",
        height: "50px",
        "border-radius": "6px",
        overflow: "hidden",
        "flex-shrink": "0"
      }),
      rule(".mod-icon-img", {
        width: "100%",
        height: "100%",
        "object-fit": "cover"
      }),
      rule(".mod-icon-glyph", {
        color: "var(--blue)",
        "font-size": "10px",
        "font-weight": "800",
        "letter-spacing": ".08em"
      }),
      rule(".mod-name", {
        "font-size": "11.5px",
        "font-weight": "600",
        color: "var(--t1)",
        "line-height": "1.3"
      }),
      rule(".mod-desc", {
        "font-size": "9.5px",
        color: "var(--t2)",
        "line-height": "1.4"
      }),
      rule(".mod-lock", {
        position: "absolute",
        top: "9px",
        right: "9px",
        "font-size": "10px",
        color: "var(--t2)",
        opacity: ".55"
      }),
      rule(".mod-status", {
        "font-size": "8.5px",
        padding: "2px 8px",
        "border-radius": "3px",
        "font-weight": "600",
        "margin-top": "auto"
      }),
      rule(".ms-open", {
        background: "rgba(140,196,212,.18)",
        color: "var(--blue)"
      }),
      rule(".ms-soon", {
        background: "rgba(255,255,255,.05)",
        color: "var(--t2)"
      })
    ]),

    group("shared views", [
      rule("#view-goodman, #view-mill, #view-mill-force", {
        flex: "1",
        display: "flex",
        "flex-direction": "column",
        overflow: "hidden"
      }),
      rule("#body, #mill-body, #mill-force-body", {
        flex: "1",
        display: "flex",
        overflow: "hidden"
      }),
      rule("#sb, #mill-sb, #mill-force-sb", {
        width: "var(--sw)",
        background: "var(--mid)",
        "border-right": "1px solid var(--brd)",
        display: "flex",
        "flex-direction": "column",
        overflow: "hidden"
      }),
      rule("#sb, #mill-sb", {
        "min-width": "var(--sw)"
      }),
      rule("#mill-force-sb", {
        "flex-shrink": "0"
      }),
      rule(".ssec", {
        padding: "10px 12px",
        "border-bottom": "1px solid var(--brd)"
      }),
      rule(".ssec-title, .metric-group-title", {
        "font-size": "9.5px",
        "font-weight": "700",
        "text-transform": "uppercase",
        "letter-spacing": ".08em",
        color: "var(--t2)",
        "margin-bottom": "8px",
        display: "flex",
        "align-items": "center",
        "justify-content": "space-between"
      }),
      rule(".ssec-title button", {
        background: "none",
        border: "none",
        color: "var(--blue)",
        cursor: "pointer",
        "font-size": "11px",
        "font-weight": "600",
        padding: "0"
      }, [
        rule("&:hover", { color: "var(--blu2)" })
      ]),
      rule(".sidebar-list, .metric-list", {
        "list-style": "none",
        display: "grid",
        gap: "7px",
        "line-height": "1.42",
        "font-size": "11px"
      }),
      rule(".sidebar-note", {
        "font-size": "9.5px",
        color: "var(--t2)",
        "margin-top": "6px"
      })
    ]),

    group("chart scaffold", [
      rule("#chart-area", {
        flex: "1",
        display: "flex",
        "flex-direction": "column",
        overflow: "hidden"
      }),
      rule("#mill-main", {
        flex: "1",
        display: "flex",
        overflow: "hidden",
        background: "var(--dk)"
      }),
      rule("#mill-force-chart-area", {
        flex: "1",
        display: "flex",
        "flex-direction": "column",
        background: "var(--dk)",
        overflow: "hidden"
      }),
      rule("#chart-wrap", {
        flex: "1",
        background: "#fff",
        margin: "0 8px 8px",
        "border-radius": "0 0 8px 8px",
        position: "relative",
        overflow: "hidden",
        "box-shadow": "0 1px 4px rgba(0,0,0,.15)"
      }),
      rule("#scr.hidden + #chart-wrap", {
        "margin-top": "8px",
        "border-radius": "8px"
      }),
      rule("#chart-svg, #mill-force-chart-wrap iframe", {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        border: "0",
        display: "block"
      }),
      rule("#mc-canvas", {
        "pointer-events": "none"
      }),
      rule(".chart-page__overlay-canvas", {
        "pointer-events": "none"
      }),
      rule("#chart-tip", {
        position: "absolute",
        "pointer-events": "none",
        background: "rgba(15,23,42,.9)",
        color: "var(--t1)",
        padding: "6px 10px",
        "border-radius": "6px",
        "font-size": "11px",
        opacity: "0",
        transition: "opacity .1s",
        "line-height": "1.7",
        "z-index": "20",
        "white-space": "nowrap"
      }),
      rule("#scr", {
        height: "var(--sch)",
        background: "var(--mid)",
        "border-bottom": "1px solid var(--brd)",
        display: "flex",
        "align-items": "center",
        gap: "9px",
        padding: "0 12px",
        margin: "7px 8px 0",
        "border-radius": "8px 8px 0 0",
        "flex-shrink": "0"
      }),
      rule("#scr.hidden, #scr[hidden]", { display: "none" }),
      rule("#play-btn", {
        width: "26px",
        height: "26px",
        "border-radius": "50%",
        border: "none",
        background: "var(--blue)",
        color: "var(--dk)",
        cursor: "pointer",
        "font-size": "11px",
        "flex-shrink": "0",
        transition: "background .15s",
        display: "flex",
        "align-items": "center",
        "justify-content": "center"
      }, [
        rule("&:hover", { background: "var(--blu2)" })
      ]),
      rule("#time-sl", { flex: "1" }),
      rule("#t-lbl", {
        "font-size": "11px",
        "font-weight": "600",
        "font-variant-numeric": "tabular-nums",
        "min-width": "54px",
        "text-align": "left",
        color: "var(--t1)"
      }),
      rule(".goodman-time-prefix", {
        "font-size": "11px",
        "font-weight": "600",
        color: "var(--t1)",
        "margin-left": "2px",
        "margin-right": "-7px",
        "white-space": "nowrap"
      }),
      rule(".fail-badge", {
        "font-size": "10.5px",
        "min-width": "80px",
        "text-align": "right",
        color: "#f87171",
        "font-variant-numeric": "tabular-nums"
      }),
      rule("#spd-wrap", {
        display: "flex",
        "align-items": "center",
        gap: "4px",
        "flex-shrink": "0"
      }),
      rule("#spd-wrap label, #trail-wrap label", {
        "font-size": "10.5px",
        color: "var(--t2)",
        cursor: "pointer"
      }),
      rule("#spd-sl", {
        width: "72px",
        "accent-color": "var(--blue)",
        cursor: "pointer"
      }),
      rule("#spd-lbl", {
        "min-width": "34px",
        "text-align": "right",
        color: "var(--t1)",
        "font-size": "10.5px",
        "font-variant-numeric": "tabular-nums"
      }),
      rule("#trail-wrap", {
        display: "flex",
        "align-items": "center",
        gap: "3px",
        "flex-shrink": "0",
        cursor: "pointer"
      }),
      rule("#trail-cb", {
        "accent-color": "var(--blue)",
        cursor: "pointer"
      })
    ]),

    group("floating windows", [
      rule("#wl", {
        position: "fixed",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
        "pointer-events": "none",
        "z-index": "200"
      }),
      rule(".goodman-window", {
        top: "88px",
        left: "420px",
        width: "420px",
        "max-width": "calc(100vw - 460px)",
        "pointer-events": "all",
        "z-index": "220"
      }),
      rule(".goodman-window.stats-window", {
        top: "118px",
        left: "460px"
      }),
      rule(".goodman-window.anova-window", {
        top: "148px",
        left: "500px"
      }),
      rule(".goodman-window[hidden]", { display: "none" }),
      rule(".fw", {
        position: "absolute",
        "pointer-events": "all",
        background: "#fff",
        "border-radius": "10px",
        "box-shadow": "0 8px 32px rgba(0,0,0,.22), 0 0 0 1px rgba(0,0,0,.07)",
        display: "flex",
        "flex-direction": "column",
        overflow: "hidden",
        "min-width": "300px",
        "min-height": "140px"
      }),
      rule(".fw-tb", {
        background: "var(--dk)",
        padding: "7px 9px",
        display: "flex",
        "align-items": "center",
        gap: "7px",
        cursor: "grab",
        "flex-shrink": "0",
        "border-radius": "10px 10px 0 0",
        "user-select": "none"
      }, [
        rule("&:active", { cursor: "grabbing" })
      ]),
      rule(".fw-title", {
        flex: "1",
        "font-size": "12px",
        "font-weight": "600",
        color: "var(--t1)"
      }),
      rule(".fw-btn", {
        width: "18px",
        height: "18px",
        "border-radius": "3px",
        border: "none",
        background: "rgba(255,255,255,.1)",
        color: "var(--t2)",
        cursor: "pointer",
        "font-size": "10px",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        transition: "background .1s"
      }, [
        rule("&:hover", {
          background: "rgba(255,255,255,.2)",
          color: "var(--t1)"
        })
      ]),
      rule(".fw-body", {
        flex: "1",
        overflow: "auto",
        position: "relative"
      }),
      rule(".fw-rz", {
        position: "absolute",
        right: "0",
        bottom: "0",
        width: "16px",
        height: "16px",
        cursor: "nwse-resize",
        background: "linear-gradient(135deg, transparent 50%, #e2e8f0 50%)"
      }),
      rule(".goodman-window-empty", {
        "min-height": "180px",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        padding: "18px",
        color: "#94a3b8",
        "text-align": "center"
      }),
      rule(".goodman-window-empty-text", {
        margin: "0",
        "font-size": "12px"
      }),
      rule(".goodman-window-empty-message", {
        padding: "12px",
        margin: "0",
        "font-size": "11.5px",
        color: "#94a3b8"
      }),
      rule(".stbl", {
        width: "100%",
        "border-collapse": "collapse",
        "font-size": "11.5px"
      }),
      rule(".stbl th", {
        background: "#f8fafc",
        color: "#475569",
        "font-weight": "600",
        padding: "6px 8px",
        "text-align": "left",
        "border-bottom": "1px solid var(--brdl)",
        "font-size": "10px",
        "text-transform": "uppercase",
        "letter-spacing": ".04em"
      }),
      rule(".stbl td", {
        padding: "5px 8px",
        "border-bottom": "1px solid #f1f5f9",
        color: "#1e293b"
      }),
      rule(".stbl .num", {
        "font-variant-numeric": "tabular-nums",
        "text-align": "right"
      }),
      rule(".stbl tr:last-child td", { "border-bottom": "none" }),
      rule(".sc-dot", {
        display: "inline-block",
        width: "8px",
        height: "8px",
        "border-radius": "50%",
        "margin-right": "5px"
      }),
      rule(".anova-stat", {
        display: "flex",
        gap: "12px",
        "flex-wrap": "wrap",
        padding: "10px 12px",
        background: "#f8fafc",
        "border-bottom": "1px solid var(--brdl)"
      }),
      rule(".anova-kv", {
        display: "flex",
        "flex-direction": "column",
        gap: "2px"
      }),
      rule(".anova-k", {
        "font-size": "9.5px",
        "text-transform": "uppercase",
        "letter-spacing": ".05em",
        color: "#64748b",
        "font-weight": "600"
      }),
      rule(".anova-v", {
        "font-size": "16px",
        "font-weight": "700",
        color: "#0f172a",
        "font-variant-numeric": "tabular-nums"
      }),
      rule(".anova-sig", {
        "font-size": "10px",
        padding: "2px 7px",
        "border-radius": "3px",
        "font-weight": "600",
        "align-self": "center"
      }),
      rule(".anova-sig.yes", {
        background: "#dcfce7",
        color: "#15803d"
      }),
      rule(".anova-sig.no", {
        background: "#f1f5f9",
        color: "#64748b"
      }),
      rule(".anova-note", {
        "font-size": "10.5px",
        color: "#64748b",
        padding: "6px 12px",
        "border-bottom": "1px solid var(--brdl)"
      }),
      rule(".goodman-anova-box-plot", { "min-height": "150px" }),
      rule(".leg-row", {
        display: "flex",
        "align-items": "center",
        gap: "6px",
        "margin-bottom": "4px"
      }),
      rule(".leg-sw", {
        width: "13px",
        height: "13px",
        "border-radius": "3px",
        "flex-shrink": "0",
        opacity: ".85"
      }),
      rule(".leg-row span", {
        "font-size": "10.5px",
        color: "var(--t2)"
      }),
      rule(".goodman-fatigue-legend-note", {
        "font-size": "9.5px",
        color: "var(--t2)",
        "margin-top": "6px",
        "line-height": "1.5"
      }),
      rule(".info-box", {
        background: "rgba(0,0,0,.2)",
        "border-radius": "5px",
        padding: "8px 10px",
        "margin-top": "4px"
      }),
      rule(".info-row", {
        display: "flex",
        "justify-content": "space-between",
        "font-size": "11px",
        color: "var(--t2)",
        "margin-bottom": "3px"
      }),
      rule(".info-row:last-child", { "margin-bottom": "0" }),
      rule(".info-value", {
        "font-weight": "600",
        "font-variant-numeric": "tabular-nums"
      }),
      rule(".goodman-param-summary", {
        gap: "8px",
        "align-items": "baseline"
      }),
      rule(".goodman-param-summary .info-value", {
        color: "var(--t1)",
        "font-size": "10.5px",
        "text-align": "right"
      }),
      rule(".goodman-probe-intro", {
        display: "flex",
        gap: "2px",
        "font-size": "10.5px",
        color: "var(--t2)",
        "margin-bottom": "6px"
      }),
      rule(".goodman-probe-comparison-rows", {
        display: "grid",
        gap: "6px"
      }),
      rule(".goodman-probe-bolt", {
        border: "1px solid var(--brd)",
        "border-radius": "5px",
        padding: "6px 7px",
        background: "rgba(0,0,0,.12)"
      }),
      rule(".goodman-probe-bolt-name", {
        "font-size": "11px",
        "font-weight": "700",
        "margin-bottom": "5px"
      }),
      rule(".goodman-probe-bolt-name--primary", { color: "#dc2626" }),
      rule(".goodman-probe-bolt-name--maintenance", { color: "#8CC4D4" })
    ]),

    group("controls and editor", [
      rule(".mc-row", {
        display: "flex",
        "justify-content": "space-between",
        "align-items": "center",
        padding: "6px 0",
        "font-size": "11px"
      }),
      rule(".mc-row label", { color: "var(--t2)" }),
      rule(".mc-row input[type=number]", {
        width: "70px",
        background: "var(--dk)",
        color: "var(--t1)",
        border: "1px solid var(--brd)",
        "border-radius": "3px",
        padding: "3px 5px",
        "font-size": "11px",
        "text-align": "right"
      }),
      rule(".run-row", {
        display: "flex",
        gap: "5px",
        "margin-top": "8px"
      }),
      rule(".rbtn", {
        flex: "1",
        padding: "7px",
        "border-radius": "5px",
        border: "none",
        cursor: "pointer",
        "font-size": "11.5px",
        "font-weight": "600",
        transition: "all .15s"
      }),
      rule(".rbtn.go", {
        background: "var(--grn)",
        color: "#fff"
      }),
      rule(".rbtn.go:hover", { background: "#15803d" }),
      rule(".rbtn.go:disabled", {
        opacity: ".4",
        cursor: "not-allowed"
      }),
      rule(".rbtn.pause", {
        background: "var(--ylw)",
        color: "#fff"
      }),
      rule(".rbtn.stop", {
        background: "#dc2626",
        color: "#fff"
      }),
      rule(".rbtn:disabled", {
        opacity: ".4",
        cursor: "not-allowed"
      }),
      rule(".prog-wrap", {
        height: "4px",
        margin: "7px 0 16px",
        position: "relative",
        background: "var(--brd)",
        "border-radius": "2px",
        overflow: "visible"
      }),
      rule(".prog-fill", {
        position: "absolute",
        left: "0",
        top: "0",
        bottom: "0",
        width: "0",
        background: "var(--blue)",
        transition: "width .2s, opacity .15s"
      }),
      rule(".prog-lbl", {
        display: "block",
        "margin-top": "3px",
        "font-size": "10px",
        color: "var(--t2)",
        "font-variant-numeric": "tabular-nums",
        "text-align": "right"
      }),
      rule(".save-sim-btn", {
        width: "100%",
        "margin-top": "10px",
        padding: "6px 0",
        background: "var(--blue)",
        color: "var(--dk)",
        border: "none",
        "border-radius": "6px",
        "font-size": "11.5px",
        "font-weight": "600",
        cursor: "pointer",
        "letter-spacing": ".3px",
        opacity: ".9"
      }, [
        rule("&:hover", { opacity: "1" })
      ]),
      rule(".bs-item", {
        border: "1px solid var(--brd)",
        "border-radius": "6px",
        "margin-bottom": "6px",
        background: "rgba(0,0,0,.12)",
        overflow: "hidden"
      }),
      rule(".bs-head", {
        display: "flex",
        "align-items": "center",
        gap: "8px",
        padding: "7px 9px",
        cursor: "pointer",
        "border-radius": "5px",
        transition: "background .1s"
      }, [
        rule("&:hover", { background: "rgba(255,255,255,.07)" })
      ]),
      rule(".bs-dot", {
        width: "10px",
        height: "10px",
        "border-radius": "50%",
        "flex-shrink": "0"
      }),
      rule(".bs-name", {
        flex: "1",
        "font-size": "12px",
        "font-weight": "500"
      }),
      rule(".bs-actions", {
        display: "flex",
        gap: "3px"
      }),
      rule(".bs-act", {
        background: "none",
        border: "none",
        color: "var(--t2)",
        cursor: "pointer",
        "font-size": "11px",
        padding: "1px 4px",
        "border-radius": "3px"
      }, [
        rule("&:hover", {
          background: "rgba(255,255,255,.1)",
          color: "var(--t1)"
        })
      ]),
      rule(".bs-edit-form", {
        display: "none",
        padding: "6px 8px 8px",
        background: "rgba(0,0,0,.18)",
        "border-top": "1px solid var(--brd)"
      }),
      rule(".bs-edit-form.open", { display: "block" }),
      rule(".bs-params", {
        display: "none",
        padding: "6px 8px 8px",
        "border-top": "1px solid var(--brd)"
      }),
      rule(".bs-params.open", { display: "block" }),
      rule(".bs-chev", {
        appearance: "none",
        border: "0",
        background: "transparent",
        color: "var(--t2)",
        cursor: "pointer",
        font: "inherit",
        padding: "0 2px",
        "line-height": "1"
      }, [
        rule("&:hover", { color: "var(--t1)" })
      ]),
      rule(".bs-ef-row", {
        display: "flex",
        "align-items": "center",
        gap: "6px",
        "margin-bottom": "5px"
      }),
      rule(".bs-ef-row label", {
        "font-size": "10px",
        color: "var(--t2)",
        width: "40px",
        "flex-shrink": "0"
      }),
      rule(".bs-ef-row input[type=text]", {
        flex: "1",
        background: "var(--dk)",
        color: "var(--t1)",
        border: "1px solid var(--brd)",
        "border-radius": "3px",
        padding: "3px 6px",
        "font-size": "11px"
      }),
      rule(".bs-ef-row input[type=color]", {
        width: "32px",
        height: "22px",
        border: "none",
        background: "none",
        cursor: "pointer",
        padding: "0",
        "border-radius": "3px"
      }),
      rule(".bs-ef-save", {
        background: "var(--blue)",
        color: "var(--dk)",
        border: "none",
        "border-radius": "3px",
        padding: "3px 10px",
        "font-size": "10px",
        cursor: "pointer",
        "font-weight": "600"
      }),
      rule(".edit-group", {
        background: "rgba(0,0,0,.2)",
        "border-radius": "5px",
        padding: "8px 9px",
        "margin-bottom": "7px"
      }),
      rule(".edit-group-title", {
        "font-size": "9px",
        "font-weight": "700",
        "text-transform": "uppercase",
        "letter-spacing": ".07em",
        color: "var(--t2)",
        "margin-bottom": "6px"
      }),
      rule(".efield-row", {
        display: "flex",
        "align-items": "center",
        gap: "6px",
        "margin-bottom": "4px"
      }),
      rule(".efield-row label", {
        "font-size": "10px",
        color: "var(--t2)",
        flex: "1"
      }),
      rule(".efield-row input[type=text]", {
        flex: "2",
        background: "var(--dk)",
        color: "var(--t1)",
        border: "1px solid var(--brd)",
        "border-radius": "3px",
        padding: "2px 5px",
        "font-size": "11px"
      }),
      rule(".efield-row input[type=number]", {
        width: "52px",
        background: "var(--dk)",
        color: "var(--t1)",
        border: "1px solid var(--brd)",
        "border-radius": "3px",
        padding: "2px 5px",
        "font-size": "11px",
        "text-align": "right"
      }),
      rule(".efield-row input[type=color]", {
        width: "30px",
        height: "20px",
        border: "none",
        background: "none",
        cursor: "pointer",
        padding: "0"
      }),
      rule(".annot-list", { "margin-top": "4px" }),
      rule(".annot-row", {
        display: "flex",
        "align-items": "center",
        gap: "4px",
        "margin-bottom": "3px",
        background: "rgba(255,255,255,.04)",
        "border-radius": "3px",
        padding: "3px 5px"
      }),
      rule(".annot-row input[type=text]", {
        flex: "1",
        background: "var(--dk)",
        color: "var(--t1)",
        border: "1px solid var(--brd)",
        "border-radius": "3px",
        padding: "2px 4px",
        "font-size": "10.5px"
      }),
      rule(".annot-row input[type=number]", {
        width: "46px",
        background: "var(--dk)",
        color: "var(--t1)",
        border: "1px solid var(--brd)",
        "border-radius": "3px",
        padding: "2px 4px",
        "font-size": "10.5px",
        "text-align": "right"
      }),
      rule(".annot-del", {
        background: "none",
        border: "none",
        color: "var(--t2)",
        cursor: "pointer",
        padding: "1px 3px",
        "border-radius": "2px",
        "font-size": "10px"
      }, [
        rule("&:hover", {
          background: "rgba(220,38,38,.2)",
          color: "#f87171"
        })
      ]),
      rule(".add-annot-btn", {
        width: "100%",
        padding: "5px",
        background: "rgba(140,196,212,.1)",
        border: "1px dashed rgba(140,196,212,.35)",
        "border-radius": "4px",
        color: "var(--blue)",
        "font-size": "11px",
        cursor: "pointer",
        "font-weight": "500",
        "margin-top": "4px",
        transition: "all .15s"
      }, [
        rule("&:hover", { background: "rgba(140,196,212,.2)" })
      ]),
      rule("body.edit-mode #chart-svg", { cursor: "crosshair" }),
      rule("body.edit-mode #chart-svg [data-editable]", { cursor: "pointer" }),
      rule("body.edit-mode #chart-svg [data-editable]:hover", { opacity: ".75" }),
      rule(".edit-selected", { outline: "2px dashed var(--blue)" }),
      rule(".free-tog", {
        display: "inline-flex",
        "align-items": "center",
        gap: "3px",
        cursor: "pointer",
        "flex-shrink": "0"
      }),
      rule(".tog-track", {
        width: "24px",
        height: "13px",
        background: "var(--brd)",
        "border-radius": "7px",
        position: "relative",
        transition: "background .15s",
        "flex-shrink": "0"
      }),
      rule(".tog-track.on", { background: "var(--blue)" }),
      rule(".tog-knob", {
        width: "9px",
        height: "9px",
        background: "#fff",
        "border-radius": "50%",
        position: "absolute",
        top: "2px",
        left: "2px",
        transition: "left .15s"
      }),
      rule(".tog-track.on .tog-knob", { left: "13px" }),
      rule(".tog-lbl", {
        "font-size": "9px",
        color: "var(--t2)"
      }),
      rule(".dist-box", {
        background: "rgba(0,0,0,.25)",
        "border-radius": "4px",
        padding: "5px 7px",
        "margin-top": "3px",
        display: "none"
      }),
      rule(".dist-box.open", { display: "block" }),
      rule(".dist-sel", {
        width: "100%",
        background: "var(--dk)",
        color: "var(--t1)",
        border: "1px solid var(--brd)",
        "border-radius": "3px",
        padding: "3px 5px",
        "font-size": "11px",
        "margin-bottom": "4px"
      }),
      rule(".dist-inputs", {
        display: "flex",
        gap: "5px",
        "flex-wrap": "wrap"
      }),
      rule(".dig", {
        display: "flex",
        "flex-direction": "column",
        gap: "2px",
        flex: "1",
        "min-width": "58px"
      }),
      rule(".dig label", {
        "font-size": "9px",
        color: "var(--t2)"
      }),
      rule(".dig input", {
        background: "var(--dk)",
        color: "var(--t1)",
        border: "1px solid var(--brd)",
        "border-radius": "3px",
        padding: "2px 5px",
        "font-size": "11px",
        width: "100%"
      }),
      rule(".toggle-chk-row", {
        display: "inline-flex",
        "align-items": "center",
        gap: "6px",
        cursor: "pointer"
      }),
      rule(".goodman-simulation-empty", {
        "font-size": "11px",
        color: "var(--t2)",
        padding: "4px 0",
        margin: "0"
      }),
      rule(".sim-row", {
        display: "flex",
        "align-items": "center",
        gap: "7px",
        padding: "5px 7px",
        "border-radius": "5px",
        cursor: "pointer",
        "margin-bottom": "2px",
        transition: "background .1s"
      }, [
        rule("&:hover", { background: "rgba(255,255,255,.05)" }),
        rule("&.on", { background: "rgba(140,196,212,.15)" })
      ]),
      rule(".sim-dot", {
        width: "8px",
        height: "8px",
        "border-radius": "50%",
        "flex-shrink": "0"
      }),
      rule(".sim-name", {
        flex: "1",
        "font-size": "12px",
        color: "var(--t1)",
        "white-space": "nowrap",
        overflow: "hidden",
        "text-overflow": "ellipsis"
      }),
      rule(".sim-badge", {
        "font-size": "9px",
        padding: "1px 5px",
        "border-radius": "3px",
        "font-weight": "600",
        "flex-shrink": "0"
      }),
      rule(".sim-badge.idle", {
        background: "rgba(255,255,255,.1)",
        color: "var(--t2)"
      }),
      rule(".sim-badge.running", {
        background: "rgba(140,196,212,.3)",
        color: "#6CBDCF"
      }),
      rule(".sim-badge.done", {
        background: "rgba(22,163,74,.2)",
        color: "#86efac"
      }),
      rule(".sim-badge.stale", {
        background: "rgba(236,116,36,.2)",
        color: "#FDBA74"
      }),
      rule(".sim-badge.stopped", {
        background: "rgba(220,38,38,.15)",
        color: "#fca5a5"
      }),
      rule(".add-sim-btn", {
        width: "100%",
        padding: "6px",
        background: "rgba(140,196,212,.12)",
        border: "1px dashed rgba(140,196,212,.4)",
        "border-radius": "5px",
        color: "var(--blue)",
        "font-size": "11.5px",
        cursor: "pointer",
        "font-weight": "500",
        transition: "all .15s",
        "margin-top": "4px"
      }, [
        rule("&:hover", { background: "rgba(140,196,212,.22)" })
      ])
    ]),

    group("mill charge", [
      rule("#mill-canvas-wrap", {
        flex: "1",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        padding: "16px",
        "min-width": "0"
      }),
      rule("#mill-canvas", {
        width: "100%",
        height: "100%",
        display: "block",
        border: "0",
        "border-radius": "10px"
      }),
      rule("#mill-metrics", {
        width: "190px",
        "min-width": "190px",
        background: "var(--mid)",
        "border-left": "1px solid var(--brd)",
        display: "flex",
        "flex-direction": "column",
        overflow: "hidden"
      }),
      rule("#mill-metrics-hdr", {
        padding: "10px 12px",
        "border-bottom": "1px solid var(--brd)",
        "font-size": "9.5px",
        "font-weight": "700",
        "text-transform": "uppercase",
        "letter-spacing": ".08em",
        color: "var(--t2)"
      }),
      rule("#mill-metrics-panel", { padding: "10px 12px" }),
      rule(".prow", {
        margin: "8px 0",
        display: "flex",
        "flex-direction": "column",
        gap: "4px"
      }),
      rule(".prow-top", {
        display: "flex",
        "justify-content": "space-between",
        "align-items": "center"
      }),
      rule(".plabel", {
        "font-size": "11px",
        color: "var(--t2)"
      }),
      rule(".pval", {
        "font-size": "11px",
        color: "var(--blue)",
        "font-weight": "600"
      }),
      rule("input[type=range], .mill-slider", {
        width: "100%",
        "accent-color": "var(--blue)",
        height: "3px",
        cursor: "pointer"
      }),
      rule(".mill-preset-btn", {
        display: "block",
        width: "100%",
        "text-align": "left",
        padding: "6px 8px",
        "margin-bottom": "4px",
        background: "rgba(0,0,0,.18)",
        border: "1px solid var(--brd)",
        "border-radius": "5px",
        color: "var(--t1)",
        "font-size": "11.5px",
        cursor: "pointer",
        transition: "background .1s, border-color .1s"
      }, [
        rule("&:hover", {
          background: "rgba(140,196,212,.12)",
          "border-color": "rgba(140,196,212,.35)"
        })
      ]),
      rule(".mill-metric-row", {
        display: "flex",
        "justify-content": "space-between",
        "align-items": "center",
        "margin-bottom": "9px"
      }),
      rule(".mill-metric-lbl", {
        "font-size": "11px",
        color: "var(--t2)"
      }),
      rule(".mill-metric-val", {
        "font-size": "12px",
        "font-weight": "600",
        color: "var(--blue)",
        "font-variant-numeric": "tabular-nums"
      }),
      rule(".mill-regime-badge", {
        "margin-top": "10px",
        padding: "6px 10px",
        "border-radius": "6px",
        "font-size": "11px",
        "font-weight": "700",
        "letter-spacing": ".06em",
        "text-align": "center"
      }),
      rule(".metric-group", {
        background: "rgba(0,0,0,.2)",
        "border-radius": "5px",
        padding: "8px 10px",
        "margin-bottom": "8px"
      })
    ]),

    group("mill force", [
      rule("#mill-force-chart-tabs", {
        display: "flex",
        gap: "0",
        padding: "8px 12px",
        "border-bottom": "1px solid var(--brd)",
        background: "var(--mid)",
        "flex-shrink": "0"
      }),
      rule(".mill-force-mode-pills", {
        display: "flex",
        gap: "6px",
        padding: "6px 0"
      }),
      rule(".mill-force-pill", {
        background: "var(--dk)",
        border: "1px solid var(--brd)",
        color: "var(--t2)",
        padding: "4px 12px",
        "border-radius": "3px",
        cursor: "pointer",
        "font-size": "11px",
        transition: "all 0.15s"
      }, [
        rule("&:hover", {
          background: "rgba(140,196,212,.08)",
          "border-color": "var(--brd)"
        }),
        rule("&.active", {
          background: "rgba(140,196,212,.12)",
          color: "var(--blue)",
          "border-color": "rgba(140,196,212,.35)"
        })
      ]),
      rule(".mill-force-model-radios", {
        display: "flex",
        gap: "12px",
        padding: "4px 0"
      }),
      rule(".mill-force-model-option", {
        display: "flex",
        "align-items": "center",
        gap: "5px",
        cursor: "pointer",
        "font-size": "11px"
      }),
      rule(".mill-force-model-grounded-text", { color: "var(--blue)" }),
      rule(".mill-force-model-faithful-text", { color: "var(--ylw)" }),
      rule(".mill-force-mc-toggle", {
        cursor: "pointer",
        display: "flex",
        "justify-content": "space-between",
        "align-items": "center"
      }),
      rule(".mill-force-cht-tab", {
        background: "none",
        border: "1px solid transparent",
        color: "var(--t2)",
        padding: "5px 12px",
        "border-radius": "3px",
        cursor: "pointer",
        "font-size": "11px",
        transition: "all 0.15s"
      }, [
        rule("&:hover", { color: "var(--t1)" }),
        rule("&.active", {
          background: "rgba(140,196,212,.12)",
          color: "var(--blue)",
          "border-color": "rgba(140,196,212,.35)"
        })
      ]),
      rule("#mill-force-chart-wrap", {
        flex: "1",
        overflow: "hidden",
        position: "relative",
        background: "var(--dk)"
      }),
      rule("#mill-force-svg-cross, #mill-force-svg-force, #mill-force-svg-rose", {
        width: "100%",
        height: "100%"
      }),
      rule(".mill-force-result-row", {
        display: "flex",
        "justify-content": "space-between",
        padding: "5px 0",
        "font-size": "11px",
        gap: "8px"
      }),
      rule(".mill-force-rl", { color: "var(--t2)" }),
      rule(".mill-force-rv", {
        color: "var(--t1)",
        "font-weight": "600",
        "margin-left": "auto"
      }),
      rule(".mill-force-rd", {
        color: "var(--ylw)",
        "font-size": "10px"
      })
    ]),

    media("(max-width: 980px)", [
      rule(".auth-book, #view-home, #body, #mill-body, #mill-force-body", {
        "flex-direction": "column"
      }),
      rule(".auth-left, .auth-right", {
        flex: "none"
      }),
      rule("#news-panel, #sb, #mill-sb, #mill-force-sb, #mill-metrics", {
        width: "auto",
        "min-width": "0"
      }),
      rule("#module-grid", {
        "grid-template-columns": "1fr"
      })
    ])
  ]
});

export const ENGENTUS_CHART_THEME_STYLESHEET = createWcssStylesheet({
  name: "Engentus chart page theme grammar",
  blocks: [
    group("chart tokens", [
      rule(":root", CHART_TOKENS)
    ]),
    group("chart foundation", [
      rule("html, body", {
        margin: "0",
        height: "100%",
        overflow: "hidden"
      }),
      rule("body.chart-page", {
        "font-family": "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
        background: "#fff",
        color: "var(--t3)"
      }),
      rule(".chart-page__viewport, .chart-page__host", {
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden"
      }),
      rule(".chart-page__mount", { display: "block" }),
      rule(".chart-page__overlay-canvas", { display: "block" }),
      rule(".chart-page__tooltip", { opacity: "0" })
    ]),
    group("chart surfaces", [
      rule("#chart-svg, #mc-canvas", {
        position: "absolute",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
        display: "block"
      }),
      rule("#mc-canvas", {
        "pointer-events": "none"
      }),
      rule("#chart-tip", {
        position: "absolute",
        "pointer-events": "none",
        background: "rgba(15,23,42,.9)",
        color: "var(--t1)",
        padding: "6px 10px",
        "border-radius": "6px",
        "font-size": "11px",
        opacity: "0",
        transition: "opacity .1s",
        "line-height": "1.7",
        "z-index": "20",
        "white-space": "nowrap"
      }),
      rule("#mill-canvas", {
        width: "100%",
        height: "100%",
        display: "block",
        "border-radius": "10px"
      }),
      rule("#mill-force-svg-cross, #mill-force-svg-force, #mill-force-svg-rose", {
        width: "100%",
        height: "100%"
      }),
      rule("#mill-force-mc-canvas", {
        position: "absolute",
        top: "0",
        left: "0"
      }),
      rule("#mill-force-tip", {
        position: "absolute",
        "pointer-events": "none",
        background: "rgba(29,39,83,.95)",
        color: "#f1f5f9",
        padding: "8px 12px",
        "border-radius": "5px",
        "font-size": "10.5px",
        "z-index": "100",
        display: "none",
        border: "1px solid var(--brd)",
        "box-shadow": "0 4px 12px rgba(0,0,0,.4)"
      }),
      rule(".chart-page--mill-charge .chart-page__host, .chart-page--mill-force .chart-page__host, .chart-page--goodman .chart-page__host", {
        background: "#fff"
      }),
      rule("svg.gog", {
        width: "100%",
        height: "100%",
        display: "block"
      })
    ])
  ]
});
