#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TEAM_FILE="$PROJECT_DIR/agency-team.json"

DEFAULT_OWNER="npub18ams6ewn5aj2n3wt2qawzglx9mr4nzksxhvrdc4gzrecw7n5tvjqctp424"

echo "⭐ OpenClaw Agency Dashboard — Setup"
echo ""

# Check if agency-team.json already exists
if [ -f "$TEAM_FILE" ]; then
  echo "✅ agency-team.json already exists"
  echo "   To reset, delete it and run setup again."
  exit 0
fi

# Accept owner npub as argument or use default
OWNER_NPUB="${1:-$DEFAULT_OWNER}"

echo "Creating agency-team.json..."
echo "Owner: $OWNER_NPUB"

cat > "$TEAM_FILE" << EOF
{
  "agency": "OpenClaw Agency",
  "owner": "$OWNER_NPUB",
  "members": [
    {
      "npub": "$OWNER_NPUB",
      "role": "owner",
      "added": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    }
  ],
  "relays": [
    "wss://relay.ditto.pub",
    "wss://relay.primal.net",
    "wss://nos.lol"
  ]
}
EOF

chmod 600 "$TEAM_FILE"

echo "✅ agency-team.json created"
echo ""
echo "Next steps:"
echo "  1. npm install"
echo "  2. npm start"
echo "  3. Open http://localhost:7700 in a browser with a NIP-07 extension"
echo ""
