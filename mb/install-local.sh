#!/bin/zsh
# Install Magnet Baron overlay on this Mac: plan-sync LaunchAgent + PATH wrapper.
# Does not start four Claude GUI apps. Does not print tokens.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="/opt/homebrew/bin/node"
[[ -x "$NODE" ]] || NODE="$(command -v node)"
WRAPPER="$HOME/.local/bin/mb-teamclaude-sync-plan"
LOGIN_WRAPPER="$HOME/.local/bin/mb-teamclaude-login"
AGENT_DIR="$HOME/Library/LaunchAgents"
LABEL="com.magnetbaron.teamclaude-plan-sync"
PLIST="$AGENT_DIR/${LABEL}.plist"
LOG="$HOME/Library/Logs/mb-teamclaude-plan-sync.log"

mkdir -p "$HOME/.local/bin" "$AGENT_DIR" "$HOME/Library/Logs"

cat > "$WRAPPER" <<EOF
#!/bin/zsh
exec "$NODE" "$REPO_ROOT/mb/sync-plan.mjs" "\$@"
EOF
chmod 755 "$WRAPPER"

cat > "$LOGIN_WRAPPER" <<EOF
#!/bin/zsh
set -euo pipefail
export TEAMCLAUDE_LOGIN_TIMEOUT_MS="\${TEAMCLAUDE_LOGIN_TIMEOUT_MS:-900000}"
"$NODE" "$REPO_ROOT/src/index.js" login --oauth
"$WRAPPER"
if command -v teamclaude >/dev/null 2>&1; then
  teamclaude accounts
else
  "$NODE" "$REPO_ROOT/src/index.js" accounts
fi
EOF
chmod 755 "$LOGIN_WRAPPER"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE}</string>
    <string>${REPO_ROOT}/mb/sync-plan.mjs</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>21600</integer>
  <key>StandardOutPath</key>
  <string>${LOG}</string>
  <key>StandardErrorPath</key>
  <string>${LOG}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
EOF

uid="$(id -u)"
launchctl bootout "gui/${uid}/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/${uid}" "$PLIST"
launchctl kickstart -k "gui/${uid}/${LABEL}"

print "Installed:"
print "  wrapper  $WRAPPER"
print "  login    $LOGIN_WRAPPER"
print "  agent    $PLIST  (every 6h + at login)"
print "  log      $LOG"
print "Next: mb-teamclaude-login   # browser OAuth for one more seat"
