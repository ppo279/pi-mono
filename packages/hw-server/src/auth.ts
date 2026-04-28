import type { Hono } from "hono";
import { sign, verify } from "jose";
import type { LoginRequest, LoginResponse } from "./types.js";

// ─── Environment ────────────────────────────────────────────────────────

function getEnv(key: string): string {
	const val = process.env[key];
	if (!val) throw new Error(`Missing required env var: ${key}`);
	return val;
}

const ADMIN_USER = () => getEnv("HW_ADMIN_USER");
const ADMIN_PASS = () => getEnv("HW_ADMIN_PASS");
const JWT_SECRET = () => getEnv("HW_JWT_SECRET");
const JWT_EXPIRES_IN = 86400; // 24 hours

// ─── JWT helpers ───────────────────────────────────────────────────────

async function getSecret(): Promise<Uint8Array> {
	const secret = JWT_SECRET();
	if (secret.length < 32) {
		throw new Error("HW_JWT_SECRET must be at least 32 characters");
	}
	return new TextEncoder().encode(secret);
}

export async function verifyToken(token: string): Promise<{ sub: string; role: string }> {
	try {
		const payload = await verify(token, await getSecret());
		return payload as { sub: string; role: string };
	} catch {
		throw new Error("Unauthorized");
	}
}

// ─── Login handler ──────────────────────────────────────────────────────

export async function login(req: LoginRequest): Promise<LoginResponse> {
	if (req.username !== ADMIN_USER()) {
		throw new Error("Invalid credentials");
	}
	if (req.password !== ADMIN_PASS()) {
		throw new Error("Invalid credentials");
	}

	const secret = await getSecret();
	const token = await sign({ sub: req.username, role: "admin" }, secret, {
		exp: Math.floor(Date.now() / 1000) + JWT_EXPIRES_IN,
	});

	return { token, expiresIn: JWT_EXPIRES_IN };
}

// ─── Route registration ────────────────────────────────────────────────

export function registerAuthRoutes(app: Hono): void {
	// POST /api/auth/login
	app.post("/api/auth/login", async (c) => {
		const body = await c.req.json<LoginRequest>();
		try {
			const result = await login(body);
			return c.json(result);
		} catch (err) {
			return c.json({ error: err instanceof Error ? err.message : "Invalid credentials" }, 401);
		}
	});
}
