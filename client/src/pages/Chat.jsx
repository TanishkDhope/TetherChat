import React, { useState, useRef, useEffect, useContext, useMemo } from 'react';
import {useParams} from 'react-router-dom';
import { Send, Smile, Sticker } from 'lucide-react';
import { socketContext } from "../contexts/socketContext";
import { io } from 'socket.io-client';
import { useGetUserInfo } from '../hooks/useGetUserInfo';



const STICKER_PACKS = {
  basic: [
    '👍', '❤️', '😊', '🎉', '🌟', '🔥', '👋', '🤝',
    '✨', '💯', '🏆', '🎮', '🎸', '🎨', '📚', '💻'
  ],
  animals: [
    '🐶', '🐱', '🐼', '🐨', '🦊', '🦁', '🐯', '🐮',
    '🐷', '🐸', '🐙', '🦋', '🐬', '🦜', '🦆', '🦉'
  ]
};

const EMOJI_GROUPS = [
  ['😀', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍'],
  ['😎', '🤩', '😋', '😆', '😄', '🥰', '😘', '😗'],
  ['🤔', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄'],
  ['😳', '😱', '😨', '😰', '😢', '😥', '😭', '😫']
];

const Chat = () => {
  const {roomId}=useParams()
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [showEmojis, setShowEmojis] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const messagesEndRef = useRef(null);
  const emojiRef = useRef(null);
  const stickerRef = useRef(null);
  const {socket, setSocket}=useContext(socketContext)
const {displayName, profilePicUrl}=useGetUserInfo()
  const [sender, setSender] = useState("User");
  const [inRoom, setInRoom] = useState([]);

  useEffect(() => {
    // Check if the socket already exists, and if not, establish a new connection
    if (!socket) {
      const newSocket = io("http://localhost:5000");
      setSocket(newSocket);
    }
  
    return () => {
      // Optionally, disconnect socket when the component unmounts (if needed)
      if (socket) {
        socket.disconnect();
        console.log("Socket disconnected on unmount");
      }
    };
  }, [socket, setSocket]); 

  
    useEffect(() => {
  
      if (displayName,socket) 
        {
        socket.emit("join", {displayName, profilePicUrl});
        socket.emit("joinRoom", roomId)
        localStorage.setItem("roomId", roomId)
        console.log("Room id changed")
        socket.emit("get-room-info", roomId)
  
      }
    }, [displayName, socket]);
  
  useEffect(()=>{
    if(socket){
    socket.emit("joinRoom", roomId)
    localStorage.setItem("roomId", roomId)
    console.log("Room id changed")
    socket.emit("get-room-info", roomId)
    }
  },[roomId])

  useEffect(()=>{
    if(socket){
      socket.on("room-info", (roomInfo) => {
        setInRoom(roomInfo.users)
        console.log(roomInfo.users)
      })  

      socket.on("recieve-message", (message) => {
        setMessages(prev => [...prev, {...message, sender: "other"}]);
        console.log(message)
      });
    }
  },[socket])

  useEffect(()=>{
    if(socket){
    inRoom.forEach(user=>{
      if(user.id!==socket.id){
        console.log(user.name)
        setSender(user.name)
      }
    })}
  },[inRoom,setInRoom])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiRef.current && !emojiRef.current.contains(event.target)) {
        setShowEmojis(false);
      }
      if (stickerRef.current && !stickerRef.current.contains(event.target)) {
        setShowStickers(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () =>{ 
      document.removeEventListener('mousedown', handleClickOutside)
    };

    
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (newMessage.trim() === "") return;

    const message = {
      id: Date.now(),
      text: newMessage,
      sender: "user",
      type: "text",
      timestamp: new Date()
    };

    socket.emit("send-message", message, roomId)

    setMessages(prev => [...prev, message]);
    setNewMessage("");
  };

  const addEmoji = (emoji) => {
    setNewMessage(prev => prev + emoji);
    setShowEmojis(false);
  };

  const sendSticker = (sticker) => {
    const message = {
      id: Date.now(),
      text: sticker,
      sender: "user",
      type: "sticker",
      timestamp: new Date()
    };

    socket.emit("send-message", message, roomId)
    
    setMessages(prev => [...prev, message]);
    setShowStickers(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex justify-center items-center">
      <div className="w-full max-w-4xl flex flex-col h-[90vh] mx-4 my-4 bg-white rounded-lg shadow-2xl overflow-hidden">
        {/* Chat Header */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-4 flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-3 h-3 bg-green-400 rounded-full mr-2"></div>
            <h1 className="text-xl font-semibold text-white">{sender}</h1>
          </div>
          <div className="text-sm text-white opacity-80">Online</div>
        </div>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[70%] rounded-lg p-3 shadow-sm ${
                  message.sender === 'user'
                    ? 'bg-blue-500 text-white rounded-br-none'
                    : 'bg-gray-100 text-gray-800 rounded-bl-none'
                } ${message.type === 'sticker' ? 'text-4xl bg-transparent !p-0' : ''}`}
              >
                <p className="break-words">{message.text}</p>
                <span className="text-xs opacity-70 mt-1 block">
                {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Form */}
        <div className="relative px-4 pb-4">
          {/* Emoji Picker */}
          {showEmojis && (
            <div 
              ref={emojiRef}
              className="absolute bottom-full right-16 mb-2 bg-white rounded-lg shadow-lg p-4 border"
            >
              <div className="grid grid-cols-8 gap-2 max-h-48 overflow-y-auto">
                {EMOJI_GROUPS.flat().map((emoji, index) => (
                  <button
                    key={index}
                    onClick={() => addEmoji(emoji)}
                    className="text-2xl hover:bg-gray-100 p-1 rounded transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sticker Picker */}
          {showStickers && (
            <div 
              ref={stickerRef}
              className="absolute bottom-full right-16 mb-2 bg-white rounded-lg shadow-lg p-4 border"
            >
              <div className="space-y-4">
                {Object.entries(STICKER_PACKS).map(([pack, stickers]) => (
                  <div key={pack}>
                    <h3 className="text-sm font-semibold mb-2 capitalize">{pack}</h3>
                    <div className="grid grid-cols-8 gap-2">
                      {stickers.map((sticker, index) => (
                        <button
                          key={index}
                          onClick={() => sendSticker(sticker)}
                          className="text-2xl hover:bg-gray-100 p-1 rounded transition-colors"
                        >
                          {sticker}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form 
            onSubmit={handleSubmit}
            className="bg-white p-4 flex items-center gap-2 border rounded-lg shadow-sm"
          >
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 px-4 py-2 focus:outline-none rounded-full border border-gray-200 focus:border-blue-500 transition-colors"
            />
            <button
              type="button"
              onClick={() => {
                setShowEmojis(!showEmojis);
                setShowStickers(false);
              }}
              className="text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors"
            >
              <Smile className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setShowStickers(!showStickers);
                setShowEmojis(false);
              }}
              className="text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors"
            >
              <Sticker className="w-5 h-5" />
            </button>
            <button
              type="submit"
              className="bg-blue-500 text-white rounded-full p-2 hover:bg-blue-600 transition-colors"
              disabled={!newMessage.trim()}
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Chat;