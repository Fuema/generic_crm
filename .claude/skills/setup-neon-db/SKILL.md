---
name: setup-neon-db
description: Link an app to a Neon project and provision Postgres (and other Neon services) with the neon CLI. Use when the user asks to set up Neon, connect a Neon database, or run neon init/deploy in a new project.
---

Set up this app on Neon.
1. `npm i -g neon@latest`. If that fails, use `npx neon@latest` in place of `neon`.
   If a neon command opens a browser sign-in, tell me to finish it there. If that times out or fails, ask me to run `neon login`, then retry.
2. Ask me for the Neon org ID, the project ID and the branch (or whether to create a new project). Then, in the project root:
   neon init -y --org-id <org-id> --project-id <project-id> --branch <branch> --services postgres
   Add other services to `--services` only if I ask for them.
3. `neon deploy`. It provisions the services in neon.ts and pulls their env vars into `.env.local` (or `.env` if it exists). Never print their values.
4. Wire each service into the app's code using those env vars. Consult the installed Neon agent skills for best practices, e.g., what database driver to use given the app architecture and hosting runtime (HTTP driver for Workers/edge).
5. Prove it works: the project's build script must pass (use its package manager), then start the app and test each wired service end to end.
6. Report what changed, the command output that proves step 5, and anything that failed.
