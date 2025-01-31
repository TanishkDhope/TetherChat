import React, { useEffect, useState, useMemo } from "react";
import { auth } from "../Firebase/firebase";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { useGetUserInfo } from "../hooks/useGetUserInfo";
import { io } from "socket.io-client";

function Home() {
  const navigate = useNavigate();
  const {  isAuth, displayName } = useGetUserInfo(); // Assume `user` contains displayName and profile picture
  const [onlineUsers, setOnlineUsers] = useState([]);
  const socket = useMemo(() => io("http://localhost:5000"), []);


  useEffect(() => {
    if (!isAuth) {
      navigate("/");
    }
  }, [isAuth, navigate]);

  useEffect(() => {
    if (displayName) {
      socket.emit("join", displayName);

      socket.on("onlineUsers", (users) => {
        console.log("Online users:", users);
        setOnlineUsers(users);
      });

      return () => {
        socket.disconnect();
      };
    }
  }, [socket, displayName]);

  const handleSignOut = async () => {
    try {
      socket.disconnect();
      await signOut(auth);
      localStorage.clear();
      navigate("/");
    } catch (err) {
      console.log(err);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      {/* Header with Display Name and Icon */}
      <header className="bg-white shadow-lg p-4 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <img
            src={"https://i.pravatar.cc/120"}
            alt="Profile"
            className="w-15 h-15 rounded-full"
          />
          <h1 className="text-xl font-semibold text-gray-800">
            {displayName}
          </h1>
        </div>
        <button
          onClick={handleSignOut}
          className="bg-red-500 text-white py-2 px-4 rounded-lg font-semibold hover:bg-red-600 transition duration-300"
        >
          Sign Out
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <h2 className="text-2xl font-bold text-gray-700 mb-4">Welcome to the Chat App!</h2>
        <p className="text-gray-600 text-center">
          Chat and connect with your friends in real-time.
        </p>
      </main>

      {/* Online Users List */}
      <footer className="bg-white shadow-lg p-4">
        <h3 className="text-lg font-bold text-gray-800 mb-2">Online Users</h3>
        <ul className="space-y-2">
          {onlineUsers.length > 0 ? (
            onlineUsers.map((user, index) => (
              <li
                key={index}
                className="flex items-center space-x-4 p-2 bg-gray-100 rounded-lg"
              >
                <img
                  src={"https://i.pravatar.cc/120"}
                  className="w-20 h-20 rounded-full"
                />
                <span className="text-gray-700 font-medium">{user.name}</span>
              </li>
            ))
          ) : (
            <p className="text-gray-500 text-sm">No users online</p>
          )}
        </ul>
      </footer>
    </div>
  );
}

export default Home;
