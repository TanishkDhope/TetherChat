import React, { useState, useRef, useEffect, useContext, useMemo } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCheck, Send, Smile, Sticker } from "lucide-react";
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
import styled from "styled-components";
import { ChatSkeleton } from "../components/ChatSkeleton";
import ThemeContext from "../contexts/ThemeContext";

const backgrounds = [
  {
    name: "Classic",
    lightPreview:
      "url(https://i.pinimg.com/736x/d6/04/22/d604223123c953c23f42651e7bf6c25e.jpg)",
    darkPreview:
      "url(https://i.pinimg.com/736x/d6/04/22/d604223123c953c23f42651e7bf6c25e.jpg)",
    lightClass:
      "url(https://i.pinimg.com/736x/d6/04/22/d604223123c953c23f42651e7bf6c25e.jpg)",
    darkClass: "dark:bg-gray-900",
  },
  {
    name: "Ocean",
    lightPreview: "linear-gradient(to right, #e0f2fe, #bae6fd)",
    darkPreview: "linear-gradient(to right, #0c4a6e, #082f49)",
    lightClass: "bg-sky-50",
    darkClass: "dark:bg-sky-950",
  },
  {
    name: "Forest",
    lightPreview: "linear-gradient(to right, #dcfce7, #bbf7d0)",
    darkPreview: "linear-gradient(to right, #14532d, #052e16)",
    lightClass: "bg-green-50",
    darkClass: "dark:bg-green-950",
  },
  {
    name: "Sunset",
    lightPreview: "linear-gradient(to right, #fff7ed, #ffedd5)",
    darkPreview: "linear-gradient(to right, #7c2d12, #431407)",
    lightClass: "bg-orange-50",
    darkClass: "dark:bg-orange-950",
  },
];

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
  const [loading, setLoading] = useState(true);
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
  const [sender, setSender] = useState(null);
  const [inRoom, setInRoom] = useState([]);
  const { storeMessages, getMessages } = useFirestore();
  const [senderPic, setSenderPic] = useState(null);
  const [senderObject, setSenderObject] = useState(null);
  const location = useLocation();
  const userData = location.state?.userData;
  const { isDarkMode } = useContext(ThemeContext);

  const senderRef = useRef(sender);
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedBackground, setSelectedBackground] = useState("Classic");
  const [typing, setTyping] = useState(false);
  const [IsSenderTyping, setIsSenderTyping] = useState(false);
const typingTimeout = useRef(null);


const handleTyping = (e) => {
  const message = e.target.value;

if (!typing) {
  setTyping(true);
  socket.emit("typing", true, roomId);
}

// Clear previous timeout to avoid multiple delayed executions
if (message.trim() === "") {
  setTimeout(() => {
    setTyping(false);
    socket.emit("typing", false, roomId);
  }, 500);
}
};

  const handleViewMessages = () => {
    const localMessages = JSON.parse(
      localStorage.getItem(`messages_${roomId}`)
    );
    let viewedUpdateCount = 0;
    const updatedMessages = localMessages.map((message) => {
      // Check if the message is from someone else and is not already viewed
      if (message.sender !== displayName && !message.viewed) {
        viewedUpdateCount++; // Increment the count if viewed is being changed
        return { ...message, viewed: true };
      }
      return message;
    });
    console.log(viewedUpdateCount);
    console.log("Updated Messages:", updatedMessages);
    setMessages(updatedMessages);
  };

  useEffect(() => {
    const getMessg = async () => {
      setLoading(true); // Start loading

      const localMessages = localStorage.getItem(`messages_${roomId}`);
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (localMessages) {
        setMessages(JSON.parse(localMessages));
        console.log("Local Messages Loaded");
      } else {
        try {
          const myMessages = await getMessages(displayName, userData?.name);
          localStorage.setItem(`msgLen_${roomId}`, myMessages?.length);
          console.log("MyMessages: ", myMessages);

          if (myMessages?.length) {
            setMessages(myMessages);
            localStorage.setItem(
              `messages_${roomId}`,
              JSON.stringify(myMessages)
            );
          }
        } catch (error) {
          console.error("Error fetching messages:", error);
        }
      }

      setLoading(false); // Stop loading
    };

    getMessg();
  }, [socket, displayName]);

  useEffect(() => {
    const htmlElement = document.documentElement;
    if (isDarkMode) {
      htmlElement.classList.add("dark");
    } else {
      htmlElement.classList.remove("dark");
    }
  }, [isDarkMode]);

  useEffect(() => {
    senderRef.current = sender;
  }, [sender, setSender]);

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
        socket.emit("leaveRoom", roomId, displayName);
        socket.emit("update-room-info", roomId);
        socket.emit("get-room-info", roomId);
        const dbLen = JSON.parse(localStorage.getItem(`msgLen_${roomId}`));
        
        if (messagesRef.current.length > 0) {
          if (dbLen !== messagesRef.current.length) {
            if (senderRef.current == null) {
              senderRef.current = displayName;
            }
            storeMessages(displayName, senderRef.current, messagesRef.current);
            localStorage.setItem(
              `msgLen_${roomId}`,
              JSON.stringify(messagesRef.current.length)
            );
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
      socket.emit("join", {
        displayName,
        profilePicUrl,
        isOnline: localStorage.getItem("isOnline"),
      });
      socket.emit("joinRoom", roomId, displayName);
      socket.emit("get-room-info", roomId);
      socket.emit("update-room-info", roomId);
    }
  }, [roomId, socket]);

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
        console.log(roomInfo.users);
      });

      socket.on("user-details", (user) => {
        setSenderObject(user);
      });

      socket.on("user-notif", (user, message) => {
        if (!user) {
          return;
        }
        console.log(user);
        socket.emit("message-notif", message, user.id, displayName, roomId);
      });

      socket.on("recieve-message", (message) => {
        setMessages((prev) => {
          // Avoid duplicating messages
          const isDuplicate = prev.some((m) => m.id === message.id);
          return isDuplicate ? prev : [...prev, { ...message }];
        });
      });

      socket.on("IsSenderTyping", (state) => {
        if (state !== null) {
          setIsSenderTyping(state);
        } else {
          setIsSenderTyping(false);
        }
      });
    }
  }, [socket]);

  useEffect(() => {
    if (sender) {
      socket.emit("get-user-details", sender);
    }
  }, [sender]);

  useEffect(() => {
    if (socket) {
      const matchingUser = inRoom.find((user) => user.id !== socket.id);
      if (matchingUser) {
        setSender(matchingUser.name);
        // handleViewMessages();
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
  }, [messages, IsSenderTyping]);

  const handleSubmit = (e) => {
    socket.emit("typing", false, roomId);
    e.preventDefault();
    if (newMessage.trim() === "") return;

    const message = {
      id: Date.now(),
      text: newMessage,
      sender: displayName, // Make sure sender is "user"
      type: "text",
      viewed: false,
      timestamp: new Date().toISOString(), // Convert to ISO string to ensure proper date formatting
    };
    console.log(userData?.name);
    if (inRoom.length === 2) {
      message.viewed = true;
    } else if (inRoom.length === 1) {
      if (userData?.name == displayName) {
        message.viewed = true;
      } else {
        socket.emit("get-user-notif", userData?.name, message);
      }
    }

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
      sender: displayName,
      viewed: false,
      type: "sticker",
      timestamp: new Date(),
    };

    socket.emit("send-message", message, roomId);

    setMessages((prev) => [...prev, message]);
    setShowStickers(false);
  };

  return (
    <div className="min-h-[100dvh] bg-white from-blue-50 to-purple-50 sm:flex justify-center sm:items-center">
      <div className="relative h-[100dvh] width-screen sm:w-3xl sm:max-w-4xl flex flex-col h-[90vh] sm:h-[90vh] sm:mx-4 sm:my-4 bg-white sm:rounded-lg shadow-2xl overflow-hidden">
        {/* Chat Header */}
        <div className="bg-gray-200 shadow-3xl dark:bg-[#0A2239] p-4 flex items-center justify-between h-20">
          <div className="flex items-center">
            <ArrowLeft
              className="text-xl mr-1 text-black dark:text-white cursor-pointer hover:text-gray-400 transition-colors"
              onClick={() => navigate("/home")}
            />
            <img
              src={sender ? senderPic : userData?.profilePicUrl}
              className="cursor-pointer w-12 h-12 sm:w-16 sm:h-16 rounded-full shadow-md"
            />
            {userData.isOnline === "online" && (
              <div className="absolute left-20 top-13 w-3 h-3 bg-green-400 rounded-full "></div>
            )}
            <div className="flex flex-col items-start">
              <h1 className="ml-3 text-lg sm:text-2xl font-bold text-black dark:text-white">
                {sender ? sender : userData?.name}
              </h1>

              <p className="ml-4 text-gray-500 dark:text-gray-300  text-xs">
                {userData?.status || "Available"}
              </p>
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
            <div className="relative">
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <MdOutlineMoreVert className="text-2xl text-gray-700 dark:text-gray-200" />
              </button>

              {isOpen && (
                <div className="absolute z-100 right-0 mt-2 w-64 rounded-lg shadow-lg bg-gray-100 shadow-lg dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                  <div className="p-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                      Chat Background
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {backgrounds.map((bg) => (
                        <div
                          key={bg.name}
                          className={`
                    cursor-pointer transition-all duration-200
                    bg-gray-100 dark:bg-gray-800 
                    rounded-lg shadow-sm overflow-hidden
                    border border-gray-200 dark:border-gray-700
                    hover:scale-105
                    ${
                      selectedBackground === bg.name
                        ? "ring-2 ring-blue-500"
                        : ""
                    }
                  `}
                          onClick={() => setSelectedBackground(bg.name)}
                        >
                          <div className="p-3">
                            <div
                              className="h-12 w-full rounded-md mb-2"
                              style={{
                                background: `var(--mode-preview, ${bg.lightPreview})`,
                              }}
                            />
                            <p className="text-sm text-center text-gray-700 dark:text-gray-200">
                              {bg.name}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Messages Container */}
        {sender !== "User" && (
          <div
            style={{
              backgroundImage: `url(https://i.pinimg.com/736x/d6/04/22/d604223123c953c23f42651e7bf6c25e.jpg)`,
              backgroundPosition: "center", // Centers the background image
              backgroundSize: "cover", // Ensures the image covers the entire container\
              height: "calc(100dvh - 140px)",
            }}
            className="flex-1 p-1 bg-gray-100 overflow-y-auto space-y-4"
          >
            {loading ? (
              // <div className="p-5">
              //   <StyledWrapper className="sm:block hidden mt-100 ">
              //     <div>
              //       <div className="jelly-triangle">
              //         <div className="jelly-triangle__dot" />
              //         <div className="jelly-triangle__traveler" />
              //       </div>
              //       <svg width={0} height={0} className="jelly-maker">
              //         <defs>
              //           <filter id="uib-jelly-triangle-ooze">
              //             <feGaussianBlur
              //               in="SourceGraphic"
              //               stdDeviation="7.3"
              //               result="blur"
              //             />
              //             <feColorMatrix
              //               in="blur"
              //               mode="matrix"
              //               values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
              //               result="ooze"
              //             />
              //             <feBlend in="SourceGraphic" in2="ooze" />
              //           </filter>
              //         </defs>
              //       </svg>
              //     </div>
              //   </StyledWrapper>

              //   <div className="sm:hidden block mt-6 flex flex-col sm:space-y-6 space-y-4 w-full max-w-3xl">
              //     <div className="flex items-start space-x-3">
              //       <div className="h-8 w-8 rounded-full bg-gray-600 animate-pulse" />
              //       <div className="flex-1 space-y-2">
              //         <div className="h-3 w-20 bg-gray-600 rounded animate-pulse" />
              //         <div className="space-y-2">
              //           <div className="h-4 w-3/4 bg-gray-600 rounded animate-pulse" />
              //           <div className="h-4 w-1/2 bg-gray-600 rounded animate-pulse" />
              //         </div>
              //       </div>
              //     </div>

              //     <div className="flex items-start space-x-3 justify-end">
              //       <div className="flex-1 space-y-2">
              //         <div className="h-3 w-20 bg-gray-600 rounded animate-pulse ml-auto" />
              //         <div className="space-y-2">
              //           <div className="h-4 w-2/3 bg-gray-600 rounded animate-pulse ml-auto" />
              //           <div className="h-4 w-1/2 bg-gray-600 rounded animate-pulse ml-auto" />
              //         </div>
              //       </div>
              //       <div className="h-8 w-8 rounded-full bg-gray-600 animate-pulse" />
              //     </div>
              //   </div>
              // </div>
              <ChatSkeleton></ChatSkeleton>
            ) : (
              <div>
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex w-full px-4 py-2 ${
                      message.sender === displayName
                        ? "justify-end"
                        : "justify-start"
                    }`}
                  >
                    <div
                      className={`
      relative max-w-[70%] min-w-[120px] p-2 px-4 shadow-lg transition-all
      ${
        message.sender === displayName
          ? "bg-gray-900 rounded-2xl rounded-br-none"
          : "bg-[#132E32] rounded-2xl rounded-bl-none"
      }
      ${
        message.type === "sticker"
          ? "text-4xl sm:text-6xl p-3"
          : "text-sm sm:text-base"
      }
      transform hover:scale-[1.02]
    `}
                    >
                      <p className="text-white font-semibold break-words leading-relaxed">
                        {message.text}
                      </p>
                      <div className="flex items-center justify-end gap-2 ">
                        <span className="text-[10px] text-white sm:text-xs opacity-75">
                          {new Date(message.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {message.sender === displayName && (
                          <div className="flex gap-0.5">
                            <CheckCheck
                              className={`w-4 h-4 ${
                                message.viewed
                                  ? "text-blue-400"
                                  : "text-gray-400"
                              }`}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {IsSenderTyping ? (
                  <div className="flex w-full px-4 py-2 justify-start">
                    <div
                      className="
      relative max-w-[70%] p-4 px-4 shadow-lg transition-all
      bg-[#132E32] rounded-2xl rounded-bl-none
      text-sm sm:text-base
      transform hover:scale-[1.02]
    "
                   
                    >
                      <div className="text-white">
                        <div className="flex flex-row gap-1">
                          <div className="w-2 h-2 rounded-full bg-gray-200 animate-bounce [animation-delay:.7s]"></div>
                          <div className="w-2 h-2 rounded-full bg-gray-200 animate-bounce [animation-delay:.3s]"></div>
                          <div className="w-2 h-2 rounded-full bg-gray-200 animate-bounce [animation-delay:.7s]"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <></>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        )}

        {/* Input Form */}
        <div className="relative">
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
            className="bg-gray-50 shadow-3xl h-15 dark:bg-[#0A2239] px-3 flex items-center gap-2 text-black dark:text-white shadow-sm focus-within:border-blue-500 transition-colors" // Added focus-within styling
          >
            <input
              type="text"
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value);
                handleTyping(e);
              }}
              placeholder="Type a message..."
              className="flex-1 text-gray-800 dark:text-gray-200 min-w-[100px] px-4 py-2 rounded-full border border-gray-200 dark:border-gray-500 focus:outline-none focus:ring-0 focus:border-blue-500 transition-colors" // Improved input styling
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
                className="cursor-pointer text-gray-800 dark:text-gray-200 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <BsEmojiGrin className="w-5.5 h-5.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowStickers(!showStickers);
                  setShowEmojis(false);
                }}
                className="cursor-pointer text-gray-800 dark:text-gray-200 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <PiStickerBold className="w-6.5 h-6.5" />
              </button>
              <button
                type="submit"
                className="cursor-pointer bg-blue-500 text-white rounded-full p-2 hover:bg-blue-600 transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed" // Added disabled styling
                disabled={!newMessage.trim() || loading}
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
