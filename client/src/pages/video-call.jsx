import { useState, useRef, useEffect } from "react"
import { useSpring, animated } from "@react-spring/web"
import { gsap } from "gsap"
import { Button } from "@/components/ui/button"
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Settings, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { useMobile } from "@/hooks/use-mobile"
import io from "socket.io-client"

export default function Videocall() {
  const [isCallActive, setIsCallActive] = useState(false)
  const [isMicOn, setIsMicOn] = useState(true)
  const [isVideoOn, setIsVideoOn] = useState(true)
  const [connected, setConnected] = useState(false)
  const [callStatus, setCallStatus] = useState("") // "connecting", "connected", "ended"
  const [isFullscreen, setIsFullscreen] = useState(false)
  
  const socket = io("https://chatapp-dcac.onrender.com")
  const peerConnection = useRef(null)
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const controlsRef = useRef(null)
  const containerRef = useRef(null)
  
  // Use the fixed hook
  const isMobile = useMobile()
  
  // Fallback in case the hook doesn't work properly
  const [internalIsMobile, setInternalIsMobile] = useState(false)
  
  useEffect(() => {
    if (typeof window !== "undefined") {
      const checkIfMobile = () => {
        setInternalIsMobile(window.innerWidth < 768)
      }
      checkIfMobile()
      window.addEventListener("resize", checkIfMobile)
      return () => window.removeEventListener("resize", checkIfMobile)
    }
  }, [])

  // Use either the hook value or the internal fallback
  const mobileView = isMobile !== undefined ? isMobile : internalIsMobile

  // Animation for local video container
  const localVideoAnimation = useSpring({
    width: isCallActive ? (mobileView ? "40%" : "25%") : "100%",
    height: isCallActive ? (mobileView ? "30%" : "25%") : "100%",
    right: isCallActive ? (mobileView ? "8px" : "24px") : "0px",
    bottom: isCallActive ? (mobileView ? "100px" : "24px") : "0px",
    borderRadius: isCallActive ? "16px" : "0px",
    zIndex: isCallActive ? 30 : 10,
    config: { tension: 280, friction: 60 },
  })

  // Animation for remote video container
  const remoteVideoAnimation = useSpring({
    opacity: isCallActive ? 1 : 0,
    transform: isCallActive ? "scale(1)" : "scale(0.8)",
    config: { tension: 280, friction: 60 },
  })

  // Animation for call status indicator
  const statusAnimation = useSpring({
    opacity: callStatus ? 1 : 0,
    transform: callStatus ? "translateY(0px)" : "translateY(-20px)",
    config: { tension: 280, friction: 60 },
  })

  useEffect(() => {
    socket.on("offer", async (offer) => {
      console.log("Received offer")
      createAnsElems(offer)
    })

    socket.on("answer", async (answer) => {
      if (peerConnection.current) {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer))
        setCallStatus("connected")
      }
    })

    socket.on("ice-candidate", async (candidate) => {
      if (!peerConnection.current) {
        console.warn("PeerConnection is not initialized. Storing candidate...")
        return
      }

      if (!peerConnection.current.remoteDescription) {
        console.warn("Remote description not set yet. Retrying in 500ms...")
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      try {
        await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate))
        console.log("ICE Candidate added successfully")
      } catch (error) {
        console.error("Error adding ICE Candidate:", error)
      }
    })

    socket.on("hangup", () => {
      if (peerConnection.current) {
        endCall()
      } else {
        if (isCallActive) {
          setIsCallActive(false)
          setCallStatus("ended")
          setTimeout(() => setCallStatus(""), 3000)
        }
      }
    })

    return () => {
      socket.off("offer")
      socket.off("answer")
      socket.off("ice-candidate")
      socket.off("hangup")
    }
  }, [isCallActive])

  // Setup local video stream
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      navigator.mediaDevices
        ?.getUserMedia({ video: true, audio: true })
        .then((stream) => {
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream
          }
        })
        .catch((err) => {
          console.error("Error accessing media devices:", err)
          setIsVideoOn(false)
          // Try to get audio only if video fails
          navigator.mediaDevices
            ?.getUserMedia({ video: false, audio: true })
            .then((stream) => {
              if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream
              }
            })
            .catch((audioErr) => {
              console.error("Error accessing audio devices:", audioErr)
              setIsMicOn(false)
            })
        })
    }

    return () => {
      // Clean up streams when component unmounts
      if (localVideoRef.current?.srcObject) {
        const tracks = localVideoRef.current.srcObject.getTracks()
        tracks.forEach((track) => track.stop())
      }
    }
  }, [])

  // Create remote video placeholder
  useEffect(() => {
    if (isCallActive && remoteVideoRef.current && !remoteVideoRef.current.srcObject) {
      const canvas = document.createElement("canvas")
      canvas.width = 640
      canvas.height = 480
      const ctx = canvas.getContext("2d")

      if (ctx) {
        const drawFrame = () => {
          if (!isCallActive) return

          // Draw a gradient background
          const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
          gradient.addColorStop(0, "#0f172a")
          gradient.addColorStop(1, "#1e3a8a")
          ctx.fillStyle = gradient
          ctx.fillRect(0, 0, canvas.width, canvas.height)

          // Draw some text
          ctx.fillStyle = "white"
          ctx.font = "24px Arial"
          ctx.textAlign = "center"
          ctx.fillText("Remote User", canvas.width / 2, canvas.height / 2)

          requestAnimationFrame(drawFrame)
        }

        drawFrame()

        const stream = canvas.captureStream(30)
        remoteVideoRef.current.srcObject = stream
      }
    }
  }, [isCallActive])

  // GSAP animation for controls
  useEffect(() => {
    if (controlsRef.current) {
      gsap.fromTo(
        controlsRef.current,
        { y: 50, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.5,
          ease: "power3.out",
          delay: 0.2,
        },
      )
    }
  }, [isCallActive])

  // Handle fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`)
      })
    } else {
      document.exitFullscreen()
    }
  }

  const handleMicToggle = () => {
    const stream = localVideoRef.current?.srcObject
    if (stream) {
      stream.getAudioTracks().forEach(track => (track.enabled = !isMicOn))
    }
    setIsMicOn(!isMicOn)
  }

  const handleVideoToggle = () => {
    const stream = localVideoRef.current?.srcObject
    if (stream) {
      stream.getVideoTracks().forEach(track => (track.enabled = !isVideoOn))
    }
    setIsVideoOn(!isVideoOn)
  }

  const answerCall = async (offer) => {
    setIsCallActive(true)
    setCallStatus("connecting")
    await createPeerConnection(offer)
    await getUserMedia()

    const answer = await peerConnection.current.createAnswer()
    await peerConnection.current.setLocalDescription(new RTCSessionDescription(answer))
    socket.emit("answer", answer)
    setConnected(true)
    setTimeout(() => setCallStatus("connected"), 1000)

    const element = document.getElementById("control")
    if (element) element.classList.add("hidden")
  }

  const createPeerConnection = async (offer) => {
    if (peerConnection.current) {
      console.warn("PeerConnection already exists.")
      return
    }

    console.log("Creating PeerConnection...")
    peerConnection.current = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "turn:your-turn-server.com", username: "user", credential: "pass" },
      ],
    })

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", event.candidate)
      }
    }

    peerConnection.current.ontrack = (event) => {
      console.log("Remote track received")
      remoteVideoRef.current.srcObject = event.streams[0]
    }

    if (offer) {
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer))
    }
  }

  const getUserMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: isMicOn, video: isVideoOn })
      localVideoRef.current.srcObject = stream
      stream.getTracks().forEach((track) => peerConnection.current.addTrack(track, stream))
    } catch (error) {
      console.error("Error getting user media:", error)
      // Fall back to audio only if video fails
      if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
        setIsVideoOn(false)
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: isMicOn, video: false })
        localVideoRef.current.srcObject = audioStream
        audioStream.getTracks().forEach((track) => peerConnection.current.addTrack(track, audioStream))
      }
    }
  }

  const startCall = async () => {
    setIsCallActive(true)
    setCallStatus("connecting")
    await createPeerConnection()
    await getUserMedia()

    const offer = await peerConnection.current.createOffer()
    await peerConnection.current.setLocalDescription(new RTCSessionDescription(offer))
    socket.emit("offer", offer)
    setConnected(true)
  }

  const endCall = () => {
    if (peerConnection.current) {
      peerConnection.current.close()
      peerConnection.current = null
    }

    if (localVideoRef.current?.srcObject) {
      localVideoRef.current.srcObject.getTracks().forEach((track) => track.stop())
      
      // Restart local video after call ends
      navigator.mediaDevices
        ?.getUserMedia({ video: isVideoOn, audio: isMicOn })
        .then((stream) => {
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream
          }
        })
        .catch(err => console.error("Error restarting media devices:", err))
    }

    if (remoteVideoRef.current?.srcObject) {
      remoteVideoRef.current.srcObject = null
    }
    
    setConnected(false)
    setIsCallActive(false)
    setCallStatus("ended")
    setTimeout(() => setCallStatus(""), 3000)
    socket.emit("hangup")

    const element = document.getElementById("control")
    if (element) element.classList.add("hidden")
  }

  const createAnsElems = (offer) => {
    const element = document.getElementById("control")
    if (element) {
      element.classList.remove("hidden")
      element.onclick = () => answerCall(offer)
    }
  }

  return (
    <div ref={containerRef} className="relative w-screen h-[100dvh] bg-slate-900 overflow-hidden">
      {/* Status indicator */}
      <animated.div 
        style={statusAnimation}
        className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-slate-800 bg-opacity-80"
      >
        {callStatus === "connecting" && (
          <div className="flex items-center text-blue-400">
            <div className="w-2 h-2 rounded-full bg-blue-400 mr-2 animate-pulse"></div>
            Connecting...
          </div>
        )}
        {callStatus === "connected" && (
          <div className="flex items-center text-green-400">
            <div className="w-2 h-2 rounded-full bg-green-400 mr-2"></div>
            Connected
          </div>
        )}
        {callStatus === "ended" && (
          <div className="flex items-center text-red-400">
            <div className="w-2 h-2 rounded-full bg-red-400 mr-2"></div>
            Call ended
          </div>
        )}
      </animated.div>

      {/* Remote Video (appears when call is active) */}
      <animated.div
        style={remoteVideoAnimation}
        className={cn("absolute inset-0 z-20", !isCallActive && "pointer-events-none")}
      >
        <video 
          ref={remoteVideoRef} 
          autoPlay 
          playsInline 
          muted={false} 
          className="w-full h-full object-cover"
        />
        
        {/* Fullscreen toggle button */}
        {isCallActive && (
          <Button
            onClick={toggleFullscreen}
            variant="outline"
            size="icon"
            className="absolute top-4 right-4 rounded-full w-10 h-10 bg-slate-800 bg-opacity-50 border-0 hover:bg-slate-700"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="20" 
              height="20" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              className="text-white"
            >
              {isFullscreen ? (
                <>
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                </>
              ) : (
                <>
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </>
              )}
            </svg>
          </Button>
        )}
      </animated.div>

      {/* Local Video */}
      <animated.div
        style={localVideoAnimation}
        className={cn(
          "absolute overflow-hidden shadow-lg transition-all duration-300 ease-in-out",
          isCallActive ? "border-2 border-blue-600 shadow-blue-500/20" : ""
        )}
      >
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className={cn("w-full h-full object-cover", !isVideoOn && "bg-slate-800")}
        />

        {!isVideoOn && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-800 bg-opacity-80">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-slate-700 flex items-center justify-center">
              <User className="h-8 w-8 md:h-10 md:w-10 text-white" />
            </div>
          </div>
        )}

        {/* Camera disabled indicator */}
        {isCallActive && !isVideoOn && (
          <div className="absolute bottom-2 left-2 bg-red-600 rounded-full p-1">
            <VideoOff className="h-3 w-3 md:h-4 md:w-4 text-white" />
          </div>
        )}

        {/* Mic disabled indicator */}
        {isCallActive && !isMicOn && (
          <div className="absolute bottom-2 left-8 bg-red-600 rounded-full p-1">
            <MicOff className="h-3 w-3 md:h-4 md:w-4 text-white" />
          </div>
        )}
      </animated.div>

      {/* Controls */}
      <div
        ref={controlsRef}
        className={cn(
          "absolute left-1/2 transform -translate-x-1/2 z-40 flex items-center gap-2 md:gap-4 transition-all duration-300 ease-in-out",
          isCallActive ? "bottom-6 md:bottom-10" : "bottom-4 md:bottom-8"
        )}
      >
        {!isCallActive ? (
          <div className="flex flex-col items-center md:flex-row gap-4">
            <Button
              id="control"
              size={mobileView ? "default" : "lg"}
              className="hidden bg-blue-600 hover:bg-blue-700 text-white rounded-full px-5 md:px-8 py-2 md:py-6 shadow-lg hover:shadow-blue-400/20 transition-all duration-300 ease-in-out"
            >
              <Phone className="mr-2 h-4 w-4 md:h-5 md:w-5" />
              <span className="text-sm md:text-base">Answer</span>
            </Button>
            <Button
              onClick={() => startCall()}
              size={mobileView ? "default" : "lg"}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6 md:px-10 py-2 md:py-6 shadow-lg hover:shadow-blue-400/20 transition-all duration-300 ease-in-out"
            >
              <Phone className="mr-2 h-4 w-4 md:h-5 md:w-5" />
              <span className="text-sm md:text-base font-medium">Start Call</span>
            </Button>
            
          
          </div>
        ) : (
          <div className="bg-slate-800 bg-opacity-80 backdrop-blur-sm p-2 md:p-3 rounded-full flex items-center gap-2 md:gap-4 shadow-lg">
            <Button
              onClick={handleMicToggle}
              variant="outline"
              size="icon"
              className={cn(
                "rounded-full w-10 h-10 md:w-12 md:h-12 border-2 transition-all duration-300",
                isMicOn
                  ? "bg-blue-600 border-blue-600 hover:bg-blue-700"
                  : "bg-red-600 border-red-600 hover:bg-red-700",
              )}
            >
              {isMicOn ? (
                <Mic className="h-4 w-4 md:h-5 md:w-5 text-white" />
              ) : (
                <MicOff className="h-4 w-4 md:h-5 md:w-5 text-white" />
              )}
            </Button>

            <Button
              onClick={() => endCall()}
              variant="outline"
              size="icon"
              className="rounded-full w-12 h-12 md:w-16 md:h-16 bg-red-600 border-red-600 hover:bg-red-700 transition-all duration-300 shadow-lg hover:shadow-red-400/30"
            >
              <PhoneOff className="h-5 w-5 md:h-6 md:w-6 text-white" />
            </Button>

            <Button
              onClick={handleVideoToggle}
              variant="outline"
              size="icon"
              className={cn(
                "rounded-full w-10 h-10 md:w-12 md:h-12 border-2 transition-all duration-300",
                isVideoOn
                  ? "bg-blue-600 border-blue-600 hover:bg-blue-700"
                  : "bg-red-600 border-red-600 hover:bg-red-700",
              )}
            >
              {isVideoOn ? (
                <Video className="h-4 w-4 md:h-5 md:w-5 text-white" />
              ) : (
                <VideoOff className="h-4 w-4 md:h-5 md:w-5 text-white" />
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}