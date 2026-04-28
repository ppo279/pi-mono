<script setup lang="ts">
import { ref, onMounted } from "vue";
import { apiGetUsers, apiCreateUser, apiUpdateUser, apiDeleteUser, apiResetPassword, apiLogout } from "./api";

interface User {
  id: number;
  username: string;
  role: "admin" | "operator" | "viewer";
  mustChangePassword: 0 | 1;
  enabled: 0 | 1;
  createdAt: number;
}

const users = ref<User[]>([]);
const showCreate = ref(false);
const newUsername = ref("");
const newPassword = ref("");
const newRole = ref<"admin" | "operator" | "viewer">("viewer");
const error = ref("");

onMounted(async () => {
  try {
    users.value = await apiGetUsers();
  } catch (e) {
    alert("无权限访问");
    window.location.href = "/";
  }
});

async function createUser() {
  try {
    await apiCreateUser(newUsername.value, newPassword.value, newRole.value);
    showCreate.value = false;
    newUsername.value = "";
    newPassword.value = "";
    users.value = await apiGetUsers();
  } catch (e: unknown) {
    error.value = String(e);
  }
}

async function toggleEnabled(user: User) {
  await apiUpdateUser(user.id, { enabled: user.enabled === 1 ? 0 : 1 });
  users.value = await apiGetUsers();
}

async function resetPassword(user: User) {
  const np = prompt(`为 ${user.username} 重置密码（最少8位）：`);
  if (!np || np.length < 8) { alert("密码长度不足"); return; }
  await apiResetPassword(user.id, np);
  alert("密码已重置");
}

async function deleteUser(user: User) {
  if (!confirm(`确认删除用户 ${user.username}？`)) return;
  await apiDeleteUser(user.id);
  users.value = await apiGetUsers();
}

async function logout() {
  await apiLogout();
  window.location.href = "/";
}
</script>

<template>
  <div class="page">
    <header class="header">
      <h1>用户管理</h1>
      <div class="header-actions">
        <button @click="showCreate = true" class="btn-primary">新建用户</button>
        <button @click="logout" class="btn-secondary">退出登录</button>
      </div>
    </header>

    <p v-if="error" class="error">{{ error }}</p>

    <table class="user-table">
      <thead>
        <tr>
          <th>用户名</th>
          <th>角色</th>
          <th>状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="u in users" :key="u.id">
          <td>{{ u.username }}</td>
          <td><span class="badge" :class="u.role">{{ u.role }}</span></td>
          <td>
            <button @click="toggleEnabled(u)" :class="u.enabled === 1 ? 'status-active' : 'status-inactive'">
              {{ u.enabled === 1 ? "启用" : "禁用" }}
            </button>
          </td>
          <td>
            <button @click="resetPassword(u)">重置密码</button>
            <button @click="deleteUser(u)" class="btn-danger">删除</button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="showCreate" class="modal-overlay" @click.self="showCreate = false">
      <div class="modal">
        <h3>新建用户</h3>
        <input v-model="newUsername" placeholder="用户名" />
        <input v-model="newPassword" type="password" placeholder="初始密码（最少8位）" />
        <select v-model="newRole">
          <option value="viewer">viewer</option>
          <option value="operator">operator</option>
          <option value="admin">admin</option>
        </select>
        <p v-if="error" class="error">{{ error }}</p>
        <div class="modal-actions">
          <button @click="createUser" class="btn-primary">创建</button>
          <button @click="showCreate = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 24px; }
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.header-actions { display: flex; gap: 12px; }
.error { color: #e74c3c; font-size: 13px; margin-bottom: 12px; }
.user-table { width: 100%; border-collapse: collapse; }
.user-table th, .user-table td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
.user-table th { background: #f5f5f5; }
.badge { padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.badge.admin { background: #e74c3c; color: #fff; }
.badge.operator { background: #3498db; color: #fff; }
.badge.viewer { background: #95a5a6; color: #fff; }
.btn-danger { color: red; border: none; background: none; cursor: pointer; margin-left: 8px; }
.status-active { color: #27ae60; border: none; background: none; cursor: pointer; }
.status-inactive { color: #95a5a6; border: none; background: none; cursor: pointer; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; }
.modal { background: #fff; border-radius: 8px; padding: 24px; width: 360px; display: flex; flex-direction: column; gap: 12px; }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
input, select { padding: 8px; border: 1px solid #ddd; border-radius: 6px; }
.btn-primary { background: #4a90d9; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; }
.btn-secondary { background: #95a5a6; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; }
</style>
