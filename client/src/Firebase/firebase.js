import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, GoogleAuthProvider } from "firebase/auth";
import { getMessaging, getToken, isSupported as isMessagingSupported } from "firebase/messaging";
import { getAnalytics, isSupported as isAnalyticsSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyB69PfZIYj-HK5QGsfSkPXLpnvlWoNDJ_8",
  authDomain: "connectly-9d39a.firebaseapp.com",
  projectId: "connectly-9d39a",
  storageBucket: "connectly-9d39a.firebasestorage.app",
  messagingSenderId: "767279472727",
  appId: "1:767279472727:web:789d944f57476557da0312",
  measurementId: "G-96WBMN457B"
};

export const app = initializeApp(firebaseConfig);
export const googleProvider = new GoogleAuthProvider();
export const auth = getAuth(app);

// Connect to Firebase Auth emulator in development
if (import.meta.env.DEV) {
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
}

// Analytics with isSupported guard
export let analytics = null;
if (typeof window !== "undefined") {
  isAnalyticsSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  }).catch(() => {});
}

// Messaging with isSupported guard
export let messaging = null;
if (typeof window !== "undefined") {
  isMessagingSupported().then((supported) => {
    if (supported) {
      messaging = getMessaging(app);
    }
  }).catch(() => {});
}

export const generateToken = async () => {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return;
  }
  try {
    const supported = await isMessagingSupported();
    if (!supported) return;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return;
    }
    const msg = messaging || getMessaging(app);
    await getToken(msg, {
      vapidKey: "BEv_r260bibAuv3QVsOkaX9kVtznG-KIpopsPJSdmnLGz-WhZM1s1Aq9Pf8SS8P9DLJ5hxAHEJT5T_XFspMcJ9M",
    });
  } catch (error) {
    // Suppress notification errors in development / unsupported environments
  }
};
