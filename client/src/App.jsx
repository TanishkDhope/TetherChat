import "./App.css";
import { Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import Home from "./pages/Home";
import Chat from "./pages/Chat";
import VideoCall from "./pages/VideoCall";



function App() {
  return (

      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/home" element={<Home />} />
        <Route path="/chat/:roomId" element={<Chat />} />
        <Route path="/call" element={<VideoCall />} />
      </Routes>

  );
}

export default App;
