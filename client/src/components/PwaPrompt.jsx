import { useEffect, useState } from "react";

const PwaPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Check if the app is already installed
    const isInstalled = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isInstalled) {
      console.log('App is already installed.');
      return;
    }

    // Handle the install prompt event
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      console.log("beforeinstallprompt event fired");
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    try {
      console.log("Triggering install prompt");
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === "accepted") {
        console.log("User accepted the install prompt");
      } else {
        console.log("User dismissed the install prompt");
      }
    } catch (error) {
      console.error("Install error:", error);
    } finally {
      setShowPrompt(false);
      setDeferredPrompt(null);
    }
  };

  const handleReject = () => {
    setShowPrompt(false);
    setDeferredPrompt(null);
    localStorage.setItem("pwaPromptDismissed", Date.now().toString());
  };

  // Check if the user dismissed the prompt recently
  const lastDismissed = localStorage.getItem("pwaPromptDismissed");
  const dismissedRecently = lastDismissed && Date.now() - parseInt(lastDismissed) < 24 * 60 * 60 * 1000;

  if (!showPrompt || dismissedRecently) return null;

  return (
    <div className="fixed top-4 sm:top-6 left-1/2 -translate-x-1/2 z-50 w-[95%] sm:w-[90%] max-w-md animate-fade-in">
      <div className="bg-gray-900/60 backdrop-blur-md text-white p-3 sm:p-4 rounded-xl shadow-lg border border-gray-700/50 flex flex-col sm:flex-row items-center gap-3">
        <div className="flex-1 text-center sm:text-left">
          <h3 className="font-semibold text-sm sm:text-base">Install TetherChat</h3>
          <p className="text-xs sm:text-sm text-gray-300">Add to your home screen for a better experience</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReject}
            className="px-3 py-1.5 text-xs text-gray-300 hover:text-white rounded-lg border border-gray-600 hover:bg-gray-800 transition"
          >
            Maybe Later
          </button>
          <button
            onClick={handleInstall}
            className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-md transition"
          >
            Install App
          </button>
        </div>
      </div>
    </div>
  );
};

export default PwaPrompt;
