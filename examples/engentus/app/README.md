# Engentus in DESIRE

This app is the Engentus frontend expressed in DESIRE-owned authored forms.

The canonical architecture, status, and proof obligations live in
[`docs/DESIRE-SPA.md`](../../../docs/DESIRE-SPA.md). This README is intentionally
secondary.

App ownership stays here:

- shell root/process in `shell.rvm`
- auth/shared/module shell surfaces in `shell-*.rvm`
- authored models/views under `models/` and `views/`
- app-owned shell/chart CSS
- app-owned assets and chart-function helpers

Reusable runtime ownership stays outside the app:

- core shell projection in `src/runtime-surface-shell.js`
- chart capability in `plugins/chart-runtime/`
