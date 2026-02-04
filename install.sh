#!/bin/bash
# Mac Fleet Agent - One-line install (curl -fsSL URL | sudo bash)
# Set API_BASE_URL, REDIS_URL, REDIS_TOKEN (and optionally AGENT_JS_URL) before piping.

set -e

INSTALL_DIR="/usr/local/mac-fleet-agent"
CONFIG_DIR="/etc/mac-fleet-agent"
LOG_FILE="/var/log/mac-fleet-agent.log"
PLIST_LABEL="com.company.mac-agent"
PLIST_PATH="/Library/LaunchDaemons/${PLIST_LABEL}.plist"

# Agent binary URL (override with AGENT_JS_URL when curling)
AGENT_JS_URL="${AGENT_JS_URL:-https://raw.githubusercontent.com/batmunkh0612/mac-fleet-agent/main/dist/agent.js}"

if [ "$EUID" -ne 0 ]; then
  echo "Run with: curl -fsSL <url>/install.sh | sudo bash"
  echo "Set fleet server and Redis: sudo API_BASE_URL=... REDIS_URL=... REDIS_TOKEN=... bash -s" 
  exit 1
fi

SERIAL=$(ioreg -l | grep IOPlatformSerialNumber | awk -F'"' '{print $4}')
HOSTNAME=$(hostname -s)
echo "=== Mac Fleet Agent ==="
echo "Serial: $SERIAL  Hostname: $HOSTNAME"

if [ -z "$API_BASE_URL" ] || [ -z "$REDIS_URL" ] || [ -z "$REDIS_TOKEN" ]; then
  echo "Error: Set API_BASE_URL, REDIS_URL, REDIS_TOKEN (e.g. sudo API_BASE_URL=... REDIS_URL=... REDIS_TOKEN=... bash -s)"
  exit 1
fi

if ! command -v node &>/dev/null; then
  echo "Installing Node.js via Homebrew..."
  if ! command -v brew &>/dev/null; then
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    [ -f /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
  fi
  brew install node
fi
NODE_PATH=$(which node)

if launchctl list 2>/dev/null | grep -q "$PLIST_LABEL"; then
  echo "Stopping existing agent..."
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
fi

echo "Creating directories..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$CONFIG_DIR"

echo "Downloading agent..."
if ! curl -fsSL "$AGENT_JS_URL" -o "$INSTALL_DIR/agent.js"; then
  echo "Error: Failed to download agent from $AGENT_JS_URL"
  exit 1
fi
chmod 755 "$INSTALL_DIR/agent.js"

echo "Creating config..."
cat > "$CONFIG_DIR/config.json" << EOF
{
  "apiBaseUrl": "$API_BASE_URL",
  "redisUrl": "$REDIS_URL",
  "redisToken": "$REDIS_TOKEN",
  "pollIntervalMs": 5000
}
EOF
chmod 644 "$CONFIG_DIR/config.json"

echo "Installing LaunchDaemon..."
tee "$PLIST_PATH" >/dev/null << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${NODE_PATH}</string>
        <string>${INSTALL_DIR}/agent.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
        <key>Crashed</key>
        <true/>
    </dict>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>StandardOutPath</key>
    <string>${LOG_FILE}</string>
    <key>StandardErrorPath</key>
    <string>/var/log/mac-fleet-agent.error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>MAC_AGENT_CONFIG</key>
        <string>${CONFIG_DIR}/config.json</string>
    </dict>
</dict>
</plist>
EOF
chmod 644 "$PLIST_PATH"

echo "Registering device..."
REGISTER_RESULT=$(curl -s -X POST "$API_BASE_URL/api/graphql" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"mutation { registerFleetDevice(input: { serial: \\\"$SERIAL\\\", hostname: \\\"$HOSTNAME\\\" }) { serial enrolledAt } }\"}" 2>/dev/null || echo '{"errors":[]}')
if echo "$REGISTER_RESULT" | grep -q '"enrolledAt"'; then
  echo "Device registered."
else
  echo "Registration note: $REGISTER_RESULT"
fi

echo "Starting agent..."
launchctl load "$PLIST_PATH"
sleep 2
if launchctl list | grep -q "$PLIST_LABEL"; then
  echo "Agent started."
else
  echo "Check logs: tail -f $LOG_FILE"
fi
echo "Done. Config: $CONFIG_DIR/config.json  Logs: $LOG_FILE"
