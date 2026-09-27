import "./App.css";
import { Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import Home from "./pages/Home";
import Chat from "./pages/Chat";
import Videocall from "./pages/video-call";
import { AuthProvider } from "./contexts/AuthContext";
import { IS_MAINTENANCE } from "./lib/config";
import MaintenanceGate from "./components/MaintenanceGate";

function App() {
  if (IS_MAINTENANCE) {
    return <MaintenanceGate />;
  }

  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/home" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/chat/:roomId" element={<Chat />} />
        <Route path="/vc" element={<Videocall />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
