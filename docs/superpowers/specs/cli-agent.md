# CLI Agent Documentation

**Agent Type:** Claude Code / Codex CLI

## Claude Code Command Reference

### Verified Flags (Evidence: `claude --help`)

| Flag | 说明 | 用于 |
|------|------|------|
| `-p, --print` | 非交互模式，输出后退出 | 自动化必需 |
| `--output-format <format>` | 输出格式：`text`, `json`, `stream-json` | 结构化解析 |
| `--input-format <format>` | 输入格式：`text`, `stream-json` | **必须用 `stream-json` 才能发送 JSON** |
| `--no-session-persistence` | 不保存会话 | 每次独立运行 |
| `--dangerously-skip-permissions` | 跳过所有权限检查（无需确认） | 自动化必需 |
| `--allow-dangerously-skip-permissions` | 允许绕过权限（需手动开启） | 非自动化 |
| `--replay-user-messages` | 将 stdin 消息回显到 stdout 用于确认 | **自动化必需**，需配合 `--input-format=stream-json` 和 `--output-format=stream-json` |
| `--add-dir <directories>` | 允许访问的目录 | 工作区配置 |
| `--name <name>` | Agent 显示名称 | 标识 |
| `--model <model>` | 指定模型 | API 配置 |
| `--allowed-tools <tools>` | 允许的工具列表 | 限制权限 |
| `--system-prompt <prompt>` | 系统提示 | 自定义行为 |

### Environment Variables

Claude Code 通过环境变量读取 API 配置：

| 变量 | 说明 | 示例 |
|------|------|------|
| `ANTHROPIC_BASE_URL` | API 端点 | `https://api.minimaxi.com/anthropic` |
| `ANTHROPIC_AUTH_TOKEN` | API Key | `sk-cp-...` |
| `ANTHROPIC_MODEL` | 默认模型 | `M2.7-highspeed` |
| `ANTHROPIC_SMALL_FAST_MODEL` | 小型快速模型 | `M2.7-highspeed` |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Sonnet 模型 | `M2.7-highspeed` |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | Opus 模型 | `M2.7-highspeed` |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | Haiku 模型 | `M2.7-highspeed` |

### Spawn Example (Bun)

```typescript
import { spawn } from 'bun';

const proc = spawn({
  cmd: ['claude', '-p',
    '--output-format', 'stream-json',
    '--input-format', 'stream-json',
    '--no-session-persistence',
    '--dangerously-skip-permissions',
    '--replay-user-messages',
    '--add-dir', '/workspace',
    '--name', 'claude-dev',
  ],
  env: {
    ...process.env,
    'ANTHROPIC_BASE_URL': 'https://api.minimaxi.com/anthropic',
    'ANTHROPIC_AUTH_TOKEN': 'sk-cp-DCPTo-...',
    'ANTHROPIC_MODEL': 'M2.7-highspeed',
    'hasCompletedOnboarding': 'true',
  },
  stdin: 'pipe',
  stdout: 'pipe',
  stderr: 'piped',
});

// 发送消息
const writer = proc.stdin.getWriter();
await writer.write(JSON.stringify({ type: 'user', content: 'Hello' }) + '\n');

// 读取响应
for await (const line of proc.stdout) {
  const msg = JSON.parse(line);
  console.log(msg);
}
```

## Message Format

### Daemon → Claude Code (stdin)

```json
{"type": "user", "content": "@agent-name 帮我写一个函数"}
```

### Claude Code → Daemon (stdout)

```json
{"type": "content", "content": [{"type": "text", "text": "好的，我来帮你写..."}]}
{"type": "content", "content": [{"type": "tool_use", "name": "Bash", "input": {"command": "ls -la"}}]}
{"type": "content", "content": [{"type": "text", "text": "完成！"}]}
{"type": "done"}
```

### 消息类型

| type | 方向 | 说明 |
|------|------|------|
| `user` | Daemon → Claude | 用户消息 |
| `content` | Claude → Daemon | 内容块（text 或 tool_use） |
| `done` | Claude → Daemon | 响应完成 |

### Tool Result Handling

当 Claude Code 使用工具时，Daemon 需要：
1. 检测 `tool_use` 类型的内容块
2. 执行工具（bash/read/write/edit）
3. 将结果写回 stdin

```json
{"type": "tool_result", "tool": "Bash", "result": "total 64\ndrwxr-xr-x  5 user user 4096 May  9 10:00 ."}
```

## Codex CLI (未验证)

Codex CLI 可能支持类似参数，但需要单独验证。

**已知类似选项（待验证）：**
- `--output-format json`
- `--api-key` 替代环境变量

---

## 已知限制

1. **ANSI 转义码** — Claude Code 输出可能包含颜色代码，需要过滤
2. **stderr** — stderr 用于错误输出，非 JSON 格式
3. **PTY 不需要** — 使用 `-p` 模式配合 stdin/stdout pipe 时不需要 PTY
4. **必须 `--replay-user-messages`** — 否则 Daemon 无法确认消息已被 Claude Code 接收