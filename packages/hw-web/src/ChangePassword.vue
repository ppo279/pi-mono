<script setup lang="ts">
import { ref } from "vue";
import { apiChangePassword } from "./api";

const oldPassword = ref("");
const newPassword = ref("");
const confirmPassword = ref("");
const error = ref("");
const success = ref(false);

async function submit() {
  error.value = "";
  if (newPassword.value.length < 8) { error.value = "新密码至少8位"; return; }
  if (newPassword.value !== confirmPassword.value) { error.value = "两次密码不一致"; return; }
  try {
    await apiChangePassword(oldPassword.value, newPassword.value);
    success.value = true;
    setTimeout(() => window.location.href = "/", 3000);
  } catch (e: unknown) {
    error.value = String(e);
  }
}
</script>

<template>
  <div class="change-pw-page">
    <div class="card">
      <h2>修改密码</h2>
      <p class="subtitle">首次登录，请先修改密码</p>
      <form @submit.prevent="submit">
        <input v-model="oldPassword" type="password" placeholder="当前密码" autocomplete="current-password" />
        <input v-model="newPassword" type="password" placeholder="新密码（最少8位）" autocomplete="new-password" />
        <input v-model="confirmPassword" type="password" placeholder="确认新密码" autocomplete="new-password" />
        <p v-if="error" class="error">{{ error }}</p>
        <p v-if="success" class="success">密码修改成功，3秒后跳转...</p>
        <button type="submit" class="btn">确认修改</button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.change-pw-page { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #f5f5f5; }
.card { background: #fff; border-radius: 12px; padding: 40px; width: 320px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
.card h2 { margin-bottom: 4px; text-align: center; }
.subtitle { color: #888; font-size: 14px; margin-bottom: 24px; text-align: center; }
form { display: flex; flex-direction: column; gap: 12px; }
input { padding: 10px 14px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; width: 100%; box-sizing: border-box; }
.btn { padding: 10px; background: #4a90d9; color: #fff; border: none; border-radius: 8px; font-size: 15px; cursor: pointer; width: 100%; }
.error { color: #e74c3c; font-size: 13px; }
.success { color: #27ae60; font-size: 13px; }
</style>
