# Mac Fleet Agent

Remote management agent for macOS devices.

## Quick Install

Run this command on any Mac:

```bash
curl -fsSL https://raw.githubusercontent.com/batmunkh0612/mac-fleet-agent/main/install.sh | sudo bash
```

## What it does

1. Downloads and installs the agent to `/usr/local/mac-fleet-agent/`
2. Creates configuration in `/etc/mac-fleet-agent/`
3. Sets up LaunchDaemon for automatic startup
4. Registers the device with the fleet server
5. Starts the agent

## Requirements

- macOS 10.15+
- Node.js 18+ (auto-installed via Homebrew if not found)
- Admin/sudo access

## Manual Commands

**Check status:**
```bash
sudo launchctl list | grep mac-fleet
```

**View logs:**
```bash
tail -f /var/log/mac-fleet-agent.log
```

**Restart agent:**
```bash
sudo launchctl unload /Library/LaunchDaemons/com.company.mac-fleet-agent.plist
sudo launchctl load /Library/LaunchDaemons/com.company.mac-fleet-agent.plist
```

**Uninstall:**
```bash
sudo launchctl unload /Library/LaunchDaemons/com.company.mac-fleet-agent.plist
sudo rm -rf /usr/local/mac-fleet-agent
sudo rm -rf /etc/mac-fleet-agent
sudo rm /Library/LaunchDaemons/com.company.mac-fleet-agent.plist
```

## License

MIT
