import toast from "react-hot-toast";

export const privTrue=()=>{
    return toast('Privacy Mode Enabled', {
        duration: 1000,
        position: 'top-center',
      
        // Styling
        style: {},
        className: '',
      
      
        // Change colors of success/error/loading icon
        iconTheme: {
          primary: '#000',
          secondary: '#fff',
        },
      
        // Aria
        ariaProps: {
          role: 'status',
          'aria-live': 'polite',
        },
      
        // Additional Configuration
        removeDelay: 1000,
      });
    
}

export const privFalse = () => toast('Privacy Mode Disabled', {
    duration: 1000,
    position: 'top-center',
  
    // Styling
    style: {},
    className: '',
  
  
    // Change colors of success/error/loading icon
    iconTheme: {
      primary: '#000',
      secondary: '#fff',
    },
  
    // Aria
    ariaProps: {
      role: 'status',
      'aria-live': 'polite',
    },
  
    // Additional Configuration
    removeDelay: 1000,
  });


  export const notifTrue=()=>toast('Notifications Enabled', {
    duration: 1000,
    position: 'top-center',
  
    // Styling
    style: {},
    className: '',

  
    // Change colors of success/error/loading icon
    iconTheme: {
      primary: '#000',
      secondary: '#fff',
    },
  
    // Aria
    ariaProps: {
      role: 'status',
      'aria-live': 'polite',
    },
  
    // Additional Configuration
    removeDelay: 1000,
  });

  
  export const notifFalse=()=>toast('Notifications Disabled', {
    duration: 1000,
    position: 'top-center',
  
    // Styling
    style: {},
    className: '',
  
  
    // Change colors of success/error/loading icon
    iconTheme: {
      primary: '#000',
      secondary: '#fff',
    },
  
    // Aria
    ariaProps: {
      role: 'status',
      'aria-live': 'polite',
    },
  
    // Additional Configuration
    removeDelay: 1000,
  });