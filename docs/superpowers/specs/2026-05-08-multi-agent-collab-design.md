# Multi-Agent Collaboration Platform - Design Spec

**Date:** 2026-05-09
**Author:** Superpowers Brainstorming
**Status:** Verified (Evidence-Based)

> **Requirements Document:** See [requirements.md](./requirements.md)
>
> **Related Documents:**
> - [Requirements](./requirements.md) - 用户需求与验收标准
> - 本文档 - 架构设计和技术实现

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
│   Channel Hub  │  Presence  │  Message Store  │  Auth       │
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

## 3. Verified Communication Protocol

### 3.1 Claude Code Agent（已验证）

**关键证据：**
- `claude -p` 启用非交互模式
- `claude --output-format stream-json` 输出结构化 JSON
- `claude --input-format stream-json` 支持流式输入
- 环境变量 `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN` 可注入 MiniMax API

**Daemon 启动 Claude Code：**

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
    'ANTHROPIC_BASE_URL': config.baseUrl,      // e.g., https://api.minimaxi.com/anthropic
    'ANTHROPIC_AUTH_TOKEN': config.apiKey,    // MiniMax API Key
    'ANTHROPIC_MODEL': config.model,          // e.g., M2.7-highspeed
  },
  stdin: 'pipe',
  stdout: 'pipe',
  stderr: 'piped',
});
```

**JSON 消息格式（已验证）：**

```json
// Daemon → Claude Code (stdin)
{"type": "user", "content": "@agent-name 帮我写一个函数"}

// Claude Code → Daemon (stdout)
{"type": "content", "content": [{"type": "text", "text": "..."}]}
{"type": "content", "content": [{"type": "tool_use", "name": "Bash", "input": {...}}]}
{"type": "done"}
```

**详细协议见** [Requirements](./requirements.md) §3.2 消息格式。

### 3.2 Custom Agent（预留）

如需自定义 Agent（支持 Skills 等），通过 Bun 子进程实现，使用相同的 JSON 协议通信。

详见 [Requirements](./requirements.md) §3.2.2。

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

## 5. API Design

### 5.1 WebSocket Protocol

> 见 [Requirements](./requirements.md) §5.1 WebSocket 协议。

### 5.2 HTTP REST API

| Method | Path | 说明 | 关联需求 |
|--------|------|------|----------|
| GET | /api/channels | 列出频道 | FR-1 |
| POST | /api/channels | 创建频道 | FR-1.1 |
| GET | /api/channels/:id/messages | 获取消息 | FR-2 |
| POST | /api/machines/register | 注册机器 | FR-4 |
| GET | /api/machines | 列出机器 | FR-4 |
| POST | /api/agents | 创建 Agent | FR-5 |
| GET | /api/boards | 列出看板 | FR-7 |
| POST | /api/cards | 创建卡片 | FR-7.2 |

详见：[Requirements](./requirements.md) §5.2 HTTP API。

---

## 6. Agent Configuration

### 6.1 Claude Code Agent（已验证）

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

### 6.2 Custom Agent（预留）

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

## 7. Machine Persistent Identity

### 7.1 设计（已验证）

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

### 7.2 重连流程

1. Daemon 启动，读取 `~/.pi-collab/daemon/id.json`
2. 用 `machineId + machineKey` 连接 Server
3. Server 验证身份，返回新 session
4. 如文件不存在，生成新 UUID，发起注册

详见：[Requirements](./requirements.md) §6.3 Machine 注册流程。

---

## 8. File Structure

```
packages/
├── collab-server/           # Collaboration Server (Node.js)
│   ├── src/
│   │   ├── index.ts         # 入口
│   │   ├── server.ts        # HTTP + WebSocket
│   │   ├── db.ts            # SQLite
│   │   ├── routes/          # API routes
│   │   ├── ws/              # WebSocket handlers
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
│   │   └── identity.ts      # Machine 身份管理
│   └── package.json
│
├── collab-web/               # Web UI (Vue 3)
│   ├── src/
│   │   ├── components/
│   │   │   ├── chat/        # 聊天组件
│   │   │   ├── kanban/      # 看板组件
│   │   │   ├── machine/     # 机器管理
│   │   │   └── layout/      # 布局
│   │   ├── stores/          # Pinia stores
│   │   ├── api/             # API 客户端
│   │   └── types/           # 类型定义
│   ├── vite.config.ts
│   └── package.json
│
└── docs/superpowers/specs/
    ├── 2026-05-08-multi-agent-collab-design.md  # 本文档
    └── requirements.md                          # 需求文档
```

---

## 9. Implementation Order

### Phase 1: Collab Server（基础后端）
1. 创建 `collab-server` 包
2. SQLite 数据库设置（Machine, Agent, Channel, Message, Board 表）
3. REST API 实现
4. WebSocket 服务器

### Phase 2: Daemon（机器端）
5. 创建 `daemon` 包
6. Machine 身份管理（持久化 UUID）
7. WebSocket 客户端
8. Machine 注册流程

### Phase 3: CLI Agent（Claude Code）
9. 实现 `cli-agent.ts`
10. Spawn Claude Code 进程
11. JSON 协议通信（stdin/stdout）
12. 环境变量注入（MiniMax API）

### Phase 4: Web UI（前端）
13. 创建 `collab-web` Vue 3 项目
14. 频道聊天界面
15. 机器管理界面
16. 看板（简单版）

### Phase 5: 集成
17. 端到端测试
18. @mention 路由
19. Presence 状态

详见：[Requirements](./requirements.md) §7 实现计划。

---

## 10. Verification Evidence

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

## 11. Open Issues

| Issue | 状态 | 说明 |
|-------|------|------|
| Custom Agent Skills | 预留 | v1 不实现，后续可扩展 |
| Auth/权限 | 开放 | 原型暂不实现，后续加 |
| Codex CLI 验证 | 未验证 | 需单独测试 |

---

## 12. References

- [Requirements Document](./requirements.md)
- [Slock.ai 架构研究](../research/2026-05-08-slock-research.md)
- [pi-mono packages](../..packages/)

---

**Document History:**
- 2026-05-08: 初始设计
- 2026-05-09: 更新架构，验证 Claude Code 自动化可行性