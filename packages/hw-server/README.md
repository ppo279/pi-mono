# @mariozechner/pi-hw-server

作业批改后端服务 — Hono + SSE + JWT 认证

## 快速开始

```bash
# 安装依赖（在 monorepo 根目录）
pnpm install

# 开发（直接运行 ts）
cd packages/hw-server
pnpm dev

# 生产构建
pnpm build
node dist/index.js
```

## 环境变量

复制 `.env.example` 为 `.env` 并配置：

| 变量 | 说明 | 必填 | 示例 |
|------|------|------|------|
| HW_ADMIN_USER | 管理员用户名 | 是 | admin |
| HW_ADMIN_PASS | 管理员密码 | 是 | yourpassword |
| HW_JWT_SECRET | JWT 签名密钥（32+ 字符） | 是 | randomstring |
| PORT | 服务端口 | 否，默认 3000 | 3000 |
| TENCENT_MAAS_API_KEY | 腾讯 Maas API Key | 否（不填走 mock） | - |
| TENCENT_SECRET_ID | 腾讯云 OCR SecretId | 否 | - |
| TENCENT_SECRET_KEY | 腾讯云 OCR SecretKey | 否 | - |

## API 端点

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | /api/auth/login | 否 | 登录，返回 JWT |
| GET | /api/health | 否 | 健康检查 |
| POST | /api/assess/stream | Bearer JWT | SSE 流式作业分析 |

## 登录示例

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"yourpassword"}'
# 返回: {"token":"eyJ...","expiresIn":86400}
```

## 作业分析示例

```bash
# 先获取 token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"yourpassword"}' | jq -r '.token')

# 然后上传图片分析
curl -X POST http://localhost:3000/api/assess/stream \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"image":"<base64>","grade":"小学三年级","subject":"数学"}'
```

## Mock 模式

不配置 `TENCENT_MAAS_API_KEY` 时，管道走 mock 路径（返回预定义题目），方便本地调试。