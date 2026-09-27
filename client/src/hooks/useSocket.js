import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { auth } from "../Firebase/firebase";
import { SOCKET_URL } from "../lib/config";
import { onIdTokenChanged } from "firebase/auth";

let sharedSocket = null;
let consumerCount = 0;
let teardownTimeout = null;
const listeners = new Set();

function notifyListeners() {
  const isConnected = Boolean(sharedSocket && sharedSocket.connected);
  listeners.forEach((fn) => fn(isConnected));
}

async function getOrInitSocket() {
  if (sharedSocket) {
    if (auth.currentUser && !sharedSocket.connected) {
      const token = await auth.currentUser.getIdToken();
      sharedSocket.auth = { token };
      sharedSocket.connect();
    }
    return sharedSocket;
  }

  const currentUser = auth.currentUser;
  const token = currentUser ? await currentUser.getIdToken() : null;

  sharedSocket = io(SOCKET_URL, {
    auth: { token },
    autoConnect: Boolean(token),
    transports: ["websocket", "polling"],
  });

  sharedSocket.on("connect", () => {
    notifyListeners();
  });

  sharedSocket.on("disconnect", () => {
    notifyListeners();
  });

  return sharedSocket;
}

export function useSocket() {
  const [connected, setConnected] = useState(Boolean(sharedSocket && sharedSocket.connected));
  const [socket, setSocket] = useState(sharedSocket);

  useEffect(() => {
    consumerCount++;
    if (teardownTimeout) {
      clearTimeout(teardownTimeout);
      teardownTimeout = null;
    }

    listeners.add(setConnected);
    let isMounted = true;

    getOrInitSocket().then((s) => {
      if (isMounted) {
        setSocket(s);
        setConnected(Boolean(s && s.connected));
      }
    });

    const unsubToken = onIdTokenChanged(auth, async (currentUser) => {
      if (!currentUser) {
        if (sharedSocket) {
          sharedSocket.disconnect();
          sharedSocket = null;
          if (isMounted) {
            setSocket(null);
            setConnected(false);
          }
        }
        return;
      }

      const token = await currentUser.getIdToken();
      if (sharedSocket) {
        sharedSocket.auth = { token };
        if (!sharedSocket.connected) {
          sharedSocket.connect();
        }
      } else {
        const s = await getOrInitSocket();
        if (isMounted) {
          setSocket(s);
          setConnected(Boolean(s && s.connected));
        }
      }
    });

    return () => {
      isMounted = false;
      consumerCount--;
      listeners.delete(setConnected);
      unsubToken();

      if (consumerCount <= 0) {
        teardownTimeout = setTimeout(() => {
          if (consumerCount <= 0 && sharedSocket) {
            sharedSocket.disconnect();
            sharedSocket = null;
          }
        }, 1000);
      }
    };
  }, []);

  const s = socket || sharedSocket;
  const target = {
    socket: s,
    connected,
    on: (evt, fn) => (s ? s.on(evt, fn) : undefined),
    off: (evt, fn) => (s ? s.off(evt, fn) : undefined),
    emit: (...args) => (s ? s.emit(...args) : undefined),
  };
  return new Proxy(target, {
    get(t, prop) {
      if (s && prop in s) {
        const val = s[prop];
        return typeof val === "function" ? val.bind(s) : val;
      }
      if (prop in t) return t[prop];
      return undefined;
    },
  });
}
