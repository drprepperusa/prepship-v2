# `apps/react`

This app is the incremental React migration target for PrepShip V2.

It is not the canonical frontend yet, and it is not a redesign track. The behavioral and visual reference remains:

- V1 `../prepship/prepship/public/index.html`
- V1 `../prepship/prepship/public/js/*`
- the copied parity frontend in `apps/web`

## Current Intent

- migrate feature-by-feature behind V2 API/contracts
- preserve V1 information architecture and operator workflow
- avoid inventing replacement layouts while parity work is still in progress

## Current Status

- the React app boots and builds with `npm --prefix apps/react run build`
- the Order Panel is being migrated with parity-first behavior
- other views still contain mixed migration quality and should be treated as in-progress unless explicitly verified against V1

## Commands

```bash
npm run dev:react
npm --prefix apps/react run build
```

The local static preview/proxy server is:

```bash
node apps/react/server.js
```

Default ports:

- React dev server: Vite default unless overridden
- React static/proxy server: `4012`
- API server: `4010`

## Working Rules

- compare UI changes against V1 before treating them as finished
- prefer reusing existing CSS tokens and class structure over introducing a new visual language
- if a React feature diverges from `apps/web`, assume the React version is wrong until proven otherwise
- when React behavior is incomplete, document the gap instead of masking it with substitute UX
