const useMessagingFunctions = () => {
requestNotificationPermission = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        const token = await getToken(messaging, {
          vapidKey: "YOUR_VAPID_PUBLIC_KEY",
        });
        console.log("FCM Token:", token);
        return token;
      } else {
        console.log("Notification permission denied");
      }
    } catch (error) {
      console.error("Error getting token:", error);
    }
  };
  
  // Handle foreground messages
 const listenForNotifications = () => {
    onMessage(messaging, (payload) => {
      console.log("Notification received:", payload);
      new Notification(payload.notification.title, {
        body: payload.notification.body,
        icon: "/icon.png",
      });
    });
  };

  return {listenForNotifications, requestNotificationPermission};

}