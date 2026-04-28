import { createRouter, createWebHashHistory } from "vue-router";
import LoginView from "./LoginView.vue";
import UserManage from "./UserManage.vue";
import ChangePassword from "./ChangePassword.vue";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", component: LoginView },
    { path: "/users", component: UserManage },
    { path: "/change-password", component: ChangePassword },
  ],
});
