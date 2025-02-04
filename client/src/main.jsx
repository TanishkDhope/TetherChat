import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { SocketProvider } from "./contexts/socketContext";


createRoot(document.getElementById("root")).render(
  <SocketProvider>
    <BrowserRouter>
      <App />
    </BrowserRouter>
    </SocketProvider>

);
