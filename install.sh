#!/bin/bash
# Mac Fleet Agent Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/batmunkh0612/mac-fleet-agent/main/install.sh | sudo bash

set -e

# Configuration
API_BASE_URL="https://a33c262c-enrollment-service-v2-test.shagai.workers.dev"
REDIS_URL="https://intense-elephant-31650.upstash.io"
REDIS_TOKEN="AXuiAAIncDIxOWI4YjU1ZWZlMzM0NGJiOWY2OTg3NDM4OTkyMDkyNHAyMzE2NTA"
GITHUB_RAW="https://raw.githubusercontent.com/batmunkh0612/mac-fleet-agent/main"

INSTALL_DIR="/usr/local/mac-fleet-agent"
CONFIG_DIR="/etc/mac-fleet-agent"
PLIST_PATH="/Library/LaunchDaemons/com.company.mac-fleet-agent.plist"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           Mac Fleet Agent Installer                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check root
if [ "$EUID" -ne 0 ]; then
    echo "Error: Please run with sudo"
    exit 1
fi

# Get system info
SERIAL=$(ioreg -l | grep IOPlatformSerialNumber | awk -F'"' '{print $4}')
HOSTNAME_SHORT=$(hostname -s)
echo "Serial: $SERIAL"
echo "Hostname: $HOSTNAME_SHORT"

# Find Node.js
NODE_PATH=""
for p in /usr/local/bin/node /opt/homebrew/bin/node /usr/bin/node; do
    if [ -x "$p" ]; then
        NODE_PATH="$p"
        break
    fi
done

if [ -z "$NODE_PATH" ]; then
    echo ""
    echo "Node.js not found. Installing via Homebrew..."
    
    # Find brew
    BREW_PATH=""
    for p in /usr/local/bin/brew /opt/homebrew/bin/brew; do
        [ -x "$p" ] && BREW_PATH="$p" && break
    done
    
    if [ -z "$BREW_PATH" ]; then
        echo "Error: Homebrew not found. Please install Node.js manually."
        exit 1
    fi
    
    # Install node as the original user (not root)
    ORIG_USER=$(stat -f "%Su" /dev/console)
    sudo -u "$ORIG_USER" "$BREW_PATH" install node
    
    # Find node again
    for p in /usr/local/bin/node /opt/homebrew/bin/node; do
        [ -x "$p" ] && NODE_PATH="$p" && break
    done
fi

echo "Node.js: $NODE_PATH"
echo ""

# Stop existing agent
echo "Stopping existing agent..."
launchctl unload "$PLIST_PATH" 2>/dev/null || true

# Create directories
echo "Creating directories..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$CONFIG_DIR"

# Download agent
echo "Downloading agent..."
curl -fsSL "$GITHUB_RAW/agent.js" -o "$INSTALL_DIR/agent.js"

# Create config
echo "Creating config..."
cat > "$CONFIG_DIR/config.json" << EOF
{
  "apiBaseUrl": "$API_BASE_URL",
  "redisUrl": "$REDIS_URL",
  "redisToken": "$REDIS_TOKEN",
  "pollIntervalMs": 5000
}
EOF

# Create LaunchDaemon
echo "Creating LaunchDaemon..."
cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.company.mac-fleet-agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_PATH</string>
        <string>$INSTALL_DIR/agent.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/var/log/mac-fleet-agent.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/mac-fleet-agent.error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>MAC_AGENT_CONFIG</key>
        <string>$CONFIG_DIR/config.json</string>
    </dict>
</dict>
</plist>
EOF

chmod 644 "$PLIST_PATH"

# Register device
echo "Registering device..."
curl -s -X POST "$API_BASE_URL/api/graphql" \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"mutation { registerFleetDevice(input: { serial: \\\"$SERIAL\\\", hostname: \\\"$HOSTNAME_SHORT\\\" }) { serial } }\"}" > /dev/null 2>&1 || true

# Start agent
echo "Starting agent..."
launchctl load "$PLIST_PATH"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    Installation Complete!                     ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Serial:   $SERIAL"
echo "  Status:   Running"
echo "  Logs:     /var/log/mac-fleet-agent.log"
echo ""
