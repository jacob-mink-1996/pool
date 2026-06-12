const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function createLocalTrustConfig({ host = "127.0.0.1", authToken = "" } = {}) {
  const normalizedHost = String(host || "127.0.0.1").trim();
  const token = String(authToken || "").trim();
  const loopback = isLoopbackHost(normalizedHost);

  if (!loopback && !token) {
    throw new Error("FLOOP_AUTH_TOKEN is required when FLOOP_HOST is non-loopback");
  }

  return {
    host: normalizedHost,
    mode: token ? "token" : "loopback",
    token,
    loopback,
  };
}

export function isAuthorizedRequest(request, trustConfig) {
  if (trustConfig.mode === "loopback") {
    return true;
  }

  const authorization = request.headers.authorization || "";
  const headerToken = request.headers["x-floop-auth"] || "";
  return authorization === `Bearer ${trustConfig.token}` || headerToken === trustConfig.token;
}

export function isLoopbackHost(host) {
  return LOOPBACK_HOSTS.has(String(host || "").trim().toLowerCase());
}
