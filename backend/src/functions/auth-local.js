import { app } from "@azure/functions";
import { findLocalAccountByUsername, registerLocalAccount } from "../database.js";
import {
  hashPassword,
  issueSessionToken,
  validateRegistration,
  verifyPassword,
  verifySessionToken,
  readBearerToken,
  normalizeUsername,
} from "../session.js";

function sessionResponse(account) {
  const token = issueSessionToken({
    subject: account.subject || account.ExternalSubject,
    email: account.email || account.Email,
    username: account.username || account.Username,
  });
  return {
    status: 200,
    jsonBody: {
      token,
      user: {
        userId: account.subject || account.ExternalSubject,
        userDetails: account.email || account.Email || account.username || account.Username,
        userRoles: ["authenticated"],
        identityProvider: "password",
      },
    },
    headers: { "Cache-Control": "no-store" },
  };
}

app.http("authRegister", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth/register",
  handler: async (request, context) => {
    try {
      const body = await request.json().catch(() => ({}));
      const validated = validateRegistration(body);
      if (!validated.ok) return { status: 400, jsonBody: { error: validated.error } };
      const subject = `password:${validated.username.toLowerCase()}`;
      const account = await registerLocalAccount({
        username: validated.username,
        email: validated.email,
        passwordHash: hashPassword(validated.password),
        subject,
      });
      return sessionResponse({
        subject: account.subject,
        email: account.email,
        username: account.username,
      });
    } catch (error) {
      context.error("authRegister failed", error);
      const status = error?.status === 409 ? 409 : 400;
      return { status, jsonBody: { error: error instanceof Error ? error.message : "Registration failed." } };
    }
  },
});

app.http("authLogin", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth/login",
  handler: async (request, context) => {
    try {
      const body = await request.json().catch(() => ({}));
      const username = normalizeUsername(body.username);
      const password = String(body.password || "");
      if (!username || !password) {
        return { status: 400, jsonBody: { error: "Username and password are required." } };
      }
      const account = await findLocalAccountByUsername(username);
      if (!account || !verifyPassword(password, account.PasswordHash)) {
        return { status: 401, jsonBody: { error: "Invalid username or password." } };
      }
      return sessionResponse({
        subject: account.ExternalSubject,
        email: account.Email,
        username: account.Username,
      });
    } catch (error) {
      context.error("authLogin failed", error);
      return { status: 400, jsonBody: { error: error instanceof Error ? error.message : "Sign in failed." } };
    }
  },
});

app.http("authMe", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "auth/me",
  handler: async (request) => {
    const token = readBearerToken(request);
    const session = token ? verifySessionToken(token) : null;
    if (!session) return { status: 401, jsonBody: { error: "Sign in is required." }, headers: { "Cache-Control": "no-store" } };
    return {
      jsonBody: {
        user: {
          userId: session.subject,
          userDetails: session.email || session.username || session.subject,
          userRoles: ["authenticated"],
          identityProvider: "password",
        },
      },
      headers: { "Cache-Control": "no-store" },
    };
  },
});

app.http("authLogout", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth/logout",
  handler: async () => ({ status: 200, jsonBody: { ok: true }, headers: { "Cache-Control": "no-store" } }),
});
