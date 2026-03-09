# ⭐ OpenClaw Agency Dashboard

Real-time web dashboard for monitoring 30 AI agents across 7 divisions, powered by Nostr authentication.

![Dashboard](https://img.shields.io/badge/status-MVP-purple) ![Auth](https://img.shields.io/badge/auth-NIP--07-blue) ![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **🔑 Nostr Authentication** — Login with NIP-07 browser extensions (nos2x, Alby, etc.)
- **🏢 Agency Overview** — 7 division cards showing active/idle agent counts
- **⚡ Active Operations** — Epic progress tracking with task breakdowns
- **📜 Activity Feed** — Real-time log of agent events via WebSocket
- **👥 Agent Roster** — All 30 agents grouped by division with status
- **⚙️ Team Management** — Add/remove team members by npub, role management
- **📦 Beads Integration** — Reads live data from `bd` CLI when available
- **🎭 Mock Data Mode** — Full demo experience without beads

## Quick Start

```bash
# Clone
git clone https://github.com/CentauriAgent/openclaw-agency-dashboard.git
cd openclaw-agency-dashboard

# Setup
npm install
bash scripts/setup.sh    # Creates agency-team.json with default owner

# Run
npm start
# → ⭐ Agency Dashboard running at http://localhost:7700
```

Open `http://localhost:7700` in a browser with a NIP-07 extension installed.

## Requirements

- **Node.js** 18+
- **NIP-07 browser extension** (nos2x, Alby, Nostr Connect, etc.)
- **Beads CLI** (`bd`) — optional, falls back to mock data

## Configuration

### Team Config (`agency-team.json`)

```json
{
  "agency": "OpenClaw Agency",
  "owner": "npub1...",
  "members": [
    { "npub": "npub1...", "role": "owner", "added": "2026-03-09T00:00:00Z" }
  ],
  "relays": ["wss://relay.ditto.pub", "wss://relay.primal.net", "wss://nos.lol"]
}
```

### Roles

| Role | View | Manage Tasks | Manage Team | Settings |
|------|:----:|:------------:|:-----------:|:--------:|
| **Owner** | ✅ | ✅ | ✅ | ✅ |
| **Admin** | ✅ | ✅ | ✅ (viewers) | ❌ |
| **Viewer** | ✅ | ❌ | ❌ | ❌ |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `7700` | Server port |
| `BD_CWD` | `process.cwd()` | Beads working directory |

## Architecture

- **Zero build step** — Vanilla HTML/CSS/JS, no webpack/bundler
- **Node.js server** — Express-like HTTP server with auth middleware
- **WebSocket** — Real-time activity updates
- **NIP-07 auth** — Challenge (kind 27235) → sign → verify → JWT session
- **Mock data** — Realistic demo with 3 epics, 30+ tasks, 30 agents

## Division Structure

| Division | Agents | Color |
|----------|--------|-------|
| 🏗️ Engineering | 9 | Blue |
| 🎨 Design | 3 | Pink |
| 📣 Marketing | 4 | Green |
| 📦 Product | 3 | Amber |
| 🎬 Project Management | 3 | Indigo |
| 🧪 Testing | 4 | Red |
| 🛟 Operations & Support | 4 | Teal |

## API Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api/auth/challenge` | ❌ | Get unsigned NIP-98 event |
| `POST /api/auth/verify` | ❌ | Verify signed event, get JWT |
| `GET /api/auth/me` | ✅ | Current user info |
| `GET /api/overview` | ✅ | Division summaries |
| `GET /api/activity` | ✅ | Activity feed events |
| `GET /api/agents` | ✅ | All 30 agents with status |
| `GET /api/epics` | ✅ | Epic progress data |
| `GET /api/team` | ✅ 🔒 | Team member list |
| `POST /api/team/members` | ✅ 🔒 | Add team member |

## License

MIT
