# ManagerCareerWeb

Static Manager Career Mode site deployed with Cloudflare Workers Assets.

## Cloudflare

This repository is configured so the Cloudflare **Workers Builds** deploy command can simply be:

```bash
npm run deploy
```

No build command is required.

The `wrangler.toml` deploys the repository root as static assets.

> If the existing Cloudflare application is a **Pages** project, it must be converted/recreated as a **Workers** application for `npx wrangler deploy` to be the correct deployment method. A repository file cannot change an existing Pages project's dashboard deploy type.
