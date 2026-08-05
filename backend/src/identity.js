export function getPrincipal(request) {
  const encoded = request.headers.get("x-ms-client-principal");
  if (encoded) {
    try {
      const principal = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
      if (principal.userId) return { subject: principal.userId, email: principal.userDetails || null, roles: principal.userRoles || [] };
    } catch {
      return null;
    }
  }
  if (process.env.ALLOW_LOCAL_DEV === "true") return { subject: "local-development-user", email: "local@example.test", roles: ["authenticated"] };
  return null;
}

export function unauthorized() {
  return { status: 401, jsonBody: { error: "Sign in is required." }, headers: { "Cache-Control": "no-store" } };
}
