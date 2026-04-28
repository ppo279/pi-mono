import { getDb } from "./db.js";
import type { User, Session, RegisterRequest, UpdateUserRequest } from "./types.js";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

const BCRYPT_COST = 12;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function createUser(data: RegisterRequest): User {
  const db = getDb();
  const passwordHash = bcrypt.hashSync(data.password, BCRYPT_COST);
  const createdAt = Date.now();
  const stmt = db.prepare(
    `INSERT INTO users (username, passwordHash, role, createdAt, mustChangePassword, enabled)
     VALUES (?, ?, ?, ?, 0, 1)`
  );
  const result = stmt.run(data.username, passwordHash, data.role, createdAt);
  return getUserById(result.lastInsertRowid as number)!;
}

export function getUserById(id: number): User | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User | undefined;
}

export function getUserByUsername(username: string): User | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username) as User | undefined;
}

export function listUsers(): User[] {
  const db = getDb();
  return db.prepare("SELECT id, username, role, createdAt, mustChangePassword, enabled FROM users ORDER BY createdAt ASC").all() as User[];
}

export function updateUser(id: number, data: UpdateUserRequest): User | undefined {
  const db = getDb();
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (data.role !== undefined) { sets.push("role = ?"); vals.push(data.role); }
  if (data.enabled !== undefined) { sets.push("enabled = ?"); vals.push(data.enabled); }
  if (data.mustChangePassword !== undefined) { sets.push("mustChangePassword = ?"); vals.push(data.mustChangePassword); }
  if (sets.length === 0) return getUserById(id);
  vals.push(id);
  db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  return getUserById(id);
}

export function deleteUser(id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
}

export function resetUserPassword(id: number, newPassword: string): void {
  const db = getDb();
  const hash = bcrypt.hashSync(newPassword, BCRYPT_COST);
  db.prepare("UPDATE users SET passwordHash = ?, mustChangePassword = 0 WHERE id = ?").run(hash, id);
}

export function changeUserPassword(userId: number, oldPassword: string, newPassword: string): boolean {
  const db = getDb();
  const user = getUserById(userId);
  if (!user) return false;
  if (!bcrypt.compareSync(oldPassword, user.passwordHash)) return false;
  const hash = bcrypt.hashSync(newPassword, BCRYPT_COST);
  db.prepare("UPDATE users SET passwordHash = ?, mustChangePassword = 0 WHERE id = ?").run(hash, userId);
  return true;
}

export function verifyPassword(user: User, password: string): boolean {
  return bcrypt.compareSync(password, user.passwordHash);
}

// Session management
export function createSession(userId: number): Session {
  const db = getDb();
  const id = uuidv4();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  db.prepare("INSERT INTO sessions (id, userId, expiresAt) VALUES (?, ?, ?)").run(id, userId, expiresAt);
  return { id, userId, expiresAt };
}

export function getSession(id: string): Session | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM sessions WHERE id = ? AND expiresAt > ?").get(id, Date.now()) as Session | undefined;
}

export function deleteSession(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
}

export function deleteAllSessionsForUser(userId: number): void {
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE userId = ?").run(userId);
}