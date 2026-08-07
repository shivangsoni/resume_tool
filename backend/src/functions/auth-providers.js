import { app } from "@azure/functions";

/** Public list of configured Static Web Apps identity providers for the login UI. */
app.http("authProviders", {
  methods: ["GET"], authLevel: "anonymous", route: "auth/providers",
  handler: async () => {
    const configured = String(process.env.AUTH_PROVIDERS || "aad")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const providers = [
      { id: "aad", label: "Microsoft", href: "/.auth/login/aad?post_login_redirect_uri=/dashboard", enabled: configured.includes("aad") },
      { id: "google", label: "Google", href: "/.auth/login/google?post_login_redirect_uri=/dashboard", enabled: configured.includes("google") },
      { id: "github", label: "GitHub", href: "/.auth/login/github?post_login_redirect_uri=/dashboard", enabled: configured.includes("github") },
    ];
    return { jsonBody: { providers }, headers: { "Cache-Control": "public, max-age=60" } };
  },
});
