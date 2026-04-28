# 2026-04-28 用户系统 + RBAC 权限设计

## 1. 背景与目标

hw-web + hw-server 是一个作业评估系统，目前只有单管理员硬编码（admin/admin）。本次设计扩展为多用户 + 基于角色的权限控制系统（RBAC），为后续作业评估功能提供用户和权限基础设施。

## 2. 技术栈

- **框架**：Hono（Node.js）
- **语言**：TypeScript
- **数据库**：SQLite + better-sqlite3
- **认证**：JWT（jose），bcrypt 密码哈希
- **前端**：Vue3 + Vite（现有不变）

## 3. 数据库设计

### 3.1 users 表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTOINCREMENT | 用户 ID |
| username | TEXT | UNIQUE, NOT NULL | 用户名 |
| passwordHash | TEXT | NOT NULL | bcrypt 哈希 |
| role | TEXT | NOT NULL, DEFAULT 'viewer' | admin / operator / viewer |
| createdAt | INTEGER | NOT NULL | 创建时间（unix ms） |
| mustChangePassword | INTEGER | NOT NULL, DEFAULT 0 | 首次登录是否必须改密（0/1） |
| enabled | INTEGER | NOT NULL, DEFAULT 1 | 账号是否启用（0/1） |

### 3.2 sessions 表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID |
| userId | INTEGER | FK → users.id | 关联用户 |
| expiresAt | INTEGER | NOT NULL | 过期时间（unix ms） |

## 4. 角色权限矩阵

| 权限 | admin | operator | viewer |
|------|-------|----------|--------|
| 用户管理（CRUD）| ✅ | ❌ | ❌ |
| 作业评估 | ✅ | ✅ | ❌ |
| 查看结果 | ✅ | ✅ | ✅ |
| 健康检查 | ✅ | ✅ | ✅ |

## 5. API 设计

### 5.1 认证相关

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | /api/auth/login | 无 | 登录，返回 JWT Cookie |
| POST | /api/auth/logout | Cookie | 登出，清理 session |
| GET | /api/me | Cookie | 获取当前用户信息 |
| PUT | /api/me/password | Cookie | 修改当前用户密码 |

### 5.2 用户管理（仅 admin）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/users | 创建用户 |
| GET | /api/users | 获取用户列表 |
| PUT | /api/users/:id | 更新用户信息 |
| DELETE | /api/users/:id | 删除用户 |
| PUT | /api/users/:id/password | 重置用户密码 |

### 5.3 业务 API（权限保护）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /api/health | 公开 | 健康检查 |
| POST | /api/assess | operator+ | 作业评估（后续实现） |

## 6. 安全设计

### 6.1 JWT 存储
- JWT 存入 `httpOnly + Secure + SameSite=Strict` Cookie
- 不再使用 localStorage
- 前端通过 `/api/me` 获取用户信息

### 6.2 密码安全
- bcrypt，cost factor 12
- 首次登录 `mustChangePassword=1`，访问业务 API 前强制跳转到改密页
- admin 可重置任意用户密码

### 6.3 登录限流
- 同一 IP 5 分钟内最多 5 次失败尝试
- 超出后返回 429 Too Many Requests

### 6.4 速率限制实现
- 使用 Hono 中间件拦截所有 `/api/auth/login` 请求
- IP + 时间窗口桶算法

## 7. 前端改动

### 7.1 登录页
- 用户名 + 密码，明文传输（HTTPS 保障）
- 首次登录强制改密流程：登录成功后检测 `mustChangePassword`，跳转改密页
- 登录失败显示错误信息

### 7.2 用户管理页（admin 专属）
- 用户列表（用户名/角色/创建时间/状态）
- 新建用户表单（用户名/初始密码/角色）
- 编辑用户（修改角色/启用状态）
- 删除用户（二次确认）
- 重置密码

### 7.3 改密页
- 当前密码 + 新密码 + 确认密码
- 新密码最小长度 8 位

## 8. 环境变量

```
# hw-server
HW_JWT_SECRET=<min 32 chars>
HW_ADMIN_USER=<initial admin username>
HW_ADMIN_PASS=<initial admin password>
HW_DATABASE_PATH=./data/hw.db

# hw-web（构建时注入）
VITE_API_BASE_URL=http://localhost:3000
```

## 9. 项目结构

```
packages/hw-server/src/
├── index.ts              # Hono 入口
├── auth.ts              # 认证逻辑（登录/登出/JWT）
├── db.ts                # SQLite 数据库初始化
├── user.ts              # 用户 CRUD
├── middleware/
│   ├── auth.ts          # JWT Cookie 鉴权中间件
│   └── rbac.ts          # 角色权限中间件
├── types.ts             # 类型定义
└── rate-limit.ts        # 登录限流

packages/hw-web/src/
├── api.ts               # 移除 token localStorage，改用 Cookie
├── LoginView.vue        # 登录页
├── UserManage.vue       # 用户管理页（admin）
├── ChangePassword.vue   # 改密页
└── types.ts             # 前端类型
```

## 10. 实现顺序

1. **数据库层**（db.ts + users 表 + sessions 表）
2. **用户 CRUD API**（创建/查询/更新/删除用户）
3. **登录限流 + 登录 API**（login + JWT Cookie 设置）
4. **JWT 鉴权中间件 + RBAC 中间件**
5. **用户管理 API**（GET/POST/PUT/DELETE /api/users）
6. **登出 + /api/me**（登出和用户信息 API）
7. **前端登录页**（明文传输 + 首次强制改密）
8. **前端用户管理页**（admin 专属）
9. **前端改密页**

## 11. 注意事项

- admin 账号在首次启动时通过环境变量 `HW_ADMIN_USER` / `HW_ADMIN_PASS` 自动创建
- 数据库文件保存在 `data/hw.db`，`.gitignore` 忽略该文件
- 迁移期间保留原有的单 admin 硬编码逻辑作为兜底
