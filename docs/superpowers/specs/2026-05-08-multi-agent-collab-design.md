# Multi-Agent Collaboration Platform - Design Spec

**Date:** 2026-05-08
**Author:** Superpowers Brainstorming
**Status:** Draft → Ready for Review

## 1. Overview

Build a multi-agent collaboration platform ("Pi Collab") inspired by slock.ai. Multiple AI agents work alongside humans in shared channels, executing tasks on their own machines with full data privacy. The initial scope is an end-to-end prototype demonstrating the core concept.

### Key Insight

支持两种 Agent 类型：

| 类型 | 实现方式 | 优点 | 缺点 |
|------|----------|------|------|
| **custom** | Bun 进程 + pi-mono agent | 完全可控，支持任意 API | 需要开发 |
| **claude-code** | Spawn 机器上的 CLI | 直接复用已配置的 CLI | 依赖 CLI 的自动化能力 |

用户可以在机器上配置好 Claude Code（使用 MiniMax API），然后通过 Daemon 直接调用。

### Goals (Prototype)

1. **Multi-Agent Channels** — Human and AI agents communicate in real-time via @mentions
2. **Machine Management** — Add machines via a lightweight daemon, create agents on them
3. **Flexible Agent Types** — Support both custom Bun agents and native CLI tools (Claude Code, Codex)
4. **Custom API Support** — Agent can use MiniMax, DeepSeek, or any pi-ai supported provider
5. **Basic Visualization** — Web UI with chat interface and Kanban board
6. **Team Roles** — Assign roles to agents (can be configured later)

### Non-Goals (Roadmap)

- Advanced skills system (SKILL.md loading)
- Whiteboard
- Advanced permission system
- Agent marketplace
- Drag-drop Kanban

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Web UI (React)                        │
│   Channel Chat  │  Kanban Board  │  Machines  │  Settings  │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTP / WebSocket
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                   Collaboration Server                       │
│   Channel Hub  │  Presence  │  Message Store  │  Auth      │
│   (Node.js + SQLite)                                            │
└────────────────────────────┬────────────────────────────────┘
                             │ WebSocket (persistent)
             ┌───────────────┼───────────────┐
             ▼               ▼               ▼
      ┌───────────┐   ┌───────────┐   ┌───────────┐
      │ Machine 1 │   │ Machine 2 │   │ Machine 3 │
      │           │   │           │   │           │
      │ Daemon    │   │ Daemon    │   │ Daemon    │
      │ ┌───────┐ │   │ ┌───────┐ │   │ ┌───────┐ │
      │ │Agent A│ │   │ │Agent B│ │   │ │Agent C│ │
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

**Location:** `packages/daemon/`

A lightweight Node.js/Bun process running on each machine:

- Installed via: `npx @pi-collab/daemon`
- Maintains WebSocket connection to server
- Spawns agent processes (custom Bun process or CLI)
- Streams stdout/stderr back to server
- Handles environment variable injection per agent

**Tech:** Bun + ws + child_process

**Deployment:** Docker container (recommended) or direct host execution

#### 2.3 Agent Types

##### Type A: Custom Agent (Bun Process)

```
Agent = Bun 进程
├── @mariozechner/pi-ai (多 provider 支持)
├── @mariozechner/pi-agent-core (agent 循环)
├── Tools (bash/read/write/edit - 来自 mom)
└── Skills (future, SKILL.md 标准)
```

通信协议：Daemon 与 Agent 通过 **stdin/stdout JSON 消息** 交换

```typescript
// Daemon → Agent
{ type: 'prompt', content: string, context: {...} }

// Agent → Daemon
{ type: 'response', content: string }
{ type: 'tool_call', name: string, args: {...} }
{ type: 'tool_result', name: string, result: string }
```

##### Type B: Claude Code / Codex CLI (Native CLI)

```
Agent = 机器上已安装的 CLI
├── Claude Code: npx @anthropic-ai/claude-code
├── Codex CLI: npx @openai/codex
└── 其他 CLI 工具
```

Daemon spawn CLI 进程，通过 **stdin/stdout** 通信：
- 读取环境变量（用户已在机器上配置）
- CLI 自行处理 LLM 调用和工具执行

**关键优势**：用户可以在机器上配置好 Claude Code 使用 MiniMax API（通过 ANTHROPIC_BASE_URL 等环境变量），无需修改任何代码。

#### 2.4 Web UI

**Location:** Extend `packages/web-ui/`

New features:

- **Channel Chat** — Real-time messaging with human + agent participants
- **Kanban Board** — Simple board with columns (To Do, In Progress, Done) and cards
- **Machine Panel** — Add machines, view agent status, configure agents
- **Agent Config** — Set agent type, name, env vars, workspace

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
  status TEXT DEFAULT 'offline', -- 'online' or 'offline'
  last_seen INTEGER,
  machine_key TEXT -- issued at creation, never retrievable again
);

-- Agents
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  machine_id TEXT REFERENCES machines(id),
  type TEXT NOT NULL, -- 'custom', 'claude-code', 'codex'
  name TEXT NOT NULL,
  status TEXT DEFAULT 'offline', -- 'online', 'offline', 'busy'
  channel_id TEXT REFERENCES channels(id),
  config TEXT -- JSON: { env: {...}, workspace: string, cliPath?: string }
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
{ type: 'message', channelId: string, message: Message }
{ type: 'presence', userId: string, status: 'online' | 'offline' }
{ type: 'agent_output', agentId: string, output: string }
{ type: 'agent_error', agentId: string, error: string }
{ type: 'agent_typing', agentId: string }
```

**Client → Server:**

```typescript
{ type: 'send_message', channelId: string, content: string }
{ type: 'join_channel', channelId: string }
{ type: 'leave_channel', channelId: string }
{ type: 'create_agent', machineId: string, config: AgentConfig }
{ type: 'agent_command', agentId: string, command: string }
{ type: 'machine_register', machineKey: string, name: string }
```

### HTTP REST API

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/channels | List all channels |
| POST | /api/channels | Create channel |
| GET | /api/channels/:id/messages | Get messages (paginated) |
| GET | /api/machines | List machines |
| POST | /api/machines | Register machine (returns machineKey) |
| DELETE | /api/machines/:id | Delete machine |
| POST | /api/agents | Create agent |
| GET | /api/agents/:id | Get agent status |
| DELETE | /api/agents/:id | Delete agent |
| GET | /api/boards | List kanban boards |
| POST | /api/boards | Create board |
| PUT | /api/cards/:id | Update card |
| POST | /api/cards | Create card |
| DELETE | /api/cards/:id | Delete card |

---

## 5. Agent Configuration

### Agent Types

#### Type: custom (Bun Process)

```json
{
  "type": "custom",
  "name": "my-agent",
  "apiProvider": "minimax",
  "apiKey": "eyJh...",
  "model": "MiniMax-Text-01",
  "workspace": "/home/user/workspace",
  "skillsDir": "/home/user/.pi-collab/agents/my-agent/skills"
}
```

#### Type: claude-code (Native CLI)

用户先在机器上配置好 Claude Code 的环境变量：

```bash
# ~/.bashrc 或 ~/.zshrc
export ANTHROPIC_BASE_URL=https://api.minimax.chat/v1
export ANTHROPIC_API_KEY=eyJh...
export CLAUDE_MODEL=claude-sonnet-4-6
```

然后在 Web UI 创建 agent：

```json
{
  "type": "claude-code",
  "name": "claude-dev",
  "cliPath": "/usr/local/bin/claude",
  "workspace": "/home/user/workspace"
}
```

Daemon 会：
1. 设置 `env` 中的环境变量
2. Spawn `claude` 进程
3. 通过 stdin/stdout 通信

#### Type: codex (Native CLI)

```json
{
  "type": "codex",
  "name": "codex-backend",
  "cliPath": "/usr/local/bin/codex",
  "workspace": "/home/user/workspace"
}
```

---

## 6. Communication Protocol (Daemon ↔ Agent)

### For Custom Agents

Communication via JSON messages on stdin/stdout:

```typescript
// Daemon sends user message to agent
{
  type: 'message',
  channelId: string,
  messageId: string,
  content: string,      // user message content
  context: {
    channels: [{id, name}],
    users: [{id, name, displayName}],
    memory: string,     // agent's memory
    workspace: string
  }
}

// Agent responds
{
  type: 'response',
  messageId: string,
  content: string       // markdown response
}

// Agent calls a tool
{
  type: 'tool_call',
  messageId: string,
  tool: string,         // 'bash', 'read', 'write', 'edit'
  args: object
}

// Daemon confirms tool result
{
  type: 'tool_result',
  tool: string,
  args: object,
  result: string,
  success: boolean
}

// Agent indicates done
{
  type: 'done',
  messageId: string
}
```

### For CLI Agents (claude-code, codex)

Daemon spawns the CLI process and:
1. Writes messages to stdin (formatted as appropriate for the CLI)
2. Reads stdout/stderr and forwards to server
3. May use PTY for interactive prompts

---

## 7. Security Considerations

### Machine Daemon

- Runs in Docker container (recommended) for isolation
- Only accesses mounted workspace directories
- Machine key stored locally (only received once at registration)
- No SSH keys or credentials stored on host

### Agent Execution

- Custom agents: tools limited to workspace directory
- CLI agents: run with permissions of the daemon user
- Bash commands restricted to container

### Web UI

- No built-in auth in prototype (add via roadmap)
- Server should run behind reverse proxy with auth

---

## 8. File Structure

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
│   │   ├── machines.ts     # Machine registry
│   │   ├── agents.ts       # Agent management
│   │   └── ws-handler.ts   # WebSocket message routing
│   ├── package.json
│   └── tsconfig.json
│
├── daemon/                 # NEW: Machine daemon
│   ├── src/
│   │   ├── index.ts        # Entry point
│   │   ├── daemon.ts       # Daemon logic
│   │   ├── agent-manager.ts # Agent spawning & lifecycle
│   │   ├── custom-agent.ts # Custom Bun agent implementation
│   │   ├── cli-agent.ts    # CLI agent (Claude Code, Codex) implementation
│   │   ├── protocol.ts     # Daemon-Agent communication protocol
│   │   └── ws-client.ts    # Server WebSocket connection
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
│
└── web-ui/                 # MODIFY: Add collab features
    ├── src/
    │   ├── components/
    │   │   ├── collab/
    │   │   │   ├── ChannelChat.tsx
    │   │   │   ├── ChannelList.tsx
    │   │   │   ├── MessageList.tsx
    │   │   │   ├── KanbanBoard.tsx
    │   │   │   ├── KanbanColumn.tsx
    │   │   │   ├── KanbanCard.tsx
    │   │   │   ├── MachinePanel.tsx
    │   │   │   ├── AgentConfig.tsx
    │   │   │   └── MemberList.tsx
    │   │   └── ...
    │   ├── stores/
    │   │   ├── collab-store.ts
    │   │   └── ...
    │   └── ...
    └── ...
```

---

## 9. Implementation Order

### Phase 1: Foundation
1. Create `collab-server` package
   - SQLite setup with all tables
   - Basic HTTP REST API (channels, machines, agents, messages)
   - WebSocket server for real-time communication
2. Create `daemon` package
   - WebSocket client to server
   - Machine registration flow
   - Basic HTTP fallback

### Phase 2: Custom Agent
3. Implement custom agent protocol (JSON stdin/stdout)
4. Create custom agent process spawner
5. Integrate `@mariozechner/pi-ai` for multi-provider support
6. Implement basic tools (bash, read, write, edit)

### Phase 3: CLI Agent Support
7. Implement CLI agent type (spawn claude/codex)
8. Handle stdin/stdout communication with CLI
9. Support environment variable injection

### Phase 4: Web UI
10. Extend web-ui with channel chat component
11. Implement real-time message display
12. Add machine panel for adding/configuring machines
13. Add basic Kanban board (columns + cards)

### Phase 5: Polish
14. @mention routing to agents
15. Presence indicators
16. Agent typing indicators
17. Basic agent status display

---

## 10. Success Criteria

- [ ] User can add a machine by running daemon and connecting to server
- [ ] User can create a custom agent using MiniMax (or other) API
- [ ] User can create a claude-code agent using machine's existing CLI
- [ ] User can send a message in a channel and @mention an agent
- [ ] Agent receives the message and responds
- [ ] Web UI displays the conversation in real-time
- [ ] Basic Kanban board exists with To Do / In Progress / Done columns
- [ ] Cards can be created and moved between columns

---

## 11. Open Questions

1. **Auth**: Should we add basic auth in prototype or leave open?
2. **CLI Interaction**: How should we format messages for claude-code stdin? Does it support non-interactive mode?
3. **Kanban Features**: What level of Kanban functionality for v1? Just create/move cards?
4. **Skills**: Not in v1, but what's the target format? (Claude Code's SKILL.md standard?)