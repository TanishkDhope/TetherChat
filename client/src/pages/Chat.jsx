import React, { useState, useRef, useEffect, useContext } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCheck } from "lucide-react";
import { socketContext } from "../contexts/socketContext";
import { io } from "socket.io-client";
import { useGetUserInfo } from "../hooks/useGetUserInfo";
import { useFirestore } from "../hooks/useFirestore";
import { FaCamera } from "react-icons/fa";
import { MdOutlineMoreVert } from "react-icons/md";
import { IoSearchSharp } from "react-icons/io5";
import { BiSolidVideo } from "react-icons/bi";
import { PiStickerBold } from "react-icons/pi";
import { BsEmojiGrin } from "react-icons/bs";
import { RiSendPlaneFill } from "react-icons/ri";
import { ChatSkeleton } from "../components/ChatSkeleton";
import ThemeContext from "../contexts/ThemeContext";
import { MdCheck } from "react-icons/md";
import { useTransition, animated } from '@react-spring/web';


const bubbleThemes = [
  {
    name: "Default",
    sent: {
      bg: "bg-blue-500",
      text: "text-white",
    },
    received: {
      bg: "bg-gray-800",
      text: "text-white",
    },
  },
  {
    name: "Forest",
    sent: {
      bg: "bg-[#738BD8] dark:bg-[rgb(133,116,238)]",
      text: "text-white",
    },
    received: {
      bg: "bg-[rgb(45,50,68)] dark:bg-[rgb(44,51,68)]",
      text: "text-white",
    },
  },
];

const backgrounds = [
  {
    name: "Leaves",
    lightPreview:
      "url(https://i.pinimg.com/736x/18/5e/6f/185e6fe7d2cc5be9fc9156928daf708d.jpg)",
    darkClass: "dark:bg-gray-900",
  },
  {
    name: "Ocean",
    lightPreview:
      "url(https://i.pinimg.com/736x/28/81/7b/28817bf58ec5b390956117e8f603d692.jpg)",
    darkClass: "dark:bg-sky-950",
  },
  {
    name: "Forest",
    lightPreview:
      "url(https://i.pinimg.com/736x/b5/39/38/b5393867f0b5fcb64858afe1c918672d.jpg)",
    darkClass: "dark:bg-green-950",
  },
  {
    name: "Sunset",
    lightPreview:
      "url(https://i.pinimg.com/736x/82/06/1b/82061b4202291f8918220f3e5d684133.jpg)",
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
  const [selectedBubbleTheme, setSelectedBubbleTheme] = useState("Default");
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
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [send, setSend] = useState(()=>{
    const pref=localStorage.getItem("prefSend")
    return pref?JSON.parse(pref):{
      bg: "bg-blue-500",
      text: "text-white",
    }
  });
  const [recieve, setRecieve] = useState(()=>{
    const pref=localStorage.getItem("prefRecieve")
    return pref?JSON.parse(pref):{
      bg: "bg-gray-800",
      text: "text-white",
    }
  });
  const [backdrop, setBackdrop] = useState(()=>{
    const pref=localStorage.getItem("prefBackdrop")
    return pref?JSON.parse(pref):"url(https://i.pinimg.com/736x/b5/39/38/b5393867f0b5fcb64858afe1c918672d.jpg)"
  });

  const senderRef = useRef(sender);
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedBackground, setSelectedBackground] = useState("Forest");
  
  const [typing, setTyping] = useState(false);
  const [IsSenderTyping, setIsSenderTyping] = useState(false);
  const messagesContainerRef = useRef(null);

  const setBubbleTheme = (sent, recieved) => {
    setSend(sent);
    localStorage.setItem("prefSend", JSON.stringify(sent));
    setRecieve(recieved);
    localStorage.setItem("prefRecieve", JSON.stringify(recieved));
  };
  const transitions = useTransition(messages, {
    keys: message => message.id,
    from: message => ({
      opacity: 0,
      transform: `translateX(${message.sender === displayName ? '50px' : '-50px'})`,
    }),
    enter: { opacity: 1, transform: 'translateX(0px)' },
    leave: { opacity: 0, transform: 'translateY(40px)' },
    config: { tension: 300, friction: 30 },
  });

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

  // IntersectionObserver for scroll detection
  useEffect(() => {
    const container = messagesContainerRef.current;
    const endRef = messagesEndRef.current;
    if (!container || !endRef) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowScrollButton(!entry.isIntersecting); // Show button if not at bottom
      },
      { root: container, threshold: 0.8 } // Reduced threshold for better mobile accuracy
    );

    observer.observe(endRef);

    return () => observer.disconnect();
  }, [messages]);

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
      const newSocket = io("https://chatapp-dcac.onrender.com");
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
              senderRef.current = userData.name;
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
    // Disable vertical scrolling
    document.body.style.overflow = "hidden";

    return () => {
      // Re-enable scrolling when leaving the page
      document.body.style.overflow = "auto";
    };
  }, []);

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
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }
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
    <div 
    style={{
      backgroundPosition: "center", // Centers the background image
      backgroundSize: "cover", // Ensures the image covers the entire container
      backgroundImage: "url(https://images.unsplash.com/photo-1590142035743-0ffa020065e6?q=80&w=2942&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D)"
    }}
    className="min-h-[100dvh] sm:flex justify-center sm:items-center">
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
          <div className="flex flex-row sm:gap-6">
            <button className="hidden sm:block text-3xl dark:text-white cursor-pointer font-bold">
              <IoSearchSharp />
            </button>
            <button className="hidden sm:block text-2xl cursor-pointer dark:text-white font-bold">
              <FaCamera />
            </button>
            <button onClick={()=>{navigate("/call",{ state: { userData, roomId } })}} className="block text-3xl dark:text-white cursor-pointer font-bold">
              <BiSolidVideo />
            </button>
            <div className="relative">
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 cursor-pointer rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <MdOutlineMoreVert className="text-3xl text-gray-700 dark:text-gray-200" />
              </button>

              {isOpen && (
                <div className="overflow-y-auto absolute z-50 right-[-20px]  mt-1 w-80 rounded-xl shadow-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                  <div className="p-4 space-y-4">
                    {/* Background Section */}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                        Chat Background
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        {backgrounds.map((bg) => (
                          <div
                            key={bg.name}
                            className={`
                      relative cursor-pointer transition-all duration-200
                      bg-white dark:bg-gray-800 
                      rounded-xl overflow-hidden
                      border-2 ${
                        selectedBackground === bg.name
                          ? "border-blue-500 dark:border-blue-400"
                          : "border-gray-200 dark:border-gray-700"
                      }
                      hover:shadow-lg transform hover:-translate-y-1
                    `}
                            onClick={() => {
                              setSelectedBackground(bg.name);
                              setBackdrop(bg.lightPreview);
                              localStorage.setItem("prefBackdrop", JSON.stringify(bg.lightPreview));
                            }}
                          >
                            <div className="p-3">
                              <div
                                className="h-16 w-full rounded-lg mb-2"
                                style={{
                                  background: `var(--mode-preview, ${bg.lightPreview})`,
                                }}
                              />
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                  {bg.name}
                                </p>
                                {selectedBackground === bg.name && (
                                  <MdCheck className="text-blue-500 text-xl" />
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Bubble Theme Section */}
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Message Bubbles
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        {bubbleThemes.map((theme) => (
                          <div
                            key={theme.name}
                            className={`
                      relative cursor-pointer transition-all duration-200
                      bg-white dark:bg-gray-800 
                      rounded-xl overflow-hidden
                      border-2 ${
                        selectedBubbleTheme === theme.name
                          ? "border-blue-500 dark:border-blue-400"
                          : "border-gray-200 dark:border-gray-700"
                      }
                      hover:shadow-lg transform hover:-translate-y-1
                    `}
                            onClick={() => {
                              setSelectedBubbleTheme(theme.name);
                              setBubbleTheme(theme.sent, theme.received);
                            }}
                          >
                            <div className="p-3">
                              <div className="flex flex-col space-y-2 mb-2">
                                <div
                                  className={`${theme.received.bg} w-3/4 h-6 rounded-lg`}
                                />
                                <div
                                  className={`${theme.sent.bg} w-3/4 h-6 rounded-lg ml-auto`}
                                />
                              </div>
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                  {theme.name}
                                </p>
                                {selectedBubbleTheme === theme.name && (
                                  <MdCheck className="text-blue-500 text-xl" />
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
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
              backgroundImage: `${backdrop}`,
              backgroundPosition: "center", // Centers the background image
              backgroundSize: "cover", // Ensures the image covers the entire container\
              height: "calc(100dvh - 140px)",
              msOverflowStyle: "none", // For IE and EdgeF
              scrollbarWidth: "none", // For Firefox
            }}
            className="flex-1 p-1 overflow-y-auto space-y-4"
          >
            {loading ? (
              <ChatSkeleton></ChatSkeleton>
            ) :  messages.length === 0 ? (
              // No chats available message
              <div 
                className="w-full h-full flex flex-col items-center justify-center text-gray-500"
                style={{ height: "calc(100dvh - 140px)" }}
              >
                <div className="flex flex-col items-center space-y-4">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-16 w-16 opacity-50"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                  <p className="text-lg font-medium">No messages yet</p>
                  <p className="text-sm">Start a conversation by sending a message!</p>
                </div>
              </div>
            ) : (
              <div
                style={{
                  height: "calc(100dvh - 140px)",
                  msOverflowStyle: "none",
                  scrollbarWidth: "none",
                }}
                ref={messagesContainerRef}
                className="overflow-y-auto flex-1 p-1 sm:p-6 space-y-1 w-full scroll-smooth [&::-webkit-scrollbar]:hidden"
              >
                {transitions((style, message) => (
  <animated.div
    key={message.id}
    style={style}
    className={`flex w-full px-1 py-1 sm:py-2 ${
      message.sender === displayName ? "justify-end" : "justify-start"
    }`}
  >
    <div
      className={`
        relative max-w-[70%] min-w-[140px] p-3 px-4 shadow-lg transition-all
        ${
          message.sender === displayName
            ? `${send.bg} rounded-2xl rounded-br-none ${send.text}`
            : `${recieve.bg} rounded-2xl rounded-bl-none ${recieve.text}`
        }
        ${
          message.type === "sticker"
            ? "text-4xl sm:text-6xl p-3"
            : "text-md sm:text-base p-3"
        }
        transform hover:scale-[1.02]
      `}
    >
      <p className="break-words leading-relaxed">
        {message.text}
      </p>
      <div className="flex items-center justify-end gap-2 ">
        <span className="text-[10px] sm:text-xs opacity-75">
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
  </animated.div>
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
                <div ref={messagesEndRef} className="h-10 w-full" />
              </div>
            )}
          </div>
        )}
        {showScrollButton && (
          <button
            onClick={scrollToBottom}
            className="cursor-pointer fixed bottom-20 sm:bottom-30 sm:left-90 left-5 bg-blue-500 hover:bg-blue-600 text-white p-3 rounded-full shadow-lg 
    transform hover:scale-110 active:scale-95 transition-all duration-200 flex items-center justify-center"
            aria-label="Scroll to bottom"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <polyline points="19 12 12 19 5 12" />
            </svg>
          </button>
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
