import { fileURLToPath } from 'node:url';

/**
 * The marketing site is a static export: `next build` writes plain HTML, CSS
 * and JS to `out/`, and there is no server to run or secure (site brief, "What
 * it is built with"). Anything that needs a server (the image optimizer,
 * rewrites, headers, route handlers that read the request) is unavailable by
 * design, which is why the shots are plain `<img>` tags over files already
 * sized and encoded in `public/shots/`.
 *
 * `trailingSlash` emits `privacy/index.html` rather than `privacy.html`, so the
 * export serves from any static host, or `npx serve out`, without rewrites.
 *
 * `turbopack.root` pins the workspace root. Next infers it from the nearest
 * lockfile otherwise, and a worktree under `.claude/worktrees/` sits
 * inside the main checkout, whose own lockfile would win.
 *
 * `transpilePackages` lets the site import `@verso/tokens` itself (its
 * TypeScript source, not only its CSS): the phone's screen reads the tokens'
 * light palette from it. And `@verso/core`, for `scoreColor`, so a score
 * badge in a mocked screen is filled exactly as the app fills it.
 *
 * `agentRules: false` stops `next dev` from writing an AGENTS.md into the
 * package when it sees a coding agent. The version-matched docs it points at
 * are in `node_modules/next/dist/docs/` either way (DESIGN.md says so).
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  agentRules: false,
  transpilePackages: ['@verso/core', '@verso/tokens'],
  turbopack: {
    root: fileURLToPath(new URL('../..', import.meta.url)),
  },
};

export default nextConfig;
