// Central runtime config.
// The socket/server URL is resolved from Vite env vars so dev and prod
// can point at different backends. See .env.development / .env.production.
// Falls back to http://localhost:4000 if no env var is provided.
export const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";

// REST API base. Same origin as the socket server unless overridden.
export const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:4000";
