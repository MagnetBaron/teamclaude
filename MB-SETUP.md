# Magnet Baron — this fork

This is **MagnetBaron/teamclaude**, a write-enabled fork of [KarpelesLab/teamclaude](https://github.com/KarpelesLab/teamclaude).

Use it so GitHub Desktop, Claude Code, Codex, and Cursor can clone one org URL instead of the upstream.

The npm package `@karpeleslab/teamclaude` remains the runtime (it self-updates). This clone is the org source plus the Magnet Baron overlay in `mb/`.

## Pair with orchestration policy

Seat table, AGENTS.md, CLAUDE.md: **https://github.com/MagnetBaron/mb-orchestration**

1. Clone both repos (`git clone` or GitHub Desktop → MagnetBaron org).
2. Open `mb-orchestration` as the workspace so `AGENTS.md` / `CLAUDE.md` load.
3. `npm install -g @karpeleslab/teamclaude`
4. `./mb/install-local.sh` from this clone (plan-sync agent + `mb-teamclaude-login`).
5. `teamclaude import` for the seat already logged into Claude Code, then `mb-teamclaude-login` once per additional seat.
6. `teamclaude service install` then `teamclaude alias --install`.
7. `teamclaude run -- --model opus-4.8`

Do **not** exclusive-pin Fable to named aliases. `mb/sync-plan.mjs` blocks `*fable*` when no seat can serve it and unblocks it if a seat gains that bucket again. Do **not** run four Claude desktop apps.

Upstream README below this file is the full TeamClaude manual.
