# Multi-Agent Collaboration Platform - Design Spec

**Date:** 2026-05-09
**Author:** Superpowers Brainstorming
**Status:** Verified (Evidence-Based)

> **Requirements Document:** See [requirements.md](./requirements.md)
>
> **Related Documents:**
> - [Requirements](./requirements.md) - 用户需求与验收标准
> - [CLI Agent Docs](./cli-agent.md) - Claude Code CLI 详细文档

---

## 1. Overview

构建一个多 Agent 协作平台 ("Pi Collab")，灵感来自 slock.ai。多个 AI Agent 与人类在共享频道中协同工作，在用户自有机器上执行任务，保证数据隐私。

### 关键特性（已验证可行）

1. **支持 Claude Code 自动化** — 验证证据：
   - Claude Code 支持 `-p/--print` 非交互模式
   - 支持 `--output-format json/stream-json` 结构化输出
   - 支持 `--input-format stream-json` 流式输入
   - 支持环境变量注入 MiniMax API

2. **双 Agent 类型**：
   - **CLI Agent** — 直接使用机器上的 Claude Code / Codex CLI
   - **Custom Agent** — 自定义 Bun 进程（后续扩展）

3. **环境变量注入** — 可在 spawn 前配置任意 API 端点和 key

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Collab Web (Vue 3)                       │
│   Channel Chat  │  Kanban Board  │  Machines  │  Settings   │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTP / WebSocket
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                  Collab Server (Node.js)                    │
│   Channel Hub  │  Presence  │  Message Store  │  Auth          │
│   (Express + SQLite + ws)                                      │
└────────────────────────────┬────────────────────────────────┘
                             │ WebSocket (persistent)
             ┌───────────────┼───────────────┐
             ▼               ▼               ▼
      ┌───────────┐   ┌───────────┐   ┌───────────┐
      │ Machine 1 │   │ Machine 2 │   │ Machine 3 │
      │           │   │           │   │           │
      │ Daemon    │   │ Daemon    │   │ Daemon    │
      │ └─Agent A │   │ └─Agent B │   │ └─Agent C │
      └───────────┘   └───────────┘   └───────────┘
```

### 组件

| 组件 | 技术栈 | 位置 | 说明 |
|------|--------|------|------|
| **Collab Server** | Node.js + Express + SQLite + ws | `packages/collab-server/` | 协作后端服务 |
| **Daemon** | Bun | `packages/daemon/` | 机器端守护进程 |
| **CLI Agent** | Claude Code / Codex CLI | N/A | 使用机器已有 CLI |
| **Collab Web** | Vue 3 + TypeScript + Vite + Bun | `packages/collab-web/` | Web UI（新建） |

详见 [Requirements](./requirements.md) §2 组件说明。

---

## 3. Communication Protocols

### 3.1 Daemon ↔ Server WebSocket Protocol

#### 3.1.1 连接建立

**步骤 1: Daemon 连接**

```json
// Daemon → Server
{ "type": "machine_register", "machineId": "uuid-xxx", "machineKey": "key-xxx" }
```

**步骤 2: Server 确认**

```json
// Server → Daemon
{ "type": "registered", "machineId": "uuid-xxx", "status": "ok" }
```

或拒绝：

```json
{ "type": "error", "code": "INVALID_KEY", "message": "Machine key is invalid or expired" }
```

#### 3.1.2 消息路由

**Daemons, Servers, Clients 之间的消息流：**

```
Client (Web UI)
    │ send_message
    ▼
Server
    │ route to channel members
    ▼
┌─────────────────────────┐
│ Machine 1 (Daemon)      │
│   │                    │
│   ├── Agent A          │
│   │     └── @mention?  │
│   │         ↓          │
│   │    spawn claude    │
│   │         ↓          │
│   │    stdout → server │
│   │         ↓          │
│   │    broadcast       │
│   ▼                    │
└─────────────────────────┘
```

#### 3.1.3 消息格式定义

**客户端 → 服务器 (WebSocket):**

```typescript
// 发送消息到频道
interface SendMessage {
  type: 'send_message';
  channelId: string;
  content: string;
}

// 加入频道
interface JoinChannel {
  type: 'join_channel';
  channelId: string;
}

// 离开频道
interface LeaveChannel {
  type: 'leave_channel';
  channelId: string;
}

// 创建 Agent
interface CreateAgent {
  type: 'create_agent';
  machineId: string;
  agentId: string;
  config: AgentConfig;
}

// 删除 Agent
interface DeleteAgent {
  type: 'delete_agent';
  agentId: string;
}

// Agent 输出（Daemon → Server）
interface AgentOutput {
  type: 'agent_output';
  agentId: string;
  channelId: string;
  content: string;
  done: boolean;
}

// Agent 工具调用（Daemon → Server）
interface AgentToolCall {
  type: 'agent_tool_call';
  agentId: string;
  tool: string;
  args: Record<string, unknown>;
}

// Agent 工具结果（Daemon → Server）
interface AgentToolResult {
  type: 'agent_tool_result';
  agentId: string;
  tool: string;
  result: string;
  success: boolean;
}

// Machine 心跳
interface MachineHeartbeat {
  type: 'heartbeat';
  machineId: string;
}
```

**服务器 → 客户端 (WebSocket):**

```typescript
// 新消息
interface NewMessage {
  type: 'message';
  channelId: string;
  message: {
    id: string;
    senderId: string;
    senderType: 'human' | 'agent';
    senderName: string;
    content: string;
    createdAt: number;
  };
}

// 用户上线/下线
interface PresenceUpdate {
  type: 'presence';
  userId: string;
  status: 'online' | 'offline';
}

// Agent 输出（Server → Daemon → 转发）
interface AgentResponse {
  type: 'agent_response';
  agentId: string;
  channelId: string;
  content: string;
  done: boolean;
}

// 转发消息给 Agent（Server → Daemon）
interface ForwardToAgent {
  type: 'forward_to_agent';
  agentId: string;
  messageId: string;
  content: string;
  context: {
    channels: Array<{ id: string; name: string }>;
    users: Array<{ id: string; name: string; displayName: string }>;
    workspace: string;
  };
}

// 创建 Agent 响应（Server → Daemon）
interface AgentCreated {
  type: 'agent_created';
  agentId: string;
  status: 'online' | 'error';
  error?: string;
}

// 删除 Agent 响应
interface AgentDeleted {
  type: 'agent_deleted';
  agentId: string;
}

// 心跳响应
interface HeartbeatAck {
  type: 'heartbeat_ack';
  timestamp: number;
}
```

#### 3.1.4 Error Codes

| Code | 说明 |
|------|------|
| `INVALID_KEY` | Machine key 无效或过期 |
| `MACHINE_NOT_FOUND` | Machine ID 不存在 |
| `AGENT_NOT_FOUND` | Agent 不存在 |
| `CHANNEL_NOT_FOUND` | Channel 不存在 |
| `UNAUTHORIZED` | 未认证 |
| `INTERNAL_ERROR` | 服务器内部错误 |

---

### 3.2 Daemon ↔ Agent Protocol (CLI Agent)

#### 3.2.1 Spawn

```typescript
import { spawn } from 'bun';

const proc = spawn({
  cmd: ['claude', '-p',
    '--output-format', 'stream-json',
    '--input-format', 'stream-json',
    '--no-session-persistence',
    '--dangerously-skip-permissions',
    '--add-dir', config.workspace,
    '--name', agentName,
  ],
  env: {
    ...process.env,
    'ANTHROPIC_BASE_URL': config.baseUrl,
    'ANTHROPIC_AUTH_TOKEN': config.apiKey,
    'ANTHROPIC_MODEL': config.model,
    'hasCompletedOnboarding': 'true',
  },
  stdin: 'pipe',
  stdout: 'pipe',
  stderr: 'piped',
});
```

#### 3.2.2 消息格式

**Daemon → Claude Code (stdin):**

```json
{"type": "user", "content": "@agent-name 帮我写一个函数"}
```

**Claude Code → Daemon (stdout):**

```json
{"type": "content", "content": [{"type": "text", "text": "好的，我来帮你..."}]}
{"type": "content", "content": [{"type": "tool_use", "name": "Bash", "input": {"command": "ls -la"}}]}
{"type": "content", "content": [{"type": "text", "text": "完成！"}]}
{"type": "done"}
```

#### 3.2.3 工具执行流程

当 Claude Code 请求工具时：

1. Daemon 解析 `tool_use` 内容块
2. 执行工具（bash/read/write/edit）
3. 将结果写回 Claude Code stdin：

```json
{"type": "tool_result", "tool": "Bash", "result": "total 64\ndrwxr-xr-x..."}
```

#### 3.2.4 ANSI 转义码处理

Claude Code 输出可能包含 ANSI 转义码。需要过滤：

```typescript
function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}
```

详细文档见 [CLI Agent Docs](./cli-agent.md)。

---

### 3.3 Custom Agent Protocol (预留)

如需自定义 Agent（支持 Skills 等），使用相同的 JSON 消息格式：

**Daemon → Custom Agent:**

```json
{"type": "init", "agentId": "...", "workspace": "/path", "config": {...}}
{"type": "message", "messageId": "...", "content": "...", "context": {...}}
{"type": "abort"}
```

**Custom Agent → Daemon:**

```json
{"type": "ready", "agentId": "..."}
{"type": "response", "messageId": "...", "content": "..."}
{"type": "tool_call", "messageId": "...", "tool": "bash", "args": {...}}
{"type": "done", "messageId": "..."}
```

---

## 4. Data Model

> 详细说明见 [Requirements](./requirements.md) §4 数据模型。

### 核心实体

| 实体 | 说明 | 关联 |
|------|------|------|
| **Machine** | 有持久身份的机器（UUID，不依赖 key） | 多个 Agent |
| **Agent** | 运行在机器上的 Agent 实例 | 属于 Machine，属于 Channel |
| **Channel** | 聊天频道 | 多个 Member（人+Agent） |
| **Message** | 频道消息 | 属于 Channel |

详见 ER 图：[Requirements](./requirements.md) §4.2 ER 图。

---

## 5. HTTP REST API

### 5.1 Complete API List

| Method | Path | 说明 | 关联需求 | 状态 |
|--------|------|------|----------|------|
| GET | /api/channels | 列出频道 | FR-1.2 | 必须 |
| POST | /api/channels | 创建频道 | FR-1.1 | 必须 |
| GET | /api/channels/:id/messages | 获取消息 | FR-2.4 | 必须 |
| POST | /api/machines/register | 注册机器 | FR-4.1 | 必须 |
| GET | /api/machines | 列出机器 | FR-4 | 必须 |
| DELETE | /api/machines/:id | 删除机器 | FR-4.4 | 必须 |
| POST | /api/agents | 创建 Agent | FR-5.1 | 必须 |
| GET | /api/agents/:id | 获取 Agent | FR-5.4 | 必须 |
| DELETE | /api/agents/:id | 删除 Agent | FR-5.5 | 必须 |
| GET | /api/boards | 列出看板 | FR-7.1 | 必须 |
| POST | /api/boards | 创建看板 | FR-7.1 | 必须 |
| POST | /api/cards | 创建卡片 | FR-7.2 | 必须 |
| PATCH | /api/cards/:id | 更新卡片 | FR-7.3 | 必须 |
| DELETE | /api/cards/:id | 删除卡片 | FR-7 | 可选 |

### 5.2 Request/Response Examples

#### POST /api/machines/register

**Request:**
```json
{ "machineId": "550e8400-e29b-41d4-a716-446655440000" }
```

**Response (201):**
```json
{ "machineKey": "mk_xxx_secret_xxx", "machineId": "550e8400-..." }
```

#### POST /api/agents

**Request:**
```json
{
  "machineId": "550e8400-e29b-41d4-a716-446655440000",
  "type": "claude-code",
  "name": "claude-dev",
  "config": {
    "workspace": "/home/user/workspace",
    "env": {
      "ANTHROPIC_BASE_URL": "https://api.minimaxi.com/anthropic",
      "ANTHROPIC_AUTH_TOKEN": "sk-cp-..."
    }
  }
}
```

**Response (201):**
```json
{
  "id": "agent-xxx",
  "machineId": "550e8400-...",
  "type": "claude-code",
  "name": "claude-dev",
  "status": "online"
}
```

---

## 6. Authentication

### 6.1 Auth 设计

原型阶段使用简化的 Token 认证：

```
┌─────────────────────────────────────────────────────────────┐
│                     Collab Server                             │
│                                                              │
│   POST /api/auth/login                                       │
│   { "username": "admin", "password": "xxx" }                │
│           ↓                                                  │
│   ┌─────────────────┐                                        │
│   │  Auth Module    │                                        │
│   │  - JWT tokens   │                                        │
│   │  - Session      │                                        │
│   └─────────────────┘                                        │
│           ↓                                                  │
│   { "token": "eyJ...", "user": { "id": "...", "name": "..." }}
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Token 类型

| Token | 用途 | 过期时间 |
|-------|------|----------|
| `accessToken` | API 访问 | 24h |
| `refreshToken` | 刷新 access | 7d |

### 6.3 Auth Endpoints

| Method | Path | 说明 |
|--------|------|------|
| POST | /api/auth/login | 登录获取 token |
| POST | /api/auth/refresh | 刷新 token |
| GET | /api/auth/me | 获取当前用户 |

### 6.4 Auth Middleware

所有 `/api/*` 需要带 `Authorization: Bearer <token>` 头（除了 login）。

```typescript
// Auth middleware 示例
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }
  // 验证 JWT...
}
```

### 6.5 Machine Auth（独立于用户 Auth）

Machine 使用 `machineId + machineKey` 通过 WebSocket 连接，不需要 accessToken。

```
Machine 注册: POST /api/machines/register → machineKey
Machine 连接: WebSocket with machineId + machineKey
```

### 6.6 简化方案（原型）

如暂不实现完整 Auth：

1. **去掉 login endpoint**
2. **所有 API 允许匿名访问**
3. **Machine 通过 machineId + machineKey 认证**
4. **后续再添加用户 Auth**

---

## 7. Agent Configuration

### 7.1 Claude Code Agent（已验证）

```json
{
  "type": "claude-code",
  "name": "claude-dev",
  "machineId": "uuid-xxx",
  "config": {
    "workspace": "/home/user/workspace",
    "env": {
      "ANTHROPIC_BASE_URL": "https://api.minimaxi.com/anthropic",
      "ANTHROPIC_AUTH_TOKEN": "sk-cp-...",
      "ANTHROPIC_MODEL": "M2.7-highspeed",
      "hasCompletedOnboarding": "true"
    },
    "permissions": "bypassPermissions"
  }
}
```

### 7.2 Custom Agent（预留）

```json
{
  "type": "custom",
  "name": "my-agent",
  "machineId": "uuid-xxx",
  "config": {
    "apiProvider": "minimax",
    "apiKey": "eyJh...",
    "model": "MiniMax-Text-01",
    "workspace": "/home/user/workspace",
    "skillsDir": "/home/user/.pi-collab/agents/my-agent/skills"
  }
}
```

---

## 8. Machine Persistent Identity

### 8.1 设计（已验证）

Machine 持久身份基于 UUID，不依赖于 key：

```
~/.pi-collab/daemon/id.json
{
  "machineId": "550e8400-e29b-41d4-a716-446655440000",
  "machineKey": "key-from-server (一次性获取)",
  "serverUrl": "ws://localhost:3000",
  "createdAt": 1746789600000
}
```

### 8.2 重连流程

1. Daemon 启动，读取 `~/.pi-collab/daemon/id.json`
2. 用 `machineId + machineKey` 连接 Server
3. Server 验证身份，返回新 session
4. 如文件不存在，生成新 UUID，发起注册

详见：[Requirements](./requirements.md) §6 User Scenarios。

---

## 9. File Structure

```
packages/
├── collab-server/           # Collaboration Server (Node.js)
│   ├── src/
│   │   ├── index.ts         # 入口
│   │   ├── server.ts        # HTTP + WebSocket
│   │   ├── db.ts            # SQLite
│   │   ├── routes/          # API routes
│   │   │   ├── channels.ts
│   │   │   ├── machines.ts
│   │   │   ├── agents.ts
│   │   │   ├── boards.ts
│   │   │   └── auth.ts
│   │   ├── ws/              # WebSocket handlers
│   │   │   ├── handler.ts
│   │   │   └── protocol.ts
│   │   ├── middleware/
│   │   │   └── auth.ts
│   │   └── types.ts         # 类型定义
│   └── package.json
│
├── daemon/                   # Machine Daemon (Bun)
│   ├── src/
│   │   ├── index.ts         # 入口
│   │   ├── daemon.ts        # 守护进程
│   │   ├── agent-manager.ts # Agent 生命周期
│   │   ├── agents/
│   │   │   ├── cli-agent.ts # Claude Code Agent
│   │   │   └── custom-agent.ts # Custom Agent (预留)
│   │   ├── protocol.ts      # 通信协议
│   │   ├── identity.ts      # Machine 身份管理
│   │   └── ws-client.ts     # Server 连接
│   └── package.json
│
├── collab-web/               # Web UI (Vue 3)
│   ├── src/
│   │   ├── components/
│   │   │   ├── chat/
│   │   │   │   ├── ChannelList.vue
│   │   │   │   ├── ChatWindow.vue
│   │   │   │   └── MessageItem.vue
│   │   │   ├── kanban/
│   │   │   │   ├── KanbanBoard.vue
│   │   │   │   ├── KanbanColumn.vue
│   │   │   │   └── KanbanCard.vue
│   │   │   ├── machine/
│   │   │   │   ├── MachinePanel.vue
│   │   │   │   └── AgentConfig.vue
│   │   │   └── layout/
│   │   │       └── AppLayout.vue
│   │   ├── stores/
│   │   │   ├── auth.ts
│   │   │   ├── channel.ts
│   │   │   └── agent.ts
│   │   ├── api/
│   │   │   └── client.ts
│   │   └── types/
│   │       └── index.ts
│   ├── vite.config.ts
│   └── package.json
│
└── docs/superpowers/specs/
    ├── 2026-05-08-multi-agent-collab-design.md  # 本文档
    ├── requirements.md                          # 需求文档
    └── cli-agent.md                             # CLI Agent 详细文档
```

---

## 10. Implementation Order

### Phase 1: Collab Server（基础后端）
1. 创建 `collab-server` 包
2. SQLite 数据库设置（Machine, Agent, Channel, Message, Board 表）
3. REST API 实现（完整列表见 §5.1）
4. WebSocket 服务器（完整协议见 §3.1）
5. Auth 模块（可选，见 §6.6）

### Phase 2: Daemon（机器端）
6. 创建 `daemon` 包
7. Machine 身份管理（持久化 UUID）
8. WebSocket 客户端
9. Machine 注册流程

### Phase 3: CLI Agent（Claude Code）
10. 实现 `cli-agent.ts`
11. Spawn Claude Code 进程
12. JSON 协议通信（stdin/stdout）
13. 环境变量注入（MiniMax API）

### Phase 4: Web UI（前端）
14. 创建 `collab-web` Vue 3 项目
15. 频道聊天界面
16. 机器管理界面
17. 看板（简单版）

### Phase 5: Integration（集成）
18. 端到端测试
19. @mention 路由
20. Presence 状态

详见：[Requirements](./requirements.md) §7 实现计划。

---

## 11. Verification Evidence

### Claude Code 自动化验证

```
$ claude --help

Options:
  -p, --print                    Print response and exit (non-interactive)
  --output-format <format>       "text" | "json" | "stream-json"
  --input-format <format>        "text" | "stream-json"
  --no-session-persistence       Don't save sessions
  --dangerously-skip-permissions Bypass all permission checks
```

**结论：** Claude Code 完全支持自动化，已验证可行。

---

## 12. Open Issues

| Issue | 状态 | 说明 |
|-------|------|------|
| Custom Agent Skills | 预留 | v1 不实现，后续可扩展 |
| Auth/权限 | 已设计 | 原型可用简化方案（§6.6） |
| Codex CLI 验证 | 未验证 | 需单独测试 |

---

## 13. References

- [Requirements Document](./requirements.md)
- [CLI Agent Docs](./cli-agent.md)
- [Slock.ai 架构研究](../research/2026-05-08-slock-research.md)
- [pi-mono packages](../..packages/)

---

**Document History:**
- 2026-05-08: 初始设计
- 2026-05-09: 更新架构，验证 Claude Code 自动化可行性
- 2026-05-09: 添加完整 WebSocket 协议定义、HTTP API 列表、Auth 设计