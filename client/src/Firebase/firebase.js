import { initializeApp } from "firebase/app";
import {getAuth} from "firebase/auth";
import {getFirestore} from "firebase/firestore";
import { GoogleAuthProvider } from "firebase/auth";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { getAnalytics } from "firebase/analytics";

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
export const db=getFirestore(app);
export const googleProvider=new GoogleAuthProvider(app);
export const auth=getAuth(app);
const analytics = getAnalytics(app);
export const messaging = getMessaging(app);

export const generateToken=async()=>{
  const permission = await Notification.requestPermission();
  console.log(permission);
  if(permission!=="granted"){
    return;
  }
  try {
    const token = await getToken(messaging, { 
      vapidKey: 
      "BEv_r260bibAuv3QVsOkaX9kVtznG-KIpopsPJSdmnLGz-WhZM1s1Aq9Pf8SS8P9DLJ5hxAHEJT5T_XFspMcJ9M" 
    });
    console.log(token);
  } catch (error) {
    console.error("Error retrieving FCM registration token:", error);
  }
}
