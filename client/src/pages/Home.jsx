import React, { useEffect, useState, useMemo, useContext } from "react";
import { auth } from "../Firebase/firebase";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { useGetUserInfo } from "../hooks/useGetUserInfo";
import { connect, io } from "socket.io-client";
import { X, UserPlus } from 'lucide-react';
import {nanoid} from "nanoid"
import { socketContext } from "../contexts/socketContext";


function Home() {
  const navigate = useNavigate();
  const {  isAuth, displayName, profilePicUrl } = useGetUserInfo(); // Assume `user` contains displayName and profile picture
  const [onlineUsers, setOnlineUsers] = useState([]);
  const { socket, setSocket } = useContext(socketContext);
  setSocket(useMemo(() => io("http://localhost:5000"), []));



  const [joinInfo,setJoinInfo]=useState({})

  


  useEffect(() => {
    if (!isAuth) {

      navigate("/");
    }
  }, [isAuth, navigate]);

 

  useEffect(() => {

    if (displayName && socket) 
      {
      socket.emit("join", {displayName, profilePicUrl});

      socket.on("onlineUsers", (users) => {
        setOnlineUsers(users);
      });

      socket.on("requestJoin", ({from,roomId})=>{
        setJoinInfo({from,roomId})
        socket.emit("joinRoom", roomId)
        setIsVisible(true);
      })


     
    }
  }, [displayName, socket]);


  const handleJoinRoom = (user) => {
    const roomId = nanoid();
    socket.emit("joinRoom", roomId);
    setJoinInfo({from: displayName, roomId});
    navigate(`/chat/${roomId}`);
    socket.emit("requestJoin", {from: displayName, to: user.id, roomId});
  }

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

  const [isVisible, setIsVisible] = useState(false);


  const handleAccept = () => {
    setIsVisible(false);
    navigate(`/chat/${joinInfo.roomId}`);
  };

  const handleDecline = () => {
    setIsVisible(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      {/* Header with Display Name and Icon */}
      <header className="bg-white shadow-lg p-4 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <img
            src={profilePicUrl || "https://i.pravatar.cc/120"}
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
          {onlineUsers?.length > 0 ? (
            onlineUsers.map((user, index) => (
              <li
                key={index}
                onClick={()=>handleJoinRoom(user)}
                className="flex items-center space-x-4 p-2 bg-gray-100 rounded-lg"
              >
                <img
                  src={user.profilePicUrl}
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
      <div
      className={`fixed bottom-4 right-4 transform transition-all duration-500 ease-in-out ${
        isVisible ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="bg-white rounded-lg shadow-lg p-4 flex items-center gap-4 border border-gray-200 max-w-md">
        <div className="bg-blue-100 p-2 rounded-full">
          <UserPlus className="w-6 h-6 text-blue-600" />
        </div>

        <div className="flex-1">
          <h3 className="font-medium text-gray-900">Room Join Request</h3>
          <p className="text-sm text-gray-600">
            {joinInfo.from} wants you to join room {joinInfo.roomId?joinInfo.roomId:"No Room Id"}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleAccept}
            className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
          >
            Accept
          </button>
          <button
            onClick={handleDecline}
            className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300 transition-colors"
          >
            Decline
          </button>
        </div>

        <button
          onClick={handleDecline}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
    </div>
  );
}

export default Home;
