import { useEffect, useState } from "react";

const PwaPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    // Check if the app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      console.log('App is already installed');
      return;
    }

    // Check if the app is installable
    const checkInstallable = async () => {
      if ('getInstalledRelatedApps' in navigator) {
        const relatedApps = await navigator.getInstalledRelatedApps();
        setIsInstallable(!relatedApps.length);
      }
    };

    checkInstallable();

    // Listen for the beforeinstallprompt event
    const handler = (e) => {
      console.log('beforeinstallprompt fired');
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    // Check if we should show the install prompt immediately
    if (window.deferredPrompt) {
      console.log('Using existing deferredPrompt');
      setDeferredPrompt(window.deferredPrompt);
      setShowPrompt(true);
    }

    window.addEventListener("beforeinstallprompt", handler);

    // Check PWA install status after mounting
    setTimeout(() => {
      if (!showPrompt && isInstallable) {
        console.log('Forcing prompt display after timeout');
        setShowPrompt(true);
      }
    }, 3000);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [showPrompt, isInstallable]);

  const handleInstall = async () => {
    if (deferredPrompt) {
      try {
        console.log('Triggering install prompt');
        await deferredPrompt.prompt();
        const choiceResult = await deferredPrompt.userChoice;
        console.log('Install choice:', choiceResult.outcome);
        
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt');
        } else {
          console.log('User dismissed the install prompt');
        }
      } catch (error) {
        console.error('Install error:', error);
      } finally {
        setDeferredPrompt(null);
        setShowPrompt(false);
      }
    }
  };

  const handleReject = () => {
    setShowPrompt(false);
    setDeferredPrompt(null);
    
    // Store the user's preference
    localStorage.setItem('pwaPromptDismissed', Date.now().toString());
  };

  // Don't show if already installed or recently dismissed
  const lastDismissed = localStorage.getItem('pwaPromptDismissed');
  const dismissedRecently = lastDismissed && (Date.now() - parseInt(lastDismissed)) < 24 * 60 * 60 * 1000;
  
  if (!showPrompt || dismissedRecently) return null;

  return (
    <div className="fixed top-4 sm:top-6 left-29/30 sm:left-1/2 -translate-x-1/2 z-50 w-[95%] sm:w-[90%] max-w-md animate-fade-in">
      <div className="bg-gray-900/60 backdrop-blur-[2px] text-white p-3 sm:p-4 rounded-xl shadow-xl 
        border border-gray-700/30 flex flex-col sm:flex-row items-center gap-3 sm:gap-4 
        transform transition-all duration-300 hover:bg-gray-900/70">
        <div className="flex-1 text-center sm:text-left">
          <h3 className="font-semibold text-sm sm:text-base mb-0.5 sm:mb-1">Install TetherChat</h3>
          <p className="text-xs sm:text-sm text-gray-200/90">
            Add to your home screen for a better experience
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={handleReject}
            className="cursor-pointer flex-1 sm:flex-initial px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm 
              text-gray-300 hover:text-white rounded-lg border border-gray-600/50 
              hover:bg-gray-800/50 active:bg-gray-800/70 
              transition-colors duration-200"
          >
            Maybe Later
          </button>
          <button
            onClick={handleInstall}
            className="cursor-pointer flex-1 sm:flex-initial px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm 
              bg-blue-600/90 hover:bg-blue-700 active:bg-blue-800 
              text-white rounded-lg transition-colors duration-200 
              shadow-lg shadow-blue-500/10"
          >
            Install App
          </button>
        </div>
      </div>
    </div>
  );
};

export default PwaPrompt;