importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js");


firebase.initializeApp({
    apiKey: "AIzaSyB69PfZIYj-HK5QGsfSkPXLpnvlWoNDJ_8",
  authDomain: "connectly-9d39a.firebaseapp.com",
  projectId: "connectly-9d39a",
  storageBucket: "connectly-9d39a.appspot.com",
  messagingSenderId: "767279472727",
  appId: "1:767279472727:web:789d944f57476557da0312",
  measurementId: "G-96WBMN457B"
  });
  
  const messaging = firebase.messaging();
  
  messaging.onBackgroundMessage((payload) => {
    console.log("Received background message: ", payload);
    self.registration.showNotification(payload.notification.title, {
      body: payload.notification.body,
      icon: payload.notification.icon || "/logo.png",
    });
  });