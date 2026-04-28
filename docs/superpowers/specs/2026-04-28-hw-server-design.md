# hw-server 设计文档

**日期：** 2026-04-28
**项目：** 小学作业拍照 → OCR → 推理 → 答案生成系统
**状态：** 已确认

---

## 1. 概述

### 背景

- `hw-web`（Vue 3 前端）已实现图片上传、实时 SSE 状态显示、KaTeX 数学渲染
- `pi-homework` 已实现完整管道：preprocess → OCR → Layout → Parser → Agent → Validator
- 前端调用的 `/api/assess/stream` 后端接口缺失，需要新建

### 目标

- 新建 `packages/hw-server`（Hono 后端），独立部署
- 提供 `/api/assess/stream` SSE 接口，桥接前端与 `pi-homework` 管道
- 添加单机单用户认证（JWT），支持公网 VPS 部署

---

## 2. 系统架构

```
用户 (手机浏览器)
    ↓
hw-web (Vue 3 SPA, port 5173 dev / 独立部署)
    ↓ POST /api/assess/stream (Authorization: Bearer <jwt>)
hw-server (Hono, port 3000, 独立进程)
    ↓ 调用
pi-homework (runPipeline)
    ↓
VITA OCR / DeepSeek LLM (云服务)
```

### 技术选型

| 组件 | 技术 | 理由 |
|------|------|------|
| 后端框架 | Hono | 轻量、极快、TypeScript 原生、SSE 支持好 |
| 认证 | JWT (jose) | 标准方案，天然支持 SSE 流 |
| OCR/LLM | pi-homework 内置 provider | 复用现有实现 |
| 部署 | 独立进程 | 与前端解耦，可独立扩缩容 |

---

## 3. API 设计

### 3.1 POST /api/auth/login

**认证：** 否

**请求体：**
```json
{
  "username": "admin",
  "password": "yourpassword"
}
```

**成功响应 (200)：**
```json
{
  "token": "<jwt>",
  "expiresIn": 86400
}
```

**失败响应 (401)：**
```json
{
  "error": "Invalid credentials"
}
```

### 3.2 GET /api/health

**认证：** 否

**响应 (200)：**
```json
{
  "status": "ok",
  "timestamp": 1745846400
}
```

### 3.3 POST /api/assess/stream

**认证：** Bearer JWT

**请求体：**
```json
{
  "image": "<base64>",
  "grade": "小学三年级",
  "subject": "数学"
}
```

**SSE 事件流（与 hw-web 现有解析逻辑一致）：**

```
event: step
data: {"state": "OCR_DONE"}

event: ocr
data: {"preview": "识别文字预览"}

event: thinking
data: {"text": "AI 推理过程"}

event: questions
data: {"questions": [{...}]}

event: done
data: {"result": {"questions": [...], "processingTime": 1234}}

event: error
data: {"error": "错误信息"}
```

**错误响应 (401)：**
```json
{
  "error": "Unauthorized"
}
```

---

## 4. 目录结构

```
packages/hw-server/
  src/
    index.ts          # Hono 入口，路由注册，中间件挂载
    auth.ts           # /api/auth/login，JWT 签发与验证中间件
    assess.ts         # /api/assess/stream SSE 接口，调用 pi-homework
    client.ts         # pi-homework client 封装（OCR provider 注册等）
    types.ts          # 类型定义（请求/响应数据结构）
  test/
    auth.test.ts      # 登录、JWT 验证测试
    assess.test.ts    # SSE 流、管道调用测试
  package.json
  tsconfig.json
  tsconfig.build.json
  vite.config.ts      # dev + build 配置
```

---

## 5. 配置（环境变量）

| 变量 | 说明 | 示例 | 必填 |
|------|------|------|------|
| `HW_ADMIN_USER` | 管理员用户名 | `admin` | 是 |
| `HW_ADMIN_PASS` | 管理员密码 | `yourpassword` | 是 |
| `HW_JWT_SECRET` | JWT 签名密钥（建议 32+ 字符） | `randomstring` | 是 |
| `PORT` | 服务端口 | `3000` | 否，默认 3000 |
| `TENCENT_SECRET_ID` | 腾讯云 OCR（可选） | - | OCR provider 注册后必填 |
| `TENCENT_SECRET_KEY` | 腾讯云 OCR（可选） | - | OCR provider 注册后必填 |
| `OPENAI_API_KEY` | LLM 调用（可选） | - | Agent 必填 |

---

## 6. 前端改动 (hw-web)

### 6.1 新增登录页

- 独立 `LoginView.vue`，打开即显示（不展示任何功能入口）
- 输入用户名 + 密码，调用 `POST /api/auth/login`
- 成功后将 JWT 存入 `localStorage`
- 登录成功后切换到主功能视图（复用现有 App.vue）

### 6.2 请求拦截

- 所有 API 请求自动带 `Authorization: Bearer <token>` header
- 响应 401 → 清除 localStorage，跳转登录页

### 6.3 API URL

- 开发环境：`http://localhost:3000`
- 生产环境：`.env` 配置 `VITE_API_BASE_URL`

---

## 7. 错误处理

| 场景 | 后端行为 | 前端行为 |
|------|----------|----------|
| 未登录 / token 无效 | 401 | 跳转登录页 |
| 请求体缺失字段 | 400 + 错误信息 | 显示错误 |
| OCR / Agent 异常 | SSE `error` 事件 | PipelineStatus 高亮红色，显示错误信息 |
| 管道内部 ERROR 状态 | SSE `done` with state: ERROR | 显示错误 |

---

## 8. 实施步骤

1. 创建 `packages/hw-server` 目录骨架
2. 实现 `auth.ts`：登录接口 + JWT 中间件
3. 实现 `assess.ts`：SSE 接口 + pi-homework 调用
4. 实现 `client.ts`：OCR provider 注册
5. 实现 `index.ts`：Hono 入口，路由挂载
6. 添加环境变量配置与校验
7. 编写单元测试
8. 前端改动：新增 LoginView，API URL 指向 localhost:3000，添加拦截器

---

## 9. 设计决策记录

| 决策 | 选择 | 备选方案 | 理由 |
|------|------|----------|------|
| 后端框架 | Hono | Express/Fastify | 轻量、SSE 友好、与 pi-homework 技术栈一致 |
| 部署方式 | 独立服务 | 放入 hw-web | 前端后端职责分离，可独立部署 |
| 认证方式 | JWT | Session Cookie | JWT 天然适合无状态的 SSE 流 |
| 用户模型 | 单机单用户（环境变量） | 数据库多用户 | 现阶段够用，简化运维 |
| 未登录体验 | 直接显示登录框 | 先展示功能再登录 | 简洁，避免功能泄露 |
