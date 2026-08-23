# Magnet Baron overlay

Lives in this fork only. Upstream TeamClaude is unchanged.

## Why this exists

`teamclaude.routes.example.json` used exclusive account aliases (`max`, `premium-1`). After `teamclaude login` the stored name is the email, so those routes never match. After a plan downgrade they also pin Fable to seats that can no longer serve it, which hangs Claude Code (upstream issue #116).

This overlay does not exclusive-pin models. TeamClaude already skips a seat for a model family when that seat has no quota for it. The overlay only blocks `*fable*` when **no** logged-in seat reports a Fable weekly bucket, and unblocks it if a seat gains that bucket again.

## On this machine

```bash
npm install -g @karpeleslab/teamclaude   # auto-updates; do not npm-link this clone
./mb/install-local.sh                    # LaunchAgent + PATH wrappers
teamclaude import                        # current Claude Code seat (macOS Keychain)
mb-teamclaude-login                      # once per additional seat (browser)
teamclaude service install               # proxy at login, KeepAlive
teamclaude alias --install               # interactive `claude` goes through the proxy
```

`mb-teamclaude-sync-plan` runs at login and every 6 hours. It also runs after each `mb-teamclaude-login`.

Do not run four Claude desktop apps. CLI + this proxy after the first device-auth.

## Upstream

`mb-teamclaude-sync-plan` fast-forwards this clone from `origin` then merges `KarpelesLab/teamclaude` `master`. Conflicts abort the merge and leave the clone as-is. The runtime CLI still self-updates from npm independently of this clone.
