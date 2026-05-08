# Multi-Agent Collaboration Platform - Design Spec

**Date:** 2026-05-08
**Author:** Superpowers Brainstorming
**Status:** Draft

## 1. Overview

Build a multi-agent collaboration platform ("Pi Collab") inspired by slock.ai. Multiple AI agents work alongside humans in shared channels, executing tasks on their own machines with full data privacy. The initial scope is an end-to-end prototype demonstrating the core concept.

### Goals (Prototype)

1. **Multi-Agent Channels** — Human and AI agents communicate in real-time via @mentions
2. **Machine Management** — Add machines via a lightweight daemon, create agents on them
3. **Flexible Agent Types** — Support Claude CLI and Codex CLI, configurable with env vars
4. **Basic Visualization** — Web UI with chat interface and Kanban board
5. **Team Roles** — Assign roles to agents (can be configured later)

### Non-Goals (Roadmap)

- Full Kanban with drag-drop, time tracking, etc.
- Whiteboard
- Advanced permission system
- Agent marketplace
- Persistence layer beyond prototype needs

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Web UI (React)                        │
│   Channel Chat  │  Kanban Board  │  Machines  │  Settings  │
└────────────────────────────┬────────────────────────────────┘
                             │ WebSocket (ws://)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                   Collaboration Server                       │
│   Channel Hub  │  Presence  │  Message Store  │  Auth      │
│   (Node.js + SQLite)                                            │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTP / WebSocket
             ┌───────────────┼───────────────┐
             ▼               ▼               ▼
      ┌───────────┐   ┌───────────┐   ┌───────────┐
      │ Machine 1 │   │ Machine 2 │   │ Machine 3 │
      │ ┌───────┐ │   │ ┌───────┐ │   │ ┌───────┐ │
      │ │ Daemon│ │   │ │ Daemon│ │   │ │ Daemon│ │
      │ └───────┘ │   │ └───────┘ │   │ └───────┘ │
      │ ┌───────┐ │   │ ┌───────┐ │   │ ┌───────┐ │
      │ │ Agent │ │   │ │ Agent │ │   │ │ Agent │ │
      │ └───────┘ │   │ └───────┘ │   │ └───────┘ │
      └───────────┘   └───────────┘   └───────────┘
```

### Components

#### 2.1 Collaboration Server

**Location:** `packages/collab-server/`

A Node.js HTTP + WebSocket server managing:

- **Channels** — Chat rooms with human + agent members
- **Messages** — Real-time message routing, stored in SQLite
- **Presence** — Online/offline status of agents and humans
- **Machine Registry** — Track connected machines and their agents

**Tech:** Express + ws + better-sqlite3

#### 2.2 Machine Daemon

**Location:** `packages/machine-daemon/`

A lightweight Node.js process running on each machine:

- Maintains WebSocket connection to server
- Spawns agent processes (Claude CLI, Codex CLI)
- Streams stdout/stderr back to server
- Handles environment variable injection per agent

**Tech:** Node.js + ws + child_process

**Deployment:** Docker container (recommended) or direct host execution

#### 2.3 Agent Bridge

**Location:** `packages/agent-bridge/`

The agent-side component that:
- Connects to Collaboration Server (instead of Slack)
- Handles @mentions and channel messages
- Provides tool execution (bash, read, write, edit)
- Uses existing mom tool infrastructure (adapted)

**Tech:** Based on mom, adapted for WebSocket communication

#### 2.4 Web UI

**Location:** Extend `packages/web-ui/`

New features:

- **Channel Chat** — Real-time messaging with human + agent participants
- **Kanban Board** — Simple board with columns (To Do, In Progress, Done) and draggable cards
- **Machine Panel** — Add machines, view agent status, configure agents
- **Agent Config** — Set environment variables, select agent type (Claude/Codex)

**Tech:** React + WebSocket client + existing web-ui components

---

## 3. Data Model

### SQLite Tables

```sql
-- Channels
CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Channel Members (human or agent)
CREATE TABLE channel_members (
  channel_id TEXT,
  member_id TEXT,
  member_type TEXT, -- 'human' or 'agent'
  role TEXT, -- optional: 'engineer', 'pm', etc.
  PRIMARY KEY (channel_id, member_id)
);

-- Machines
CREATE TABLE machines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  status TEXT DEFAULT 'offline',
  last_seen INTEGER
);

-- Agents
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  machine_id TEXT REFERENCES machines(id),
  type TEXT NOT NULL, -- 'claude-cli' or 'codex-cli'
  name TEXT NOT NULL,
  env_vars TEXT, -- JSON
  status TEXT DEFAULT 'offline',
  channel_id TEXT REFERENCES channels(id)
);

-- Messages
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT REFERENCES channels(id),
  sender_id TEXT NOT NULL,
  sender_type TEXT NOT NULL, -- 'human' or 'agent'
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Kanban Board
CREATE TABLE kanban_boards (
  id TEXT PRIMARY KEY,
  channel_id TEXT REFERENCES channels(id),
  name TEXT NOT NULL
);

CREATE TABLE kanban_columns (
  id TEXT PRIMARY KEY,
  board_id TEXT REFERENCES kanban_boards(id),
  name TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE TABLE kanban_cards (
  id TEXT PRIMARY KEY,
  column_id TEXT REFERENCES kanban_columns(id),
  title TEXT NOT NULL,
  description TEXT,
  assignee_id TEXT,
  position INTEGER NOT NULL
);
```

---

## 4. API Design

### WebSocket Protocol

All real-time communication uses JSON messages over WebSocket.

**Server → Client:**

```typescript
{ type: 'message', channelId, message: Message }
{ type: 'presence', userId, status: 'online' | 'offline' }
{ type: 'agent_output', agentId, output: string }
{ type: 'agent_error', agentId, error: string }
```

**Client → Server:**

```typescript
{ type: 'send_message', channelId, content }
{ type: 'join_channel', channelId }
{ type: 'leave_channel', channelId }
{ type: 'create_agent', machineId, config: AgentConfig }
{ type: 'agent_command', agentId, command: string }
```

### HTTP REST API

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/channels | List all channels |
| POST | /api/channels | Create channel |
| GET | /api/channels/:id/messages | Get messages (paginated) |
| GET | /api/machines | List machines |
| POST | /api/machines | Register machine |
| POST | /api/agents | Create agent |
| GET | /api/boards | List kanban boards |
| POST | /api/boards | Create board |
| PUT | /api/cards/:id | Update card |

---

## 5. Agent Configuration

### Claude CLI Agent

```json
{
  "type": "claude-cli",
  "name": "claude-dev",
  "env": {
    "ANTHROPIC_API_KEY": "sk-...",
    "CLAUDE_MODEL": "claude-sonnet-4-6"
  }
}
```

### Codex CLI Agent

```json
{
  "type": "codex-cli",
  "name": "codex-backend",
  "env": {
    "OPENAI_API_KEY": "sk-...",
    "AZURE_OPENAI_ENDPOINT": "https://..."
  }
}
```

### Environment Variable Injection

When spawning an agent, the daemon reads `env_vars` from config and injects them into the process environment before launching the agent binary.

---

## 6. Security Considerations

### Machine Daemon

- Runs in Docker container (recommended) for isolation
- Only accesses mounted workspace directories
- No SSH keys or credentials stored on host

### Agent Bridge

- Tool execution limited to workspace directory
- Bash commands restricted to container
- No arbitrary system access

### Web UI

- No built-in auth in prototype (add via roadmap)
- Server should run behind reverse proxy with auth

---

## 7. File Structure

```
packages/
├── collab-server/          # NEW: Collaboration server
│   ├── src/
│   │   ├── index.ts        # Entry point
│   │   ├── server.ts       # HTTP + WebSocket server
│   │   ├── db.ts           # SQLite setup
│   │   ├── channels.ts     # Channel management
│   │   ├── messages.ts     # Message handling
│   │   ├── presence.ts     # Presence tracking
│   │   └── ws-handler.ts   # WebSocket message routing
│   ├── package.json
│   └── tsconfig.json
│
├── machine-daemon/         # NEW: Machine daemon
│   ├── src/
│   │   ├── index.ts        # Entry point
│   │   ├── daemon.ts       # Daemon logic
│   │   ├── agent-manager.ts # Agent spawning
│   │   └── ws-client.ts    # Server connection
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
│
├── agent-bridge/           # NEW: Agent bridge (based on mom)
│   ├── src/
│   │   ├── bridge.ts       # Main bridge class
│   │   ├── tools/          # Adapted from mom tools
│   │   └── ws-client.ts    # Server connection
│   ├── package.json
│   └── tsconfig.json
│
└── web-ui/                 # MODIFY: Add collab features
    └── src/
        ├── components/
        │   ├── ChannelChat.tsx
        │   ├── KanbanBoard.tsx
        │   ├── MachinePanel.tsx
        │   └── AgentConfig.tsx
        └── ...
```

---

## 8. Implementation Order

### Phase 1: Foundation
1. Create `collab-server` package with SQLite and WebSocket
2. Implement basic channel and message APIs
3. Create `machine-daemon` package with WebSocket client
4. Implement machine registration

### Phase 2: Agent Integration
5. Create `agent-bridge` package
6. Implement agent spawning with env var injection
7. Connect agent to server via WebSocket
8. Handle agent output streaming

### Phase 3: Web UI
9. Extend web-ui with channel chat component
10. Implement real-time message display
11. Add machine panel for adding/configuring machines
12. Add basic Kanban board (columns + cards, no drag-drop yet)

### Phase 4: Polish
13. @mention routing to agents
14. Presence indicators
15. Basic agent status display

---

## 9. Success Criteria

- [ ] User can add a machine via daemon connection
- [ ] User can create a Claude CLI or Codex CLI agent on a machine
- [ ] User can send a message in a channel and @mention an agent
- [ ] Agent receives the message and responds (via stdout stream)
- [ ] Web UI displays the conversation in real-time
- [ ] Basic Kanban board exists with To Do / In Progress / Done columns
- [ ] Cards can be created and moved between columns

---

## 10. Open Questions

1. **Auth**: Should we add basic auth in prototype or leave open?
2. **Message format**: Should agent messages support markdown/code blocks?
3. **Kanban features**: What level of Kanban functionality for v1? Just create/move cards?