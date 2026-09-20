// Central runtime config.
// The socket/server URL is resolved from Vite env vars so dev and prod
// can point at different backends. See .env.development / .env.production.
// Falls back to the hosted server if no env var is provided.
export const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || "https://chatapp-dcac.onrender.com";

// REST API base. Same origin as the socket server unless overridden.
export const API_URL = import.meta.env.VITE_API_URL || SOCKET_URL;
