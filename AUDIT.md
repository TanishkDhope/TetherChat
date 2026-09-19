# TetherChat — Codebase Audit

**Date:** 2026-09-16
**Scope:** `client/` (React 18 + Vite 6 + Firebase + Socket.IO client), `server/` (Express + Socket.IO), repo config/docs.
**Mode:** Analysis only. No code was modified.

Severity scale: **Critical** (exploitable / data loss / broken core flow) · **High** (real bug or serious risk on a main path) · **Medium** (quality/perf/maintainability problem with user-visible or operational impact) · **Low** (hygiene).

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Security](#2-security)
3. [Bugs & Logic Issues](#3-bugs--logic-issues)
4. [Architecture & Structure](#4-architecture--structure)
5. [Code Quality](#5-code-quality)
6. [Performance](#6-performance)
7. [Dependencies](#7-dependencies)
8. [Tests](#8-tests)
9. [Documentation](#9-documentation)
10. [Configuration & Environment](#10-configuration--environment)
11. [Top Fixes If Time Is Limited](#11-top-fixes-if-time-is-limited)

---

## 1. Executive Summary

TetherChat is a two-part app: a React SPA that talks directly to Firebase (Auth + Firestore) and Cloudinary, and a stateless Socket.IO relay server. The relay server performs **no authentication, no authorization, and no input validation**; every event is trusted and most are broadcast to every connected client. Identity across the whole system is keyed on a user-chosen `displayName` (not the Firebase UID), so impersonation, collisions, and history loss on rename are all possible. Message persistence uses a *last-writer-wins* full overwrite of a single Firestore document, which will silently drop messages. Auth on the client is a `localStorage` flag with no route guard on `/chat/:roomId` or `/vc`.

The codebase has **zero tests**, 76 client and 12 server `npm audit` findings (3 critical), ~6 unused dependencies (including the Node `cloudinary` SDK in a browser bundle), a 1,895-line `Home.jsx`, and a deleted root README in the working tree.

Counts by severity: **Critical 7 · High 24 · Medium 31 · Low 18**.

---

## 2. Security

### Critical

- **[SEC-1] Socket.IO server has no authentication or authorization — every event is trusted**
  `server/server.js:28-203`
  Any client can `emit("join", { displayName: "<anyone>" })` and appear as that user, `emit("deleteGroup", id)` to delete any group for all clients, `emit("message-notif", …, anySocketId, …)` to spoof notifications, or `emit("send-message", …, anyRoomId)` after `joinRoom` to any room id.
  **Why it matters:** Impersonation, spam, and cross-room injection with zero effort; the server is the only place that could enforce identity and it enforces nothing.
  **Fix:** Verify a Firebase ID token in `io.use((socket, next) => …)` via `firebase-admin`'s `verifyIdToken`, store `socket.data.uid`/`email`, and derive identity server-side for every event (ignore client-supplied `displayName`/`email`). Check room membership before relaying `send-message`/`typing`, and check `createdBy` before honoring `deleteGroup`.

- **[SEC-2] Friend requests, acceptances, and group creation are broadcast to every connected client, leaking emails and profile data**
  `server/server.js:56-58, 66-72`
  ```js
  socket.on("createGroup", (group) => { socket.broadcast.emit("groupCreated", group); });
  socket.on("friendRequest", (payload) => { socket.broadcast.emit("friendRequest", payload); });
  socket.on("friendAccepted", (payload) => { socket.broadcast.emit("friendAccepted", payload); });
  ```
  The client filters on `toEmail` (`client/src/pages/Home.jsx:376-399`) but every browser still receives every payload (sender email, recipient email, profile URL, full group member lists).
  **Why it matters:** Privacy leak of the whole social graph to anyone with devtools open; trivially scrapeable.
  **Fix:** Map email → socket id server-side (already implicit in `onlineUsers`) and use `io.to(targetSocketId).emit(...)`. For groups, iterate `group.members` and emit only to those sockets.

- **[SEC-3] Firestore is written directly from the client with cross-user writes, and no security rules are checked into the repo**
  `client/src/hooks/useFirestore.js:146-186` (`sendFriendRequest` writes to `users/<toEmail>`; `acceptFriendRequest` writes to the requester's doc), `client/src/hooks/useFirestore.js:135-141` (`deleteGroup` on any id)
  No `firestore.rules` / `firebase.json` exists anywhere in the repo. For the current code to work, rules must allow an authenticated user to write to *other users'* `users/*` docs and to any `groups/*` and `chats/*` doc.
  **Why it matters:** Any signed-in user can edit anyone's profile, friend list, groups, or chat history straight from the Firebase SDK. Also `users` docs are keyed by raw email, so IDs themselves are PII.
  **Fix:** Add `firestore.rules` to the repo and deploy them. Model friend requests as a separate `friendRequests/{id}` collection where `to`/`from` are validated against `request.auth.token.email`, and gate `chats/{pair}` on the pair containing the caller's UID. Key `users` by `uid`, not email.

- **[SEC-4] Unauthenticated, unsigned Cloudinary upload preset hardcoded in three places**
  `client/src/pages/SignUp.jsx:36-39`, `client/src/pages/Home.jsx:536-538`, `client/src/pages/Home.jsx:612-614`
  ```js
  formData.append("upload_preset", "ml_default");
  axios.post("https://api.cloudinary.com/v1_1/dzlr1rtln/image/upload", formData)
  ```
  **Why it matters:** Anyone can upload unlimited files of any type to your Cloudinary account (storage/bandwidth bill, hosting of abusive content under your domain). No size/type validation is done client-side either (`SignUp.jsx:105-107`, `Home.jsx:514-520`).
  **Fix:** Move uploads behind the Express server using a *signed* upload (`cloudinary.utils.api_sign_request` with `CLOUDINARY_API_SECRET` from env), enforce `max file size`, `allowed_formats`, and `resource_type: image` on the preset. Extract the duplicated code into one `uploadImage(file)` helper.

### High

- **[SEC-5] Client-side "auth" is a forgeable localStorage flag and two routes have no guard at all**
  `client/src/hooks/useGetUserInfo.js:2-11`, `client/src/App.jsx:14-20`, `client/src/pages/Chat.jsx` (no `isAuth` check), `client/src/pages/video-call.jsx` (no check)
  `isAuth` is read from `localStorage["auth-info"]`; `Home` redirects when false (`Home.jsx:299-303`) but `/chat/:roomId` and `/vc` never check. Firebase's real auth state (`onAuthStateChanged`) is never observed, so token expiry or sign-out on another tab is invisible.
  **Fix:** Create a `<RequireAuth>` wrapper using `onAuthStateChanged(auth, …)` (or a `useAuth` context) and wrap `/home`, `/chat/:roomId`, `/vc` in it. Drop `isAuth` from localStorage.

- **[SEC-6] Entire `users` collection (all emails + names + avatars) is fetched by every client and cached in localStorage**
  `client/src/hooks/useFirestore.js:48-59` (`getRegisteredUsers`), `client/src/pages/Home.jsx:313-323`
  **Why it matters:** Any user can dump the full user directory. It is also unbounded (see PERF-3).
  **Fix:** Remove `getRegisteredUsers` from the client (it's only used to populate `users` state, which the UI barely uses); provide a server-side search endpoint that returns limited fields for a query prefix, or use a Firestore query with `limit()` on a lowercase name index.

- **[SEC-7] CORS `origin: "*"` on the Socket.IO server**
  `server/server.js:19-24, 26`
  **Why it matters:** Combined with SEC-1, any website can open a socket to your server as any user. Also pairs with `app.use(cors())` (all origins) on HTTP.
  **Fix:** `origin: process.env.CLIENT_ORIGIN` (e.g. `https://tetherchat.vercel.app`, `http://localhost:5173`).

- **[SEC-8] No rate limiting or payload size limits on socket events**
  `server/server.js` (all handlers)
  A client can flood `send-message`, `typing`, or `join` in a loop; message objects are relayed verbatim with no size cap.
  **Fix:** Set `maxHttpBufferSize` on the `Server` options (e.g. `1e5`), and add a per-socket token bucket (e.g. `rate-limiter-flexible`) for `send-message`/`typing`.

- **[SEC-9] Chat history stored in plaintext localStorage and never cleared per-room**
  `client/src/pages/Chat.jsx:340-344`, `client/src/pages/Home.jsx:342-345`
  Messages persist in the browser under `messages_<roomId>` indefinitely (until `localStorage.clear()` at sign-out).
  **Why it matters:** On shared devices, anyone who opens the profile sees all chats without logging in; also hits the ~5 MB localStorage cap over time.
  **Fix:** Treat Firestore as the source of truth (see BUG-1) and keep at most an in-memory cache or a small bounded IndexedDB cache; clear on sign-out (already done) and on auth-state change.

### Medium

- **[SEC-10] Firebase web config + VAPID key hardcoded in source and duplicated in the service worker**
  `client/src/Firebase/firebase.js:8-16, 33-34`, `client/public/firebase-messaging-sw.js:5-13`
  These are public-by-design, but the two copies already disagree (`storageBucket: "…firebasestorage.app"` vs `"…appspot.com"`) and the API key is not shown to be restricted.
  **Fix:** Source from `import.meta.env.VITE_FIREBASE_*`; generate the SW config at build time (or pass via `?query` params to the SW registration). In Google Cloud Console, restrict the API key to your HTTP referrers.

- **[SEC-11] Hardcoded placeholder TURN credentials shipped to the browser**
  `client/src/pages/video-call.jsx:286`
  ```js
  { urls: "turn:your-turn-server.com", username: "user", credential: "pass" },
  ```
  **Why it matters:** Non-functional (DNS will fail, delaying ICE), and signals that real TURN creds would be hardcoded when added.
  **Fix:** Remove the entry; when adding real TURN, have the server mint short-lived credentials (TURN REST API) and fetch them at call start.

- **[SEC-12] `profilePicUrl` / `groupPicUrl` from other users rendered as `<img src>` without validation**
  `client/src/components/Sidebar.jsx:68, 150, 228, 281`, `client/src/pages/Chat.jsx:527-543`
  **Why it matters:** A malicious user can set any URL (tracking pixels, abusive images) that every friend's browser will load.
  **Fix:** Only accept URLs on your Cloudinary domain (validate on the server-side upload path from SEC-4) and add `referrerPolicy="no-referrer"`.

- **[SEC-13] `localStorage.clear()` on sign-out wipes unrelated keys, and `auth-info` keeps `userId` + email client-side**
  `client/src/pages/Home.jsx:492`
  **Fix:** Clear only app-namespaced keys (`tc:*`), and stop storing identity in localStorage once SEC-5 is done.

### Low

- **[SEC-14]** Login form declares `method="POST"` (`client/src/pages/Login.jsx:133`) — if JS fails, the password is posted to the page URL. Remove the attribute.
- **[SEC-15]** `nanoid` is used for room/group ids client-side (`Home.jsx:414, 630`); ids are guessable only if the RNG is weak, but combined with SEC-1 anyone can join any room they learn. Fix via SEC-1 membership checks.

---

## 3. Bugs & Logic Issues

### Critical

- **[BUG-1] Message persistence is last-writer-wins overwrite → silent message loss**
  `client/src/hooks/useFirestore.js:18` (`setDoc(chatRef, { messages }, { merge: false })`), `client/src/pages/Chat.jsx:297-334` (only runs on unmount)
  Each client keeps its own `messages` array and, on leaving the room, **replaces** the whole Firestore doc with its local copy — but only if `dbLen !== messagesRef.current.length` (`Chat.jsx:311`). If user A leaves, then B sends 3 more and leaves, then A re-opens with a stale localStorage cache and leaves again, A's stale array overwrites B's. Also, closing the tab never fires the React cleanup, so nothing is saved at all. And local cache always wins over Firestore (`Chat.jsx:250-253`), so a second device never sees new messages.
  **Fix:** Store each message as its own doc in `chats/{pairId}/messages/{messageId}` written *at send time* by the sender, and subscribe with `onSnapshot(query(..., orderBy("timestamp")))`. Delete the localStorage message cache and the unmount-save logic.

- **[BUG-2] Identity is keyed by `displayName` everywhere — collisions, impersonation, and history loss on rename**
  `server/server.js:36-46` (dedup by name), `server/server.js:87, 114, 130, 134` (lookups by name), `client/src/hooks/useFirestore.js:6-8` (`chats` doc id = sorted names), `client/src/pages/Home.jsx:418-419` (localStorage keyed by name), `client/src/components/Sidebar.jsx:24, 129, 157`
  Two users named "Alex" share a socket entry (the second overwrites the first in `join`), share the same notification counter, and share a chat history key. Editing your display name in the profile modal (`Home.jsx:522-575`) orphans all your prior chat history.
  **Fix:** Use Firebase `uid` (server-verified per SEC-1) as the key for `onlineUsers`, room membership, notification counters, and the `chats` pair id. Display name becomes a presentational field only.

- **[BUG-3] 1:1 room negotiation only works if the recipient is sitting on `/home`**
  `client/src/pages/Home.jsx:410-425` (`handleJoinRoom` generates a roomId and emits `requestJoin`), `client/src/pages/Home.jsx:360-365` (listener only registered in `Home`)
  The roomId for a pair is stored per-browser in `localStorage[<otherUserName>]`. If the recipient is on `/chat/...` or `/vc` (or offline), they never receive `requestJoin`, never store the roomId, and when they later click the same friend they generate a *different* `nanoid()` — two users end up in two different rooms and never see each other's messages (except via the Firestore fallback, which is itself broken per BUG-1).
  **Fix:** Derive the 1:1 room id deterministically from the two UIDs (`[uidA, uidB].sort().join("_")`) and drop `requestJoin`/`GetRoomInfo`/`localStorage[user.name]` entirely.

### High

- **[BUG-4] Any user disconnecting ends every active video call**
  `server/server.js:149-160`
  ```js
  socket.on("disconnect", () => {
    …
    socket.broadcast.emit("hangup"); // End call if user disconnects
  });
  ```
  Also `offer`/`answer`/`ice-candidate` are global broadcasts (`server/server.js:181-192`), so only one call can exist server-wide, and `offers[0]` is replayed to *every* new connection (`server/server.js:170-172`) — including people opening `/home`.
  **Fix:** Scope signaling to a room: `socket.on("offer", ({ roomId, offer }) => socket.to(roomId).emit("offer", offer))`; on disconnect, emit `hangup` only to `socket.rooms`. Remove `firstUser`/`offers`/`ready` (the client never listens for `ready`).

- **[BUG-5] Video-call placeholder `requestAnimationFrame` loop never stops**
  `client/src/pages/video-call.jsx:172-203`
  `drawFrame` closes over the `isCallActive` value from the render that created it (`true`), so `if (!isCallActive) return` never fires; the canvas repaints at 60 fps forever after the call ends, and the fake "Remote User" stream can be shown instead of the real remote track if `ontrack` fires before the effect.
  **Fix:** Store the rAF id and cancel it in the effect cleanup (`return () => cancelAnimationFrame(id)`), or delete the placeholder entirely and show a static element until `ontrack`.

- **[BUG-6] Typing indicator gets stuck "on"**
  `client/src/pages/Chat.jsx:183-198`
  `typing` is only set back to `false` when the input becomes empty; if the user types and stops (without sending or clearing), the other side sees "typing…" indefinitely. The 500 ms `setTimeout` is also never cleared despite the comment saying it is.
  **Fix:** Keep a `useRef` timer; on every keystroke emit `typing:true` (if not already) and reset a 1.5 s debounce that emits `typing:false`. Clear the timer on unmount.

- **[BUG-7] Socket listeners are registered without cleanup → duplicate handlers and leaked sockets**
  `client/src/pages/Home.jsx:314-407` (effect on `[displayName, socket]`, no `return`), `client/src/pages/Chat.jsx:361-397` (effect on `[socket]`, no `return`), `client/src/pages/Home.jsx:205-207` (creates a new `io()` on every mount and never disconnects it; `Home` unmount → new socket next time while old one lingers unless `Chat` happened to disconnect it)
  **Why it matters:** Re-entering `Home` after a chat registers a second `message-notif` handler → notification counts double; `user-notif` in Chat re-emits `message-notif` N times.
  **Fix:** Return a cleanup that calls `socket.off(event, handler)` for each registered handler. Own the socket lifecycle in `SocketProvider` (create once when authenticated, disconnect on sign-out), not in pages.

- **[BUG-8] Accepting a join request loses room metadata on refresh**
  `client/src/pages/Home.jsx:584-588`
  `handleAccept({ name: joinInfo.from })` navigates with a partial `userData` and never writes `room_<roomId>` to localStorage, unlike `handleJoinRoom` (`Home.jsx:422`). A refresh on `/chat/:roomId` then yields `userData === null`, `getMessages(displayName, undefined)` computes key `"undefined_<name>"`, and the header shows nothing.
  **Fix:** Persist `room_<roomId>` in `handleAccept` too (or, better, fetch room metadata by id after BUG-3 is fixed).

- **[BUG-9] `message.id = Date.now()` — collisions produce duplicate React keys and dropped messages**
  `client/src/pages/Chat.jsx:461, 492`, dedup at `Chat.jsx:384-388`
  Two users sending within the same millisecond (or one user sending a sticker + text rapidly) produce the same id; the receiver's dedup `prev.some(m => m.id === message.id)` silently discards the second message.
  **Fix:** `id: nanoid()` (already a dependency) or `crypto.randomUUID()`.

- **[BUG-10] Read receipts are faked at send time**
  `client/src/pages/Chat.jsx:470-478`
  `viewed` is set to `true` if `inRoom.length === 2` when *sending*, not when the recipient actually views it. `handleViewMessages` (the real implementation) is dead code (`Chat.jsx:226-242`, call commented out at `:410`).
  **Fix:** Emit a `messages-viewed` event with message ids when the recipient's tab is visible and the list is scrolled to bottom; sender updates `viewed` on receipt.

- **[BUG-11] `handleOnline` and `setIsOnline` updaters perform side effects inside a state updater**
  `client/src/pages/Home.jsx:181-198, 332-344`
  `socket.emit(...)` and `localStorage.setItem(...)` run inside `setIsOnline(prev => …)`. React may invoke updaters twice (StrictMode / concurrent features), double-emitting `join`.
  **Fix:** Compute `newStatus` from current state, call `setIsOnline(newStatus)`, then emit.

- **[BUG-12] Direct state mutation of `notifications`**
  `client/src/pages/Home.jsx:419-420`
  ```js
  notifications[user.name] = 0;
  localStorage.setItem("notifications", JSON.stringify(notifications));
  ```
  The `Sidebar` badge won't re-render because the object reference is unchanged; the persisted effect (`Home.jsx:216-218`) also doesn't fire.
  **Fix:** `setNotifications(prev => ({ ...prev, [key]: 0 }))`.

- **[BUG-13] localStorage key namespace collision — user display names are used as raw keys**
  `client/src/pages/Home.jsx:363, 418`, `client/src/hooks/useGetRoomInfo.js:2`
  `localStorage.setItem(user.name, roomId)` next to keys like `theme`, `groups`, `notifications`, `auth-info`, `isOnline`, `registeredUsers`. A user named `theme` or `groups` corrupts app state (`JSON.parse` of a nanoid throws in `ThemeContext.jsx:14` — caught — but `Home.jsx:79` `JSON.parse(saved)` for groups is uncaught and crashes `Home`).
  **Fix:** Namespace all keys (`tc:room:<uid>`), and remove per-name room storage per BUG-3.

- **[BUG-14] Group chats: `inRoom.length` heuristics and `get-user-notif` are wrong for groups**
  `client/src/pages/Chat.jsx:470-478`
  For a group, `userData.name` is the group name, so `socket.emit("get-user-notif", groupName, …)` never finds a user → no notifications for group messages. `viewed` is set based on 2 people in the room. Group messages are never persisted to Firestore (acknowledged in a comment at `Chat.jsx:308-309`), so they exist only in the sender's and currently-online receivers' localStorage.
  **Fix:** Branch on `isGroup`: notify all `userData.members` (server-side lookup by uid), and persist group messages under `groups/{id}/messages`.

- **[BUG-15] `ice-candidate` handler "waits" 500 ms once and then adds the candidate regardless**
  `client/src/pages/video-call.jsx:98-113`
  Candidates arriving before `setRemoteDescription` are not queued; after a single 500 ms sleep `addIceCandidate` is attempted anyway and will throw if the remote description is still unset. The comment says "Storing candidate…" but nothing is stored.
  **Fix:** Keep a `pendingCandidates` ref; push while `remoteDescription` is null and flush after `setRemoteDescription` resolves.

- **[BUG-16] `socket.on(...)` effect in video-call depends on `[isCallActive]` and re-subscribes; `hangup` handler uses stale `endCall`**
  `client/src/pages/video-call.jsx:83-132`
  Each toggle of `isCallActive` re-registers all four handlers; `endCall` is recreated per render but the handler captured one instance. `endCall` also re-emits `hangup` on receiving `hangup` (`video-call.jsx:363`), creating an unnecessary echo round-trip.
  **Fix:** Register handlers once with `useEffect(..., [])` and read mutable state through refs; only emit `hangup` from the user-initiated path.

### Medium

- **[BUG-17]** `Login.jsx:74-104` — `handleGoogleSignup` calls `setTimeout(() => setLoading(false), 2000)` *after* `navigate("/home")`, updating state on an unmounted component. Set loading in `finally` before navigating.
- **[BUG-18]** `Login.jsx:52`, `SignUp.jsx:58, 94` — `addUser(...)` is not awaited; navigation proceeds before the Firestore write, so a fast reload on `/home` can find no user doc. `await` it (and surface errors).
- **[BUG-19]** `SignUp.jsx:31-46` — Cloudinary upload happens *before* `createUserWithEmailAndPassword`; if account creation fails (email in use, weak password) the image is orphaned. Reorder: create account → upload → `updateProfile`.
- **[BUG-20]** `SignUp.jsx:26-75` — no `loading` state; double-clicking "Sign Up" fires two `createUserWithEmailAndPassword` calls and two uploads. Add a loading flag as in `Login.jsx`.
- **[BUG-21]** `Chat.jsx:244-276` — the message-load effect depends on `[socket, displayName]`; `socket` transitions `null → instance` on first mount, so it runs twice, each with a 500 ms artificial delay and `setLoading(true)` flicker. Depend on `[roomId]` only.
- **[BUG-22]** `Chat.jsx:492-498` — `sendSticker` uses `timestamp: new Date()` while `handleSubmit` uses ISO string; after JSON round-trip both are strings, but before that `new Date(message.timestamp)` on a `Date` works only by coincidence. Use one canonical ISO format via a shared `createMessage()` helper.
- **[BUG-23]** `server/server.js:38-42` — `join` dedup uses `==` on `user.name == displayName` (loose equality) in one branch and `===` in the other. Minor now; becomes a bug if names are ever numeric strings. Use `===`.
- **[BUG-24]** `server/server.js:107-120` — `leaveRoom` filters the room's users by `displayName` (removes *all* same-named users) and removes empty rooms, but `disconnect` (`:149`) never removes the socket from `rooms`, so ghost users accumulate in `rooms[*].users` and `get-room-info` reports stale members (which feeds `inRoom.length` and thus BUG-10).
- **[BUG-25]** `Home.jsx:263-276` — the "getUsers" effect references `registeredUsers` (always `[]` on first render, since the real fetch is commented out) and writes `[]` into localStorage; `registeredUsers` is then passed to `Sidebar` which ignores the prop. Dead/incorrect path — remove.
- **[BUG-26]** `Home.jsx:650-653` — `handleDeleteGroup` emits `deleteGroup` and updates local state but never calls `deleteGroup` from `useFirestore`, so the group reappears on reload. It's also unreferenced (dead) — see QUAL-4.
- **[BUG-27]** `Home.jsx:663-672` — `handleCreateChat` ("Create Chat" button in the New Chat modal) just closes the modal; the modal's user selection does nothing. Either wire it to `handleJoinRoom` or remove the modal.
- **[BUG-28]** `Sidebar.jsx:234` — `group.name[0]` throws if `name` is an empty string/undefined (Firestore docs created before validation). Use `group.name?.[0] ?? "#"`.
- **[BUG-29]** `Sidebar.jsx:300-302` — the message button in the offline Friends list has no `onClick`; the row's `onClick` works only because the click bubbles. Harmless but inconsistent with the online list which uses `stopPropagation`.
- **[BUG-30]** `client/public/firebase-messaging-sw.js:21` — notification icon falls back to `/logo.png`, which does not exist in `public/`. Use `/chat-192x192.png`.
- **[BUG-31]** `client/src/pages/video-call.jsx:14` — `connected` state is set but never read (lint confirms). Either drive UI from it or delete.
- **[BUG-32]** `client/src/pages/video-call.jsx:365-374` — the Answer button is shown/hidden and wired via `document.getElementById("control").classList` and `element.onclick = …`, bypassing React. If React re-renders the `<Button>`, the imperative `onclick` and class are lost. Store `incomingOffer` in state and render the button conditionally with `onClick={() => answerCall(incomingOffer)}`.
- **[BUG-33]** `client/src/hooks/use-mobile.jsx:4` — initial state is `false`, so the first render on mobile uses desktop animation values; `video-call.jsx:38-51` then duplicates the same logic as a "fallback". Initialize from `window.innerWidth` lazily and delete the duplicate.

### Low

- **[BUG-34]** `Login.jsx:30` sets `setError(null)` while the state is initialized as `""` — inconsistent type. Use `""`.
- **[BUG-35]** `Chat.jsx:351-353` — empty `useEffect(() => {}, [roomId])` with a comment; delete.
- **[BUG-36]** `Chat.jsx:22, 560` — the camera button shows the placeholder toast `"Here is your toast."`.
- **[BUG-37]** `Home.jsx:135-139` — `quickStats` ("12 online friends / 5 active chats / 3 favorite groups") are hardcoded fake numbers rendered as real stats (`Home.jsx:1295-1325`).
- **[BUG-38]** `Home.jsx:729, 734` — "Subscription" and "Support" menu items have no handlers; `Home.jsx:780` and `Sidebar.jsx:34-38` — two search inputs are not wired to anything.

---

## 4. Architecture & Structure

### High

- **[ARCH-1] `Home.jsx` is a 1,895-line god component holding all state, all socket wiring, five modals, and a styled-components block**
  `client/src/pages/Home.jsx`
  It owns presence, friends, groups, profile editing, settings, notifications, FCM, theme, and the join-request toast. Every keystroke in the "status" input (`Home.jsx:294`) re-renders the whole tree including `Sidebar` and every modal.
  **Fix:** Split into `hooks/usePresence.js`, `hooks/useFriends.js`, `hooks/useGroups.js` (each owning its socket listeners + Firestore calls with proper cleanup) and components `HeaderBar`, `ProfileMenu`, `GroupModal`, `NewChatModal`, `ProfileModal`, `SettingsModal`, `JoinRequestToast`. Move `StyledWrapper` (`Home.jsx:1833-1893`) to a `ThemeToggle.jsx` (or replace with Tailwind).

- **[ARCH-2] Socket lifecycle is owned by three different pages in three different ways**
  `Home.jsx:205-207` (always creates a new socket, never disconnects), `Chat.jsx:297-334` (reuses context socket, disconnects it on unmount), `video-call.jsx:21-30` (creates a private socket in a ref, disconnects on unmount, ignores context)
  **Why it matters:** This is the root cause of BUG-7 and makes it impossible to reason about how many connections a user has. `/vc` opens a *second* connection with a *second* `join`-less socket that the server treats as an unknown user.
  **Fix:** `SocketProvider` should create the socket once after auth (with the ID token), expose it, and disconnect on sign-out. Pages subscribe/unsubscribe to events only.

- **[ARCH-3] Three overlapping persistence layers with no single source of truth**
  localStorage (`messages_*`, `groups`, `registeredUsers`, `notifications`, `room_*`, `<name>` → roomId), Firestore (`chats`, `groups`, `users`), and server memory (`onlineUsers`, `rooms`, `offers`).
  Groups are merged from localStorage *and* Firestore (`Home.jsx:227-241`); messages prefer localStorage over Firestore (`Chat.jsx:250-253`); presence is server memory only.
  **Fix:** Firestore (with `onSnapshot`) for durable data, server memory for presence only, localStorage for UI prefs only (theme, bubble theme, backdrop).

### Medium

- **[ARCH-4] `use*` "hooks" that are not hooks**
  `client/src/hooks/useFirestore.js`, `useAddUser.js`, `useGetUsername.js`, `useGetUserInfo.js`, `useToasts.js`, `useGetRoomInfo.js` (exported as `GetRoomInfo`, not even `use`-prefixed)
  None call React hooks; `useFirestore()` returns 12 *new* function identities on every render, which is why every `useEffect` that uses them has to omit them from deps (lint warns at `Home.jsx:243, 261, 407`, `Chat.jsx:276, 334`).
  **Fix:** Convert to plain modules: `lib/firestore.js` exporting `storeMessages`, `getMessages`, …; `lib/authStorage.js` for `getUserInfo()`. Keep the `hooks/` directory for real hooks only.

- **[ARCH-5] Server is a single 210-line file mixing four concerns (presence, rooms, messaging, WebRTC signaling) with module-level mutable state**
  `server/server.js:13-16`
  **Fix:** Split into `handlers/presence.js`, `handlers/rooms.js`, `handlers/signaling.js`, and a `state.js` (or a Redis adapter if ever scaled beyond one instance, since `onlineUsers`/`rooms` are per-process).

- **[ARCH-6] Dark-mode class application is duplicated in two pages instead of the provider**
  `client/src/pages/Home.jsx:305-312`, `client/src/pages/Chat.jsx:278-285`, `Home.jsx:220-222` (also re-persists `theme`, duplicating `ThemeContext.jsx:21-23`). `Login`, `SignUp`, `video-call` do not apply it at all, so dark mode flips off on those routes.
  **Fix:** Move the `document.documentElement.classList.toggle("dark", isDarkMode)` effect into `ThemeProvider` and delete both page copies.

- **[ARCH-7] `SocketProvider` wraps `BrowserRouter` but `ThemeProvider`/`SocketProvider` are outside routing; `Toaster` is mounted per-page**
  `client/src/main.jsx:10-18`, `Home.jsx:676`, `Chat.jsx:557`
  Two `<Toaster>` instances (Home and Chat) with different styling; toasts fired during navigation are lost.
  **Fix:** One `<Toaster>` in `App.jsx`.

- **[ARCH-8] Firestore `users` docs keyed by email, while `chats` keyed by display-name pairs and `registered/users_list` is an unbounded array doc**
  `client/src/hooks/useAddUser.js:7`, `useFirestore.js:6-8, 61-96`
  Three inconsistent keying strategies; `registered/users_list` will hit the 1 MB doc limit and is unused anyway.
  **Fix:** Key everything by `uid`; delete `addRegisteredUser`.

- **[ARCH-9] Misplaced / inconsistent naming**
  `client/src/Firebase/firebase.js` (PascalCase directory while everything else is lowercase), `pages/video-call.jsx` (kebab-case while other pages are PascalCase), `contexts/socketContext.jsx` vs `contexts/ThemeContext.jsx`, `components/ui/button.jsx` (shadcn) next to hand-rolled components, `hooks/useToasts.js` (exports `privTrue`/`privFalse`/… not a hook).
  **Fix:** Pick one convention (PascalCase components/pages, camelCase modules, lowercase dirs) and rename.

### Low

- **[ARCH-10]** `client/src/components/SplitText.jsx` is never imported anywhere. Delete.
- **[ARCH-11]** `client/src/hooks/useGetRoomInfo.js` — one-line localStorage read wrapped as a module; inline it or delete with BUG-3.
- **[ARCH-12]** `client/src/components/ui/button.jsx` exports `buttonVariants` alongside the component (react-refresh warning at `:54`); move variants to `ui/button-variants.js` if Fast Refresh matters.

---

## 5. Code Quality

### High

- **[QUAL-1] Default-avatar URL string is copy-pasted 8 times**
  `Login.jsx:44, 83`, `SignUp.jsx:54, 84`, `Home.jsx:97`, `useAddUser.js:12`, `useFirestore.js:74, 85`
  **Fix:** `export const DEFAULT_AVATAR_URL` in `lib/config.js` (better: ship a local `/default-avatar.png` so it doesn't depend on ftcdn.net).

- **[QUAL-2] Cloudinary upload block copy-pasted 3 times**
  `SignUp.jsx:34-42`, `Home.jsx:532-542`, `Home.jsx:608-620`
  **Fix:** `lib/uploadImage.js` → `export async function uploadImage(file): Promise<string>` (and per SEC-4, route through the server).

- **[QUAL-3] Google sign-in handler duplicated verbatim in Login and SignUp; `authInfo` object construction duplicated 4 times**
  `Login.jsx:74-104` vs `SignUp.jsx:77-103`; `Login.jsx:45-51, 84-90`, `SignUp.jsx:49-55, 85-91`
  **Fix:** `lib/auth.js` with `signInWithGoogle()` and `persistSession(user, profile)`.

- **[QUAL-4] Dead code and unused symbols (confirmed by `eslint .`)**
  - `Home.jsx:1` `React`, `useMemo`; `:21,24-28,36,39` eight unused lucide icons; `:650` `handleDeleteGroup`; `:67` commented-out `setSocket(useMemo(...))`; `:266` commented-out `getRegisteredUsers()` call
  - `Chat.jsx:136` `senderObject` (+ `user-details` round-trip at `:369-371, 399-403`), `:226` `handleViewMessages`, `:22/560` `notify`, `:351-353` empty effect
  - `Login.jsx:8` `useFirestore` import
  - `video-call.jsx:5` `Settings`, `:14` `connected`
  - `Firebase/firebase.js:5` `onMessage`, `:22` `analytics` (Analytics initialized for side effects only — this also silently loads GA on every page)
  - `useFirestore.js:61-96` `addRegisteredUser` (never called)
  - `server/server.js:6` `nanoid` import; `:15,174-179` `firstUser`/`ready` (client never listens)
  - `client/src/components/SplitText.jsx` (whole file)
  **Fix:** Delete; then make `npm run lint` pass in CI.

- **[QUAL-5] `useToasts.js` — four 25-line toast calls that differ only by the message string**
  `client/src/hooks/useToasts.js:3-106`
  **Fix:** `const statusToast = (msg) => toast(msg, TOAST_OPTS)`; export `privTrue = () => statusToast("Privacy Mode Enabled")`, etc. (or just call `toast()` inline).

### Medium

- **[QUAL-6] Silent error swallowing — every Firestore helper catches and `console.error`s, returning `[]`/`undefined`**
  `useFirestore.js:21-23, 41-44, 55-58, 93-95, 114-116, 129-132, 138-140, 154-156, 170-172, 183-185, 199-202, 222-225`, `useAddUser.js:16-18`
  Callers like `handleSendFriendRequest` (`Home.jsx:439-459`) then show "Friend request sent" toasts even when the write failed.
  **Fix:** Let helpers throw; catch at the call site and show an error toast.

- **[QUAL-7] `console.log` noise in production paths (≈40 statements)**
  e.g. `server/server.js:30, 37, 47, 151, 196`, `Chat.jsx:240-241, 254, 261, 322, 325, 329, 366, 375, 469`, `Home.jsx:275, 279, 351`, `Login.jsx:34, 75`, `SignUp.jsx:47, 78`, `firebase.js:27, 36` (logs the FCM token)
  **Fix:** Remove or gate behind `import.meta.env.DEV`; on the server use `pino`/`debug`.

- **[QUAL-8] Artificial delays sprinkled through the UX**
  `Login.jsx:32` (1000 ms before sign-in), `Home.jsx:320` (1000 ms before fetching users), `Chat.jsx:251` (500 ms before showing messages), `Login.jsx:102` (2000 ms), `video-call.jsx:103` (500 ms)
  **Fix:** Remove all of them; if skeletons need a minimum display time, implement that in the skeleton component.

- **[QUAL-9] Misspellings baked into the wire protocol and state**
  `recieve-message` (`server/server.js:146`, `Chat.jsx:383`), `recieve`/`setRecieve`/`prefRecieve` (`Chat.jsx:157-163`), `IsSenderTyping` (capitalized state var, `Chat.jsx:173`).
  **Fix:** Rename to `receive-message`, etc. (coordinate client+server deploy).

- **[QUAL-10] `alert()` used for validation feedback while the rest of the app uses toasts**
  `Home.jsx:596, 601, 665`
  **Fix:** `toast.error(...)`.

- **[QUAL-11] `Home.jsx` sets `localStorage.setItem("theme", …)` in addition to `ThemeContext` doing it**
  `Home.jsx:220-222` — duplicate of `ThemeContext.jsx:21-23`. Delete the page copy.

- **[QUAL-12] Inconsistent formatting: mixed semicolons/no-semicolons, tabs vs 2/4 spaces, single vs double quotes, trailing whitespace blocks**
  `video-call.jsx`, `use-mobile.jsx`, `Sidebar.jsx` (no semicolons) vs everything else; `server/server.js:75, 122, 154, 167, 200-202` blank-line runs; `Chat.jsx:729-761` unindented JSX block.
  **Fix:** Add Prettier + `eslint-config-prettier`, run once, enforce in CI.

- **[QUAL-13] React `key={index}` on lists that can reorder / be toggled**
  `Home.jsx:1300`, `Home.jsx:1745`, `Chat.jsx:838, 864` (emoji/sticker grids — static, so acceptable), `Home.jsx` toggles list (`:943, 1745` — static). Low risk but flagged for consistency.

- **[QUAL-14] Inline `style={{ backgroundImage: "url(https://images.unsplash.com/…)" }}` hotlinks on Login, SignUp, Chat, and Pinterest hotlinks for chat backdrops**
  `Login.jsx:112-113`, `SignUp.jsx:116-117`, `Chat.jsx:508`, `Chat.jsx:50-70`, `Chat.jsx:166`
  Pinterest (`i.pinimg.com`) actively blocks hotlinking in some regions; Unsplash URLs can change. Ship these in `public/` (they're small) or use the Unsplash API with attribution.

### Low

- **[QUAL-15]** `Chat.jsx:527-543` — header `<img>` has no `alt`; `Sidebar.jsx:150` uses `/api/placeholder/40/40` as a fallback, which is not a route that exists.
- **[QUAL-16]** `Login.jsx:136, 148` — `<label>` elements lack `htmlFor` (SignUp does it right).
- **[QUAL-17]** `Login.jsx:125` — unescaped `'` (lint error).
- **[QUAL-18]** `Home.jsx:675` — class `min-h-100dvdh` is a typo (`100dvh`); `Home.jsx:1092` `mt-30`, `Chat.jsx:511` `width-screen` are not Tailwind classes.
- **[QUAL-19]** Prop-types are not declared anywhere while `react/prop-types` is enabled → 60+ lint errors that will be ignored. Either disable the rule in `eslint.config.js` or migrate to TypeScript (recommended given the amount of shape-guessing with `?.`).

---

## 6. Performance

### High

- **[PERF-1] Whole message history is re-serialized to localStorage on every message and re-animated via `useTransition` for the full list**
  `Chat.jsx:340-344` (`JSON.stringify(messages)` on each change), `Chat.jsx:170-180` (`useTransition(messages, …)` keyed over *all* messages), `Chat.jsx:451-453` (`scrollIntoView` on every change)
  O(n) work per message, and a 1,000-message room means a 1,000-spring transition set on every render.
  **Fix:** Virtualize (`@tanstack/react-virtual`) or at least window to the last N messages; animate only the newly appended item; stop persisting to localStorage per BUG-1.

- **[PERF-2] N+1 Firestore reads for friend/request profile resolution**
  `useFirestore.js:206-226` (`getUsersByEmails` → one `getDoc` per email)
  **Fix:** Batch with `where(documentId(), "in", chunk)` in chunks of 30, or denormalize `displayName`/`profilePicUrl` into the friend edge.

- **[PERF-3] Full `users` collection scan on every Home mount, gated only by a `users.length === 0` check that is defeated by localStorage**
  `Home.jsx:316-325, 402-406`, `useFirestore.js:48-59`
  Cost grows linearly with total signups (reads billed per doc). Also see SEC-6.
  **Fix:** Remove; the result (`users`) is only passed to `Sidebar`, which never reads it.

### Medium

- **[PERF-4] `Home` re-renders `Sidebar` and all modals on every keystroke / socket tick because nothing is memoized**
  `Home.jsx:1084-1104` — 19 props, all fresh closures every render; `Sidebar` sorts `onlineUsers` on every render (`Sidebar.jsx:127-132`).
  **Fix:** After ARCH-1 split, wrap `Sidebar` in `React.memo`, memoize handlers with `useCallback`, memoize the sorted list with `useMemo`.

- **[PERF-5] Firebase Analytics and Messaging are initialized eagerly on every page load, including Login**
  `Firebase/firebase.js:22-23`, `Home.jsx:209-214` (`generateToken()` requests notification permission on mount — before any user gesture, which browsers increasingly block and users find hostile)
  **Fix:** Lazy-init messaging behind a "Enable notifications" toggle (one already exists in Settings — `Home.jsx:141-153` — but it only shows a toast). Remove Analytics unless actually used.

- **[PERF-6] Unused heavy deps inflate the bundle**
  `@chakra-ui/react` + `@emotion/react` (unused, ~150 KB gz), `cloudinary` Node SDK (unused; pulls Node polyfills), `next-themes`, `react-feather`, `workbox-window` — see DEP-2. Three icon libraries in use (`lucide-react`, `react-icons`, and `react-feather` declared).
  **Fix:** Remove unused; standardize on `lucide-react`.

- **[PERF-7] Server does O(n) array scans on every event and rebuilds arrays with `map`/`filter`**
  `server/server.js:36-42, 80, 87, 94, 110-120, 126, 130, 134, 142, 150`
  Fine at 10 users; degrades at 10k. **Fix:** `Map<uid, user>` and `Map<roomId, Set<uid>>`.

- **[PERF-8] `useGetUserInfo()` `JSON.parse`s localStorage on every render of every component that calls it**
  `useGetUserInfo.js:2` — called in `Login`, `SignUp`, `Home`, `Chat`. Cache in a context (per SEC-5).

- **[PERF-9] Hotlinked hero background (Unsplash `w=2942`) loaded on Login, SignUp, *and* behind the Chat card**
  `Login.jsx:113`, `SignUp.jsx:117`, `Chat.jsx:508` — a ~1 MB image that is mostly hidden behind the chat panel on mobile. Serve a resized local asset.

### Low

- **[PERF-10]** `Chat.jsx:209-224` — `IntersectionObserver` is torn down and recreated on every `messages` change; create once with a ref to the sentinel.
- **[PERF-11]** `Home.jsx:1833` — `styled-components` is pulled in (~12 KB gz + runtime) for one CSS block; replace with Tailwind or a `.css` file.

---

## 7. Dependencies

Installed versions checked from `node_modules`; `npm audit` run 2026-09-16: **client 76 vulnerabilities (3 critical, 62 high)**, **server 12 (9 high)**.

### Critical

- **[DEP-1] Vulnerable direct dependencies with known advisories**
  `client/package.json`:
  - `axios ^1.7.9` (installed 1.7.9) — high: SSRF/credential leak via absolute URL; DoS via missing size check → upgrade to `>=1.17.1`
  - `react-router-dom ^7.1.3` (installed 7.2.0) — high: XSS via open redirects, DoS via cache poisoning / `turbo-stream` → upgrade to `>=7.17.1`
  - `nanoid ^5.0.9` (both client and server) — high → upgrade to `>=5.1.16`
  - `vite ^6.1.1` (installed 6.2.0) — high: `server.fs.deny` bypasses (dev-only exposure) → upgrade to latest 6.x/7.x
  - `socket.io-client ^4.8.1` / `socket.io ^4.8.1` — `socket.io-parser` unbounded binary attachments, `ws` memory disclosure → upgrade both to latest 4.8.x patch
  - `firebase ^11.3.1` — transitive `@grpc/grpc-js` crash, `protobufjs` critical code-execution → upgrade to latest 11.x/12.x
  - `cloudinary ^2.5.1` — high: argument injection (and unused, see DEP-2)
  - `styled-components` → `postcss` XSS/file-read
  `server/package.json`:
  - `express ^4.21.2` — `body-parser`, `path-to-regexp`, `qs` ReDoS/DoS → upgrade to `>=4.22.3` or 5.x
  - `socket.io` → `engine.io` polling connection exhaustion, `ws` → upgrade
  **Fix:** `npm audit fix` in both packages, then manually bump majors listed above; add `npm audit --audit-level=high` to CI.

### High

- **[DEP-2] Unused dependencies (confirmed by grep — zero imports)**
  `client/package.json`: `@chakra-ui/react`, `@emotion/react`, `cloudinary` (Node SDK — the client uses the REST API via axios), `next-themes`, `react-feather`, `workbox-window` (vite-plugin-pwa brings its own), `esbuild` (devDep; Vite bundles its own), `@types/react`, `@types/react-dom` (no TS).
  `server/package.json`: `nanoid`.
  **Fix:** `npm uninstall` each; run `npx depcheck` in CI.

- **[DEP-3] `@vitejs/plugin-react ^1.3.2` is three majors behind Vite 6**
  `client/package.json:44` (installed 1.3.2, from the Vite 2 era; current is 4.x)
  It happens to work, but its Babel toolchain is what drags in the vulnerable `@babel/*` packages in the audit and it lacks React 18 Fast Refresh fixes.
  **Fix:** `npm i -D @vitejs/plugin-react@latest`.

- **[DEP-4] `nodemon` is a production dependency and `npm start` runs it**
  `server/package.json:8, 16` — `"start": "nodemon server.js"`
  Render/production will run a file-watcher. **Fix:** move to `devDependencies`, `"start": "node server.js"`, `"dev": "nodemon server.js"`.

### Medium

- **[DEP-5]** `firebase-messaging-sw.js:1-2` loads Firebase **10.8.0** compat from gstatic while the app bundles **11.3.1** — two SDK versions in one origin. Generate the SW from the same package (vite-plugin-pwa `injectManifest` with `importScripts` from `node_modules` or use `firebase/messaging/sw`).
- **[DEP-6]** No `engines` field / `.nvmrc` in either package; Node version is unspecified for Render and Vercel.
- **[DEP-7]** `server/package.json:4` `"main": "index.js"` but the entry is `server.js`.
- **[DEP-8]** `@react-spring/web`, `gsap`, and `tailwindcss-animate` are three animation systems for one app; `gsap` is used for a single controls fade (`video-call.jsx:206-220`). Consolidate.

---

## 8. Tests

### Critical

- **[TEST-1] There are no tests of any kind**
  `find` for `*.test.*`/`*.spec.*` returns nothing; `server/package.json:7` is `"test": "echo \"Error: no test specified\" && exit 1"`; client has no test script, no Vitest/Jest/Testing Library, no Playwright config, no CI workflow (`.github/` absent).
  **Why it matters:** The logic most likely to regress (room-id derivation, message dedupe/persistence, friend-request state transitions, socket handler registration) is untested and untestable in its current shape.
  **Fix (in order of value):**
  1. Server: `vitest` + `socket.io-client` in-process tests for `join`/`joinRoom`/`send-message` routing and membership checks (after SEC-1).
  2. Client pure logic: extract `generateId`, `createMessage`, friend-state reducers, and test them with Vitest.
  3. One Playwright smoke test: sign up → add friend → send message across two browser contexts.
  4. Add a GitHub Actions workflow running `npm run lint && npm test && npm audit --audit-level=high` for both packages.

### High

- **[TEST-2] `npm run lint` currently fails with 112 errors, so the only automated check that exists is red**
  Output above (§5 QUAL-4). Roughly half are `react/prop-types`; the rest are real unused symbols. Also `dev-dist/` (generated by `VitePWA devOptions`) is linted because `eslint.config.js:8` only ignores `dist`.
  **Fix:** Add `dev-dist` and `public/*.js` (service worker, needs `globals.serviceworker`) to `ignores`; decide on prop-types vs TS; fix the rest.

---

## 9. Documentation

### High

- **[DOC-1] Root `README.md` is deleted in the working tree (unstaged)**
  `git status`: `D README.md`. The committed version (`git show HEAD:README.md`) is the only project-level doc and it is out of date: lists **Redux** in the tech stack (not used), omits Firebase, Cloudinary, WebRTC, and has no setup/run instructions at all.
  **Fix:** Restore and rewrite: prerequisites (Node version), `client/` and `server/` install/run commands, required env vars (`VITE_SOCKET_URL`, `VITE_FIREBASE_*`, `PORT`, `CLIENT_ORIGIN`), Firebase project setup (Auth providers, Firestore rules deploy), Cloudinary preset, deployment (Vercel + Render), and architecture overview.

- **[DOC-2] `client/README.md` is the untouched Vite template**
  `client/README.md:1-8`. Replace with a pointer to the root README or delete.

### Medium

- **[DOC-3] Socket event protocol is undocumented**
  `server/server.js` defines ~20 events with positional args in inconsistent orders (`("joinRoom", roomId, displayName)` vs `("message-notif", message, userId, username, roomId)` vs object payloads for `join`/`requestJoin`). Nothing lists them.
  **Fix:** Add `docs/SOCKET_EVENTS.md` (or a shared `events.js` constants module with JSDoc) and normalize every event to a single object payload.

- **[DOC-4] Firestore data model is undocumented and no rules/indexes are committed**
  Collections `users`, `chats`, `groups`, `registered` — shapes are only inferable from `useFirestore.js`. Add `docs/DATA_MODEL.md` plus `firestore.rules` and `firestore.indexes.json` (the `groups` `array-contains` query at `useFirestore.js:123-126` needs no composite index today, but `orderBy` additions will).

- **[DOC-5] `docs/TetherChat-Explained.md` + `.pdf` (863 KB) are untracked**
  `git status`: `?? docs/`. Decide: commit the `.md` (useful onboarding doc — though it should be reconciled with this audit since it describes intended behavior that the code doesn't fully deliver, e.g. read receipts) and `.gitignore` the PDF, or move both out of the repo.

### Low

- **[DOC-6]** `index.html:7` title is `Vite + React` and the favicon is `vite.svg`; the PWA manifest says "Cool Chat App" (`vite.config.js:18`).
- **[DOC-7]** `.env.example` comment (`client/.env.example:1`) says "Copy to .env.local" and `.gitignore` comment says `.env.development/.env.production/.env.example` are committed — but none of them are (see CFG-1).

---

## 10. Configuration & Environment

### High

- **[CFG-1] `.gitignore` pattern `.env*` excludes the very files the comments say are committed — so `.env.example` is not in the repo**
  `client/.gitignore:3` (`.env*`) vs `:16-18` ("committed: .env.development, .env.production, .env.example"). `git ls-files` confirms none of the three are tracked; a fresh clone has no example and falls back to the hardcoded Render URL.
  **Fix:** Change line 3 to `.env.local` / `.env.*.local` only (those lines already exist at 17-18), and `git add client/.env.example client/.env.development client/.env.production`. Add `server/.env.example` (`PORT`, `CLIENT_ORIGIN`, later `FIREBASE_SERVICE_ACCOUNT`, `CLOUDINARY_*`).

- **[CFG-2] Production backend URL hardcoded as a fallback in source**
  `client/src/lib/config.js:5-6` — `|| "https://chatapp-dcac.onrender.com"`.
  **Why it matters:** A misconfigured build silently talks to production. **Fix:** Throw at startup if `VITE_SOCKET_URL` is missing (`if (!SOCKET_URL) throw new Error(...)`).

- **[CFG-3] Third-party identifiers hardcoded rather than configured**
  Cloudinary cloud name `dzlr1rtln` + preset `ml_default` (`SignUp.jsx:36-39`, `Home.jsx:536-538, 612-614`); Firebase config (`firebase.js:8-16`, `firebase-messaging-sw.js:5-13`); VAPID key (`firebase.js:34`); STUN/TURN (`video-call.jsx:284-287`); default avatar URL ×8.
  **Fix:** `VITE_CLOUDINARY_CLOUD`, `VITE_CLOUDINARY_PRESET`, `VITE_FIREBASE_*`, `VITE_VAPID_KEY`, `VITE_ICE_SERVERS` (JSON) in `lib/config.js`.

### Medium

- **[CFG-4] Server reads only `PORT` from env; no `CLIENT_ORIGIN`, no `NODE_ENV` handling**
  `server/server.js:9, 19-24, 208`. See SEC-7.

- **[CFG-5] `VitePWA({ devOptions: { enabled: true } })` generates `client/dev-dist/` with a service worker during `npm run dev`**
  `vite.config.js:13-15`
  Causes stale-cache confusion in development ("my change isn't showing") and produces the `dev-dist` lint errors. `dev-dist` is in `client/.gitignore:32` at least.
  **Fix:** Set `devOptions.enabled: false` (default) or gate on an env flag.

- **[CFG-6] Two service workers registered: vite-plugin-pwa's `sw.js` (`main.jsx:8` `registerSW`) and Firebase's `firebase-messaging-sw.js` (auto-registered by `getMessaging`)**
  Both at scope `/`. Firebase's SW registration at `/firebase-messaging-sw.js` is separate but can conflict on `push` handling and doubles the SW footprint.
  **Fix:** Use vite-plugin-pwa `strategies: "injectManifest"` and put the FCM `onBackgroundMessage` handler inside the single generated SW.

- **[CFG-7] ESLint config doesn't cover service-worker globals or ignore generated output**
  `eslint.config.js:8, 12-13` — `globals.browser` only; `public/firebase-messaging-sw.js` errors on `importScripts`/`firebase`.
  **Fix:** Add a second config block for `public/**/*.js` with `globals.serviceworker` and a `firebase: "readonly"` global; add `dev-dist` to ignores.

- **[CFG-8] `vercel.json` rewrites everything to `index.html` — including `/firebase-messaging-sw.js` if it ever goes missing (returns HTML with 200)**
  `client/vercel.json:2-4`. Add a negative-lookahead source (`"/((?!.*\\.).*)"`) so static asset 404s stay 404s.

### Low

- **[CFG-9]** `components.json:9` `"config": ""` — shadcn config points at a Tailwind config that doesn't exist (Tailwind 4 CSS-first is fine, but the CLI may complain).
- **[CFG-10]** `jsconfig.json` and `vite.config.js` both define the `@` alias; ok, but keep them in sync (only `video-call.jsx` and `ui/button.jsx` use `@/`; everything else uses relative paths).
- **[CFG-11]** Root `.gitignore` contains only `.claude` and `.playwright-mcp`; consider adding `node_modules`, `*.log`, `.DS_Store` at the root for safety.

---

## 11. Top Fixes If Time Is Limited

1. **Authenticate and scope the socket server (SEC-1, SEC-2, SEC-7, BUG-4).** Verify a Firebase ID token in `io.use`, key everything by `uid`, replace every `broadcast.emit` with targeted `io.to(...)`/room emits, and set `CLIENT_ORIGIN`. This one change closes impersonation, the social-graph leak, global call hang-ups, and the cross-room injection.

2. **Make Firestore the single source of truth for messages and commit security rules (BUG-1, SEC-3, SEC-9).** Write each message as its own doc at send time, subscribe with `onSnapshot`, delete the localStorage message cache and the unmount-save. Add `firestore.rules` gating `users/{uid}`, `chats/{pair}`, `groups/{id}` on `request.auth.uid`.

3. **Stop keying identity and rooms on `displayName` (BUG-2, BUG-3, BUG-13).** Use `uid` everywhere; derive 1:1 room ids as `sorted(uidA, uidB).join("_")` and delete `requestJoin`, `GetRoomInfo`, and per-name localStorage keys.

4. **Dependency hygiene (DEP-1..4).** `npm audit fix` + manual bumps for `axios`, `react-router-dom`, `nanoid`, `express`, `socket.io*`, `firebase`, `@vitejs/plugin-react`; uninstall `@chakra-ui/react`, `@emotion/react`, `cloudinary`, `next-themes`, `react-feather`, `workbox-window`; move `nodemon` to devDeps.

5. **Own the socket in `SocketProvider` and clean up listeners (ARCH-2, BUG-7)**, then start breaking up `Home.jsx` (ARCH-1) so the above can actually be tested (TEST-1).

Secondary but cheap: sign the Cloudinary uploads (SEC-4), restore/rewrite the README and un-ignore `.env.example` (DOC-1, CFG-1), and make `npm run lint` green (TEST-2).
