# Multi-Agent Collaboration Platform - Requirements

**Date:** 2026-05-09
**Author:** Superpowers Brainstorming
**Status:** Draft

> **Design Document:** See [design.md](./2026-05-08-multi-agent-collab-design.md)
>
> **Related Documents:**
> - [Design Spec](./2026-05-08-multi-agent-collab-design.md) - 技术架构和实现细节
> - [CLI Agent Docs](./cli-agent.md) - Claude Code CLI 详细文档
> - 本文档 - 用户需求与验收标准

---

## 1. Overview

本文档定义 Pi Collab 多 Agent 协作平台的功能需求和验收标准。

### 1.1 Project Background

用户希望基于 pi-mono 构建类似 slock.ai 的多 Agent 协作平台。

**核心场景：**
- 多个 AI Agent 与人类在共享频道中协同工作
- Agent 运行在用户自有机器上，通过守护进程管理
- 支持灵活配置 API（如 Claude Code + MiniMax）
- 提供 Web UI 进行协作和可视化

### 1.2 Non-Goals (v1)

- 高级 Skills 系统（SKILL.md 加载）
- Whiteboard
- 高级权限系统
- Agent 市场
- 拖拽式看板
- 完整用户 Auth 系统（原型阶段可用简化方案）

---

## 2. Component Description

> 详见 [Design Spec](./2026-05-08-multi-agent-collab-design.md) §2 Architecture

### 2.1 Collab Server

| 需求 ID | 描述 | 验收标准 |
|---------|------|----------|
| SRV-1 | 提供 HTTP REST API | 所有 API 端点可访问并返回正确格式 |
| SRV-2 | 提供 WebSocket 实时通信 | 消息实时推送到客户端 |
| SRV-3 | SQLite 数据持久化 | 数据在服务重启后保留 |
| SRV-4 | Machine 注册和身份管理 | Machine 有持久 UUID，不依赖 key |
| SRV-5 | Auth 认证（可选） | 原型可用简化方案（见 [Design Spec](./2026-05-08-multi-agent-collab-design.md) §6.6） |

### 2.2 Daemon

| 需求 ID | 描述 | 验收标准 |
|---------|------|----------|
| DMN-1 | 作为常驻进程运行 | 启动后保持运行，崩溃时退出 |
| DMN-2 | WebSocket 连接到 Server | 断线后自动重连 |
| DMN-3 | 管理 Agent 生命周期 | 启动、停止、重启 Agent |
| DMN-4 | Machine 身份持久化 | 存储 UUID 到 `~/.pi-collab/daemon/id.json` |

### 2.3 CLI Agent

| 需求 ID | 描述 | 验收标准 |
|---------|------|----------|
| CLI-1 | 支持 Claude Code | 能 spawn Claude Code 并通信 |
| CLI-2 | 环境变量注入 | MiniMax API 配置生效 |
| CLI-3 | 非交互模式运行 | 使用 `-p --output-format stream-json` |
| CLI-4 | JSON 协议通信 | stdin/stdout 交换 JSON 消息 |
| CLI-5 | 工具执行 | 执行 bash/read/write/edit 并返回结果 |

### 2.4 Web UI

| 需求 ID | 描述 | 验收标准 |
|---------|------|----------|
| WEB-1 | 频道聊天界面 | 发送消息，查看历史 |
| WEB-2 | @mention Agent | 消息能触发 Agent |
| WEB-3 | 机器管理面板 | 查看已连接机器，创建 Agent |
| WEB-4 | 简单看板 | 创建卡片，移动卡片 |

---

## 3. Functional Requirements

### FR-1: 频道管理

| 子需求 | 描述 |
|--------|------|
| FR-1.1 | 创建新频道 |
| FR-1.2 | 列出所有频道 |
| FR-1.3 | 加入/离开频道 |
| FR-1.4 | 频道成员管理（人 + Agent） |

### FR-2: 消息系统

| 子需求 | 描述 |
|--------|------|
| FR-2.1 | 发送消息到频道 |
| FR-2.2 | 实时接收消息（WebSocket） |
| FR-2.3 | @mention Agent |
| FR-2.4 | 消息历史分页 |

### FR-3: 用户交互

| 子需求 | 描述 |
|--------|------|
| FR-3.1 | Web UI 登录（原型暂不实现，见 §1.2） |
| FR-3.2 | 用户列表显示 |
| FR-3.3 | Presence 状态（在线/离线） |

### FR-4: Machine 管理

| 子需求 | 描述 | 设计参考 |
|--------|------|----------|
| FR-4.1 | 添加机器 | 见 [Design Spec](./2026-05-08-multi-agent-collab-design.md) §8 |
| FR-4.2 | 机器持久身份 | UUID 不依赖 key |
| FR-4.3 | 机器状态监控 | 在线/离线 |
| FR-4.4 | 删除机器 | 级联删除 Agent |

### FR-5: Agent 管理

| 子需求 | 描述 |
|--------|------|
| FR-5.1 | 在机器上创建 Agent |
| FR-5.2 | Claude Code Agent 类型 |
| FR-5.3 | 配置环境变量（API URL, Key, Model） |
| FR-5.4 | Agent 状态监控 |
| FR-5.5 | 删除 Agent |

### FR-6: Claude Code 集成

| 子需求 | 描述 | 验证证据 |
|--------|------|----------|
| FR-6.1 | Spawn Claude Code 进程 | 见 [Design Spec](./2026-05-08-multi-agent-collab-design.md) §10 |
| FR-6.2 | 环境变量注入 | ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN 等 |
| FR-6.3 | JSON 协议通信 | --output-format stream-json |
| FR-6.4 | 非交互模式 | -p flag |
| FR-6.5 | 工具执行 | bash/read/write/edit |

### FR-7: 看板

| 子需求 | 描述 |
|--------|------|
| FR-7.1 | 简单看板（To Do / In Progress / Done） |
| FR-7.2 | 创建卡片 |
| FR-7.3 | 移动卡片（列之间） |
| FR-7.4 | 卡片分配给 Agent |

---

## 4. Data Model

### 4.1 Entities

| Entity | 说明 | 主要字段 |
|--------|------|----------|
| **Machine** | 注册的机器 | id, name, status, lastSeen, createdAt |
| **Agent** | 运行中的 Agent | id, machineId, type, name, status, config |
| **Channel** | 聊天频道 | id, name, createdAt |
| **Member** | 频道成员 | channelId, memberId, memberType, role |
| **Message** | 消息 | id, channelId, senderId, senderType, content, createdAt |
| **Board** | 看板 | id, channelId, name |
| **Column** | 看板列 | id, boardId, name, position |
| **Card** | 看板卡片 | id, columnId, title, description, assigneeId, position |

### 4.2 ER Diagram

```
┌─────────────┐       ┌─────────────┐
│   Machine   │       │   Channel   │
│─────────────│       │─────────────│
│ id (PK)     │       │ id (PK)     │
│ name        │       │ name        │
│ status      │       │ createdAt   │
│ lastSeen    │       └──────┬──────┘
└──────┬──────┘              │
       │                     │
       │ 1:N                 │ N:M
       ▼                     ▼
┌─────────────┐       ┌─────────────┐
│    Agent    │       │   Member    │
│─────────────│       │─────────────│
│ id (PK)     │       │ channelId   │
│ machineId   │       │ memberId    │
│ type        │       │ memberType  │
│ name        │       │ role        │
│ status      │       └──────┬──────┘
│ config      │              │
└──────┬──────┘              │
       │                     │
       │                     │
       ▼                     ▼
┌─────────────┐       ┌─────────────┐
│   Message   │       │   Board     │
│─────────────│       │─────────────│
│ id (PK)     │       │ id (PK)     │
│ channelId   │       │ channelId   │
│ senderId    │       │ name        │
│ senderType  │       └──────┬──────┘
│ content     │              │ 1:N
│ createdAt   │              ▼
└─────────────┘       ┌─────────────┐
                      │   Column    │
                      │─────────────│
                      │ id (PK)     │
                      │ boardId     │
                      │ name        │
                      │ position    │
                      └──────┬──────┘
                             │ 1:N
                             ▼
                      ┌─────────────┐
                      │    Card     │
                      │─────────────│
                      │ id (PK)     │
                      │ columnId    │
                      │ title       │
                      │ description │
                      │ assigneeId  │
                      │ position    │
                      └─────────────┘
```

### 4.3 SQLite Schema

```sql
CREATE TABLE machines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'offline',
  last_seen INTEGER,
  created_at INTEGER NOT NULL,
  machine_key TEXT
);

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  machine_id TEXT REFERENCES machines(id),
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'offline',
  channel_id TEXT,
  config TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE members (
  channel_id TEXT REFERENCES channels(id),
  member_id TEXT NOT NULL,
  member_type TEXT NOT NULL,
  role TEXT,
  PRIMARY KEY (channel_id, member_id)
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT REFERENCES channels(id),
  sender_id TEXT NOT NULL,
  sender_type TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE boards (
  id TEXT PRIMARY KEY,
  channel_id TEXT REFERENCES channels(id),
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE columns (
  id TEXT PRIMARY KEY,
  board_id TEXT REFERENCES boards(id),
  name TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE TABLE cards (
  id TEXT PRIMARY KEY,
  column_id TEXT REFERENCES columns(id),
  title TEXT NOT NULL,
  description TEXT,
  assignee_id TEXT,
  position INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
```

---

## 5. API Specification

### 5.1 WebSocket Protocol

> 详细定义见 [Design Spec](./2026-05-08-multi-agent-collab-design.md) §3.1

**连接：** `ws://server:port/ws`

**认证：**
- Machine: 发送 `machine_register` 消息（machineId + machineKey）
- Client: 发送 `auth_login` 消息（username + password）

**Client → Server 消息类型：**
- `send_message` - 发送消息到频道
- `join_channel` - 加入频道
- `leave_channel` - 离开频道
- `create_agent` - 创建 Agent
- `delete_agent` - 删除 Agent
- `heartbeat` - 心跳

**Server → Client 消息类型：**
- `message` - 新消息
- `presence` - 状态更新
- `agent_response` - Agent 响应
- `agent_tool_call` - Agent 工具调用
- `agent_created` - Agent 创建完成
- `agent_deleted` - Agent 删除完成
- `heartbeat_ack` - 心跳响应

### 5.2 HTTP API

| Method | Path | Request | Response | 对应需求 |
|--------|------|---------|----------|----------|
| GET | /api/channels | - | Channel[] | FR-1.2 |
| POST | /api/channels | { name } | Channel | FR-1.1 |
| GET | /api/channels/:id/messages | ?cursor=&limit= | { messages, nextCursor } | FR-2.4 |
| POST | /api/machines/register | { machineId } | { machineKey } | FR-4.1 |
| GET | /api/machines | - | Machine[] | FR-4 |
| DELETE | /api/machines/:id | - | 204 | FR-4.4 |
| POST | /api/agents | { machineId, type, name, config } | Agent | FR-5.1 |
| GET | /api/agents/:id | - | Agent | FR-5.4 |
| DELETE | /api/agents/:id | - | 204 | FR-5.5 |
| GET | /api/boards?channelId= | - | Board[] | FR-7.1 |
| POST | /api/boards | { channelId, name } | Board | FR-7.1 |
| POST | /api/cards | { columnId, title, description? } | Card | FR-7.2 |
| PATCH | /api/cards/:id | { columnId?, position?, title?, description? } | Card | FR-7.3 |
| POST | /api/auth/login | { username, password } | { token, user } | FR-3.1 |

---

## 6. User Scenarios

### 6.1 添加机器和 Agent

```
1. 用户在机器上运行: npx @pi-collab/daemon
2. Daemon 生成 UUID，连接到 Server
3. Server 返回 machineKey（一次性）
4. Daemon 保存 id.json（machineId + machineKey）
5. 用户在 Web UI 创建 Claude Code Agent
6. Server 通知 Daemon spawn Claude Code
7. Agent 启动，使用 MiniMax API（通过环境变量）
```

详见：[Design Spec](./2026-05-08-multi-agent-collab-design.md) §8

### 6.2 频道中 @mention Agent

```
1. 用户在频道发送: @claude-dev 帮我写一个函数
2. Server 检测到 @mention，识别 Agent
3. Server 转发消息给对应 Agent（通过 Daemon）
4. Daemon 写入 Claude Code stdin
5. Claude Code 处理，输出到 stdout
6. Daemon 读取并转发给 Server
7. Server 广播消息到频道
8. Web UI 显示 Agent 响应
```

### 6.3 Machine 重连

```
1. Daemon 重启
2. 读取 ~/.pi-collab/daemon/id.json
3. 用 machineId + machineKey 连接 Server
4. Server 验证身份（不生成新 UUID）
5. 重连成功，恢复所有 Agent
```

---

## 7. Implementation Plan

### Phase 1: Collab Server（1-2 周）

| Task | Description | Dependencies |
|------|-------------|--------------|
| T1.1 | 初始化 `collab-server` 包 | - |
| T1.2 | SQLite 数据库设置 | T1.1 |
| T1.3 | REST API 实现（完整列表见 §5.2） | T1.2 |
| T1.4 | WebSocket 服务器（完整协议见 §5.1） | T1.3 |
| T1.5 | Machine 注册 API | T1.4 |
| T1.6 | Agent 管理 API | T1.4 |
| T1.7 | 消息存储 API | T1.4 |
| T1.8 | Auth 模块（可选） | T1.4 |

### Phase 2: Daemon（1-2 周）

| Task | Description | Dependencies |
|------|-------------|--------------|
| T2.1 | 初始化 `daemon` 包 | - |
| T2.2 | Machine 身份管理 | - |
| T2.3 | WebSocket 客户端 | - |
| T2.4 | Machine 注册流程 | T2.2, T2.3 |
| T2.5 | Agent 生命周期管理 | - |
| T2.6 | CLI Agent 实现（详见 [cli-agent.md](./cli-agent.md)） | T2.5 |
| T2.7 | Claude Code spawn + 通信 | T2.5 |

### Phase 3: Web UI（1-2 周）

| Task | Description | Dependencies |
|------|-------------|--------------|
| T3.1 | 创建 `collab-web` Vue 3 项目 | - |
| T3.2 | 项目基础配置 | T3.1 |
| T3.3 | 频道列表 + 聊天界面 | T3.2 |
| T3.4 | 消息实时更新 | T3.3 |
| T3.5 | 机器管理面板 | T3.2 |
| T3.6 | Agent 配置界面 | T3.5 |
| T3.7 | 简单看板 | T3.2 |

### Phase 4: Integration（1 周）

| Task | Description | Dependencies |
|------|-------------|--------------|
| T4.1 | 端到端测试 | T1.7, T2.7, T3.7 |
| T4.2 | @mention 路由 | T4.1 |
| T4.3 | Presence 状态 | T4.1 |
| T4.4 | 错误处理优化 | T4.1 |

---

## 8. Acceptance Criteria

### AC-1: 机器注册

- [ ] Daemon 启动后生成 UUID
- [ ] Server 返回 machineKey（一次性）
- [ ] UUID 保存到 `~/.pi-collab/daemon/id.json`
- [ ] Daemon 重启后能恢复身份

### AC-2: Agent 创建

- [ ] 用户能在 Web UI 创建 Claude Code Agent
- [ ] Agent 配置（环境变量）能正确注入
- [ ] Claude Code 进程成功 spawn
- [ ] Agent 状态显示为 "online"

### AC-3: 消息通信

- [ ] 用户能在频道发送消息
- [ ] @mention 能触发 Agent
- [ ] Agent 响应显示在频道
- [ ] 消息实时更新（WebSocket）

### AC-4: 看板

- [ ] 能创建看板（默认列：To Do, In Progress, Done）
- [ ] 能创建卡片
- [ ] 能将卡片从一列移动到另一列

### AC-5: Claude Code + MiniMax

- [ ] Claude Code 使用 MiniMax API（通过环境变量）
- [ ] 非交互模式正常工作（-p flag）
- [ ] JSON 输出能正确解析

### AC-6: Auth（可选）

- [ ] 用户能登录获取 token
- [ ] API 请求带 token 可正常访问
- [ ] 无 token 请求返回 401

---

## 9. Open Questions

| Question | 优先级 | 说明 |
|----------|--------|------|
| 是否需要 Custom Agent（支持 Skills）？ | 中 | v1 可不实现 |
| Codex CLI 是否支持？ | 低 | 需单独验证 |

---

## 10. References

- [Design Spec](./2026-05-08-multi-agent-collab-design.md)
- [CLI Agent Docs](./cli-agent.md)