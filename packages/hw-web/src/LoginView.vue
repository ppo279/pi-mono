<script setup lang="ts">
import { ref } from "vue";
import { apiLogin, setToken } from "./api";

const username = ref("");
const password = ref("");
const error = ref("");
const loading = ref(false);
const emit = defineEmits<{ success: [] }>();

async function handleLogin() {
  if (!username.value || !password.value) {
    error.value = "请输入用户名和密码";
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const { token } = await apiLogin(username.value, password.value);
    setToken(token);
    emit("success");
  } catch (err) {
    error.value = String(err);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <h2>作业批改系统</h2>
      <p class="subtitle">请先登录</p>
      <form @submit.prevent="handleLogin">
        <input
          v-model="username"
          class="input"
          type="text"
          placeholder="用户名"
          autocomplete="username"
        />
        <input
          v-model="password"
          class="input"
          type="password"
          placeholder="密码"
          autocomplete="current-password"
        />
        <button class="btn" type="submit" :disabled="loading">
          {{ loading ? "登录中..." : "登录" }}
        </button>
      </form>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #f5f5f5;
}
.login-card {
  background: #fff;
  border-radius: 12px;
  padding: 40px;
  width: 320px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.login-card h2 {
  text-align: center;
  margin-bottom: 8px;
  color: #1a1a1a;
}
.subtitle {
  text-align: center;
  color: #888;
  font-size: 14px;
  margin-bottom: 24px;
}
form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.input {
  padding: 10px 14px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  width: 100%;
}
.btn {
  padding: 10px;
  background: #4a90d9;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  cursor: pointer;
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.error {
  color: #e74c3c;
  font-size: 13px;
  text-align: center;
  margin-top: 8px;
}
</style>