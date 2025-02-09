import React, { useState, useRef, useEffect, useContext, useMemo } from "react";
import { useParams } from "react-router-dom";
import { Send, Smile, Sticker } from "lucide-react";
import { socketContext } from "../contexts/socketContext";
import { io } from "socket.io-client";
import { useGetUserInfo } from "../hooks/useGetUserInfo";
import { useFirestore } from "../hooks/useFirestore";
import { FaCamera } from "react-icons/fa";
import { RiCameraAiLine } from "react-icons/ri";
import { MdOutlineMoreVert } from "react-icons/md";
import { IoSearchSharp } from "react-icons/io5";
import { BiSolidVideo } from "react-icons/bi";
import { PiStickerBold } from "react-icons/pi";
import { BsEmojiGrin } from "react-icons/bs";
import { RiSendPlaneFill } from "react-icons/ri";


const STICKER_PACKS = {
  basic: [
    "👍",
    "❤️",
    "😊",
    "🎉",
    "🌟",
    "🔥",
    "👋",
    "🤝",
    "✨",
    "💯",
    "🏆",
    "🎮",
    "🎸",
    "🎨",
    "📚",
    "💻",
  ],
  animals: [
    "🐶",
    "🐱",
    "🐼",
    "🐨",
    "🦊",
    "🦁",
    "🐯",
    "🐮",
    "🐷",
    "🐸",
    "🐙",
    "🦋",
    "🐬",
    "🦜",
    "🦆",
    "🦉",
  ],
};

const EMOJI_GROUPS = [
  ["😀", "😂", "🤣", "😊", "😇", "🙂", "😉", "😍"],
  ["😎", "🤩", "😋", "😆", "😄", "🥰", "😘", "😗"],
  ["🤔", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄"],
  ["😳", "😱", "😨", "😰", "😢", "😥", "😭", "😫"],
];

const Chat = () => {
  const { roomId } = useParams();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [showEmojis, setShowEmojis] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const messagesEndRef = useRef(null);
  const emojiRef = useRef(null);
  const stickerRef = useRef(null);
  const { socket, setSocket } = useContext(socketContext);
  const { displayName, profilePicUrl } = useGetUserInfo();
  const [sender, setSender] = useState(displayName);
  const [inRoom, setInRoom] = useState([]);
  const { storeMessages, getMessages } = useFirestore();
  const [dbMessages, setDbMessages] = useState([]);
  const [senderPic, setSenderPic] = useState(profilePicUrl);

  const senderRef = useRef(sender);

  useEffect(() => {
    senderRef.current = sender; // Update ref when sender changes
    const getMessg = async () => {
      const localMessages = localStorage.getItem(`messages_${roomId}`);
      if (!localMessages) {
        console.log("DisplayName: ", displayName);
        console.log("sender: ", senderRef.current);
        const myMessages = await getMessages(displayName, senderRef.current);
        setDbMessages(myMessages);
      }

      if (localMessages) {
        setMessages(JSON.parse(localMessages));
        console.log("Local Messages Loaded");
      } else if (dbMessages) {
        setMessages(dbMessages);
        console.log("DB Messages Loaded");
      }
    };
    getMessg();
  }, [sender]);

  const messagesRef = useRef(messages); // Create a ref to hold messages

  useEffect(() => {
    messagesRef.current = messages; // Keep ref updated with latest messages
  }, [messages]);

  useEffect(() => {
    // Check if the socket already exists, and if not, establish a new connection
    if (!socket) {
      const newSocket = io("http://localhost:5000");
      setSocket(newSocket);
    }
    return () => {
      // Optionally, disconnect socket when the component unmounts (if needed)
      if (socket) {
        if (messagesRef.current.length > 0) {
          const mssg = JSON.parse(localStorage.getItem(`messages_${roomId}`));
          console.log("local messages: ", messagesRef.length);
          console.log("db messages: ", dbMessages.length);
          if (dbMessages.length !== messagesRef.length) {
            storeMessages(displayName, senderRef.current, mssg);
            console.log("CHANGES NEEDED");
          } else {
            console.log("NO CHANGES Needed");
          }
        }
        console.log("Socket disconnected on unmount");
        socket.disconnect();
      }
    };
  }, [socket, setSocket]);

  useEffect(() => {
    if (displayName && socket) {
      socket.emit("join", { displayName, profilePicUrl });
      socket.emit("joinRoom", roomId, displayName);
      socket.emit("get-room-info", roomId);
    }
  }, [displayName, roomId, socket]);

  //SAVE AND LOAD MESSAGES
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(`messages_${roomId}`, JSON.stringify(messages));
    }
  }, [messages, roomId]);

  useEffect(() => {
    // Load messages from local storage on initial render
  }, [roomId]);

  useEffect(() => {
    if (socket) {
      //ROOM INFO
      socket.on("room-info", (roomInfo) => {
        setInRoom(roomInfo.users);
      });

      socket.on("recieve-message", (message) => {
        setMessages((prev) => {
          // Avoid duplicating messages
          const isDuplicate = prev.some((m) => m.id === message.id);
          return isDuplicate
            ? prev
            : [...prev, { ...message, sender: "other" }];
        });
      });
    }
  }, [socket]);

  useEffect(() => {
    if (socket) {
      const matchingUser = inRoom.find((user) => user.id !== socket.id);
      if (matchingUser) {
        setSender(matchingUser.name);
        setSenderPic(matchingUser.profilePicUrl);
      }
    }
  }, [inRoom, socket]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiRef.current && !emojiRef.current.contains(event.target)) {
        setShowEmojis(false);
      }
      if (stickerRef.current && !stickerRef.current.contains(event.target)) {
        setShowStickers(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
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
      sender: "user", // Make sure sender is "user"
      type: "text",
      timestamp: new Date().toISOString(), // Convert to ISO string to ensure proper date formatting
    };

    socket.emit("send-message", message, roomId);

    setMessages((prev) => [...prev, message]);
    setNewMessage("");
  };

  const addEmoji = (emoji) => {
    setNewMessage((prev) => prev + emoji);
    setShowEmojis(false);
  };

  const sendSticker = (sticker) => {
    const message = {
      id: Date.now(),
      text: sticker,
      sender: "user",
      type: "sticker",
      timestamp: new Date(),
    };

    socket.emit("send-message", message, roomId);

    setMessages((prev) => [...prev, message]);
    setShowStickers(false);
  };

  return (
    <div className="min-h-screen bg-whitefrom-blue-50 to-purple-50 flex justify-center items-center">
      <div className="relative w-3xl max-w-4xl flex flex-col h-[90vh] mx-4 my-4 bg-white rounded-lg shadow-2xl overflow-hidden">
        {/* Chat Header */}
        <div className="bg-[#0A2239] p-4 flex items-center justify-between">
          <div className="flex items-center">
            <img src={senderPic} className="shadow-xs shadow-white w-12 h-12 rounded-full mr-2" />
            <div className="absolute left-11 top-13 w-3 h-3 bg-green-400 rounded-full "></div>
            <div className="flex items-center">
              <h1 className="ml-3 text-lg sm:text-2xl font-bold text-white">
                {sender}
              </h1>
            </div>
          </div>
          <div className="flex flex-row gap-8">
            <button className="hidden sm:block text-2xl text-white cursor-pointer font-bold">
              <IoSearchSharp />
            </button>
            <button className="hidden sm:block text-xl cursor-pointer text-white font-bold">
              <FaCamera />
            </button>
            <button className="hidden sm:block text-2xl text-white cursor-pointer font-bold">
              <BiSolidVideo />
            </button>
            <button className="cursor-pointer text-2xl text-white font-bold">
              <MdOutlineMoreVert />
            </button>
          </div>
        </div>

        {/* Messages Container */}
        {sender !== "User" && (
          <div
            style={{
              backgroundImage: `url(https://cdn.pixabay.com/photo/2023/08/12/02/50/leaves-8184621_1280.png)`,
              backgroundPosition: "center", // Centers the background image
              backgroundSize: "cover", // Ensures the image covers the entire container
            }}
            className="flex-1 p-6 bg-gray-100 overflow-y-auto space-y-4"
          >
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.sender === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[70%] rounded-lg p-3 shadow-md ${
                    message.sender === "user"
                      ? "bg-[#598392] px-5 font-semibold text-white rounded-xl rounded-br-none"
                      : "bg-[#132E32] px-5 font-semibold rounded-xl text-white rounded-bl-none"
                  } ${
                    message.type === "sticker"
                      ? "text-4xl  sm:text-6xl bg-gray-0 p-3"
                      : "text-sm sm:text-xl"
                  }`}
                >
                  <p className="break-words">{message.text}</p>
                  <span className="text-xs opacity-70 mt-1 block">
                    {new Date(message.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

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
                    <h3 className="text-sm font-semibold mb-2 capitalize">
                      {pack}
                    </h3>
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
            className="mt-3 bg-white p-3 flex items-center gap-2 rounded-lg shadow-sm focus-within:border-blue-500 transition-colors" // Added focus-within styling
          >
            
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 min-w-[100px] px-4 py-2 rounded-full border border-gray-200 focus:outline-none focus:ring-0 focus:border-blue-500 transition-colors" // Improved input styling
            />

            <div className="flex items-center space-x-2">
              {" "}
              {/* Grouped emoji/sticker buttons */}
              <button
                type="button"
                onClick={() => {
                  setShowEmojis(!showEmojis);
                  setShowStickers(false);
                }}
                className="cursor-pointer text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <BsEmojiGrin className="w-5.5 h-5.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowStickers(!showStickers);
                  setShowEmojis(false);
                }}
                className="cursor-pointer text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <PiStickerBold className="w-6.5 h-6.5" />
              </button>
              <button
                type="submit"
                className="cursor-pointer bg-blue-500 text-white rounded-full p-2 hover:bg-blue-600 transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed" // Added disabled styling
                disabled={!newMessage.trim()}
              >
                <RiSendPlaneFill className="mr-1 mt-1 w-6 h-6" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Chat;
