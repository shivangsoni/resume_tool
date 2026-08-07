import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const USERNAME_RE = /^[a-zA-Z0-9_]{3,64}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sessionSecret() {
  const configured = String(process.env.AUTH_SESSION_SECRET || "").trim();
  if (configured) return configured;
  // Stable fallback for local/dev when secret is unset (not for production).
  return createHash("sha256").update(`applypilot-dev:${process.env.WEBSITE_SITE_NAME || "local"}`).digest("hex");
}

export function normalizeUsername(username) {
  return String(username || "").trim();
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function validateRegistration({ username, email, password }) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = String(password || "");
  if (!USERNAME_RE.test(normalizedUsername)) {
    return { ok: false, error: "Username must be 3–64 characters (letters, numbers, underscore)." };
  }
  if (!EMAIL_RE.test(normalizedEmail)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (normalizedPassword.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  if (normalizedPassword.length > 200) {
    return { ok: false, error: "Password is too long." };
  }
  return { ok: true, username: normalizedUsername, email: normalizedEmail, password: normalizedPassword };
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 64).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, expected] = parts;
  const actual = scryptSync(password, salt, 64).toString("base64url");
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(actual);
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

function encodePart(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodePart(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

export function issueSessionToken({ subject, email, username }) {
  const payload = {
    sub: subject,
    email: email || null,
    username: username || null,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const body = encodePart(payload);
  const signature = createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifySessionToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  const signatureBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (signatureBuf.length !== expectedBuf.length || !timingSafeEqual(signatureBuf, expectedBuf)) return null;
  try {
    const payload = decodePart(body);
    if (!payload?.sub || !payload?.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      subject: String(payload.sub),
      email: payload.email ? String(payload.email) : null,
      username: payload.username ? String(payload.username) : null,
      roles: ["authenticated"],
    };
  } catch {
    return null;
  }
}

export function readBearerToken(request) {
  const header = request.headers.get("authorization") || request.headers.get("Authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}
