import type { Hono } from "hono";
import { jwtVerify, SignJWT } from "jose";
import { getCookie } from "hono/cookie";
import type { LoginRequest } from "./types.js";
import { getUserByUsername, verifyPassword, createSession, deleteSession } from "./user.js";

function getEnv(key: string): string {
	const val = process.env[key];
	if (!val) throw new Error(`Missing required env var: ${key}`);
	return val;
}

const JWT_SECRET = () => getEnv("HW_JWT_SECRET");
const JWT_EXPIRES_IN = 86400;

async function getSecret(): Promise<Uint8Array> {
	const secret = JWT_SECRET();
	if (secret.length < 32) throw new Error("HW_JWT_SECRET must be at least 32 characters");
	return new TextEncoder().encode(secret);
}

export async function verifyToken(token: string): Promise<{ sub: string; role: string }> {
	try {
		const secret = await getSecret();
		const payload = await jwtVerify(token, secret);
		return payload.payload as { sub: string; role: string };
	} catch {
		throw new Error("Unauthorized");
	}
}

export async function login(req: LoginRequest): Promise<{ token: string; expiresIn: number; mustChangePassword: boolean }> {
	const user = getUserByUsername(req.username);
	if (!user || !user.enabled) throw new Error("Invalid credentials");
	if (!verifyPassword(user, req.password)) throw new Error("Invalid credentials");
	const session = createSession(user.id);
	const secret = await getSecret();
	const token = await new SignJWT({ sub: String(user.id), role: user.role })
		.setProtectedHeader({ alg: "HS256" })
		.setExpirationTime(Math.floor(Date.now() / 1000) + JWT_EXPIRES_IN)
		.setJti(session.id)
		.sign(secret);
	return { token, expiresIn: JWT_EXPIRES_IN, mustChangePassword: user.mustChangePassword === 1 };
}

export function registerAuthRoutes(app: Hono): void {
	app.post("/api/auth/login", async (c) => {
		const body = await c.req.json<LoginRequest>();
		try {
			const result = await login(body);
			const expiresAt = new Date(Date.now() + result.expiresIn * 1000).toUTCString();
			c.header("Set-Cookie", `hw_token=${result.token}; HttpOnly; SameSite=Strict; Path=/; Expires=${expiresAt}`);
			return c.json(result);
		} catch (err) {
			return c.json({ error: err instanceof Error ? err.message : "Login failed" }, 401);
		}
	});

	app.post("/api/auth/logout", async (c) => {
		const token = getCookie(c, "hw_token");
		if (token) {
			try { deleteSession(token); } catch { /* ignore */ }
		}
		c.header("Set-Cookie", "hw_token=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
		return c.json({ ok: true });
	});
}
