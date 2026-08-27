import { createContext, useState, useEffect } from "react";

const ThemeContext = createContext({
  isDarkMode: false, // Default value
  setIsDarkMode: () => {},
});

export const ThemeProvider = ({ children }) => {
    const [isDarkMode, setIsDarkMode] = useState(() => {
      const savedTheme = localStorage.getItem("theme");
      if (!savedTheme) return false;
      try {
        // Current format: a JSON boolean ("true"/"false")
        return JSON.parse(savedTheme);
      } catch {
        // Legacy format: a raw string like "dark"/"light"
        return savedTheme === "dark";
      }
    });

  useEffect(() => {
    localStorage.setItem("theme", JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  return (
    <ThemeContext.Provider value={{ isDarkMode, setIsDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeContext;
