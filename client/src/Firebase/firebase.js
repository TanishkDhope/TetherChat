import { initializeApp } from "firebase/app";
import {getAuth} from "firebase/auth";
import {getFirestore} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB69PfZIYj-HK5QGsfSkPXLpnvlWoNDJ_8",
  authDomain: "connectly-9d39a.firebaseapp.com",
  projectId: "connectly-9d39a",
  storageBucket: "connectly-9d39a.firebasestorage.app",
  messagingSenderId: "767279472727",
  appId: "1:767279472727:web:789d944f57476557da0312"
};

export const app = initializeApp(firebaseConfig);
export const db=getFirestore(app);
export const auth=getAuth(app);