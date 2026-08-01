# Changelog

All notable changes to this project. Format follows [Keep a Changelog](https://keepachangelog.com/).
Phases and their acceptance gates are defined in `PLAN.md` §16.

## [Unreleased]

### Milestone 1 — Playable Core

#### Phase 1.0 — Foundations
- Repository scaffold, Node pinned via `.nvmrc`, docs and legal skeleton.
- TypeScript `strict` + `noUncheckedIndexedAccess`; Vite with two entry points (game, landing).
- ESLint boundary rules enforcing the sim boundary and the platform input boundary.
- Vitest + verify script; GitHub Actions CI; Netlify deploy config.
- Design tokens (`content/design/tokens.json`) and the phone-first style guide.
