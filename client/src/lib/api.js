import { API_URL } from "./config";
import { auth } from "../Firebase/firebase";

// Thin JSON fetch wrapper for the Express API. Attaches the Firebase ID token
// when a user is signed in; the server does not verify it yet, but will once
// the Postgres migration adds verifyFirebaseToken — no client change needed.
export async function apiFetch(path, { method = "GET", body, signal } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const user = auth.currentUser;
  if (user) {
    try {
      headers.Authorization = `Bearer ${await user.getIdToken()}`;
    } catch {
      // token refresh failed — send unauthenticated; the server decides
    }
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    throw new Error(`${method} ${path} failed with ${res.status}`);
  }
  return res.json();
}
