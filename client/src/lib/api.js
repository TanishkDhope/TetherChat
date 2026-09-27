import { auth } from "../Firebase/firebase";
import { signOut } from "firebase/auth";
import { API_URL } from "./config";

export class ApiError extends Error {
  constructor(status, body, message) {
    super(message || `API Error: ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Perform an authenticated API request to the backend.
 * Automatically injects the Firebase ID token in Authorization header.
 * On 401, signs out the user and redirects to /login.
 * Never logs the token.
 */
export async function apiFetch(path, { method = "GET", body, headers = {} } = {}) {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("Not authenticated");
  }

  const token = await currentUser.getIdToken();
  const requestHeaders = {
    Authorization: `Bearer ${token}`,
    ...headers,
  };

  let formattedBody = body;
  if (body !== undefined && body !== null && !(body instanceof FormData) && typeof body !== "string") {
    formattedBody = JSON.stringify(body);
    if (!requestHeaders["Content-Type"]) {
      requestHeaders["Content-Type"] = "application/json";
    }
  } else if (typeof body === "string" && !requestHeaders["Content-Type"]) {
    requestHeaders["Content-Type"] = "application/json";
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = path.startsWith("http") ? path : `${API_URL}${normalizedPath}`;

  const res = await fetch(url, {
    method,
    headers: requestHeaders,
    body: formattedBody,
  });

  if (res.status === 401) {
    try {
      await signOut(auth);
    } catch {
      // ignore signOut error during redirect
    }
    window.location.href = "/login";
    throw new ApiError(401, null, "Session expired. Redirecting to login.");
  }

  let data = null;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const errorMsg =
      (typeof data === "object" && data !== null && (data.error || data.message)) ||
      res.statusText ||
      `Request failed with status ${res.status}`;
    throw new ApiError(res.status, data, errorMsg);
  }

  return data;
}
