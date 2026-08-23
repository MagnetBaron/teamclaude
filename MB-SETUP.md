# Magnet Baron — this fork

This is **MagnetBaron/teamclaude**, a write-enabled fork of [KarpelesLab/teamclaude](https://github.com/KarpelesLab/teamclaude).

Use it so GitHub Desktop, Claude Code, Codex, and Cursor can clone one org URL instead of the upstream.

## Pair with orchestration policy

Seat table, AGENTS.md, CLAUDE.md, and route example:

**https://github.com/MagnetBaron/mb-orchestration**

1. Clone both repos (GitHub Desktop → MagnetBaron org, or `git clone`).
2. Open `mb-orchestration` as the workspace so `AGENTS.md` / `CLAUDE.md` load.
3. Install this proxy: `npm install -g @karpeleslab/teamclaude` (or run from this clone).
4. `teamclaude login` once per seat (personal Max, team premium ×2, team standard).
5. Merge `mb-orchestration/teamclaude.routes.example.json` into `~/.config/teamclaude.json`.
6. `teamclaude server` then `teamclaude run -- --model opus-4.8`.

Do **not** run four Claude desktop apps. CLI + this proxy only after first device-auth.

Upstream README below this file is the full TeamClaude manual.
