import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Maximize, PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { io } from 'socket.io-client';

const VideoCall = () => {
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [connected, setConnected] = useState(false);

  const socket = io("https://chatapp-dcac.onrender.com");
  const peerConnection = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    socket.on("offer", async (offer) => {
      console.log("Received offer");
      createAnsElems(offer);
    });

    socket.on("answer", async (answer) => {
      if (peerConnection.current) {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    socket.on("ice-candidate", async (candidate) => {
      if (!peerConnection.current) {
        console.warn("PeerConnection is not initialized. Storing candidate...");
        return;
      }

      if (!peerConnection.current.remoteDescription) {
        console.warn("Remote description not set yet. Retrying in 500ms...");
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      try {
        await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        console.log("ICE Candidate added successfully");
      } catch (error) {
        console.error("Error adding ICE Candidate:", error);
      }
    });

    socket.on("hangup", () => {
      if (peerConnection.current) {
        endCall();
      }
    });

    return () => {
      socket.off("offer");
      socket.off("answer");
      socket.off("ice-candidate");
      socket.off("hangup");
    };
  }, []);

  const toggleMic = () => {
    const stream = localVideoRef.current?.srcObject;
    if (stream) {
      stream.getAudioTracks().forEach(track => (track.enabled = !isMicOn));
    }
    setIsMicOn(!isMicOn);
  };

  const toggleVideo = () => {
    const stream = localVideoRef.current?.srcObject;
    if (stream) {
      stream.getVideoTracks().forEach(track => (track.enabled = !isVideoOn));
    }
    setIsVideoOn(!isVideoOn);
  };

  const toggleFullScreen = () => {
    setIsFullScreen(!isFullScreen);
  };

  const answerCall = async (offer) => {
    await createPeerConnection(offer);
    await getUserMedia();

    const answer = await peerConnection.current.createAnswer();
    await peerConnection.current.setLocalDescription(new RTCSessionDescription(answer));
    socket.emit("answer", answer);
    setConnected(true);

    const element = document.getElementById("control");
    if (element) element.classList.add("hidden");
  };

  const createPeerConnection = async (offer) => {
    if (peerConnection.current) {
      console.warn("PeerConnection already exists.");
      return;
    }

    console.log("Creating PeerConnection...");
    peerConnection.current = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "turn:your-turn-server.com", username: "user", credential: "pass" },
      ],
    });

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", event.candidate);
      }
    };

    peerConnection.current.ontrack = (event) => {
      console.log("Remote track received");
      remoteVideoRef.current.srcObject = event.streams[0];
    };

    if (offer) {
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
    }
  };

  const getUserMedia = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: isMicOn, video: isVideoOn });
    localVideoRef.current.srcObject = stream;
    stream.getTracks().forEach((track) => peerConnection.current.addTrack(track, stream));
  };

  const startCall = async () => {
    await createPeerConnection();
    await getUserMedia();

    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(new RTCSessionDescription(offer));
    socket.emit("offer", offer);
    setConnected(true);
  };

  const endCall = () => {
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }

    if (localVideoRef.current?.srcObject) {
      localVideoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      localVideoRef.current.srcObject = null;
    }

    if (remoteVideoRef.current?.srcObject) {
      remoteVideoRef.current.srcObject = null;
    }
    setConnected(false);
    socket.emit("hangup");

    const element = document.getElementById("control");
    if (element) element.classList.add("hidden");
  };

  const createAnsElems = (offer) => {
    const element = document.getElementById("control");
    if (element) {
      element.classList.remove("hidden");
      element.onclick = () => answerCall(offer);
    }
  };

  return (
    <div className="flex flex-col gap-4 h-[100dvh] bg-white dark:bg-gray-900 p-4 transition-all duration-300">
      <div className={`relative flex-grow flex items-center justify-center rounded-lg overflow-hidden shadow-lg ${isFullScreen ? "h-screen w-screen fixed top-0 left-0" : "bg-gray-900 dark:bg-gray-800"}`}>
        <div className="relative w-full h-full bg-black rounded-lg overflow-hidden">
          <video ref={remoteVideoRef} className="w-full h-full object-cover" autoPlay />
          <div className="absolute bottom-2 right-2 border border-gray-500 shadow-lg rounded-lg h-[30%] max-h-[120px] sm:max-h-[150px] md:max-h-[200px] lg:max-h-[250px] dark:bg-gray-800 dark:border-gray-700 transition-all">
            <video ref={localVideoRef} className="w-full h-full object-cover rounded-lg" autoPlay muted />
          </div>
        </div>
      </div>

      <div className="flex justify-center items-center gap-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-700">
        <button id="control" className="hidden cursor-pointer p-3 rounded-full bg-green-500 hover:bg-green-600 transition-all flex items-center">
          <PhoneIncoming size={24} />
          <span className="ml-2">Answer Call</span>
        </button>

        <button onClick={startCall} className="cursor-pointer p-3 rounded-full bg-green-500 hover:bg-green-600 transition-all flex items-center">
          <PhoneOutgoing size={24} />
        </button>

        <button onClick={toggleMic} className={`p-3 cursor-pointer rounded-full transition-all ${isMicOn ? "bg-blue-500 hover:bg-blue-600" : "bg-red-500 hover:bg-red-600"}`}>
          {isMicOn ? <Mic size={24} /> : <MicOff size={24} />}
        </button>

        <button onClick={toggleVideo} className={`p-3 cursor-pointer rounded-full transition-all ${isVideoOn ? "bg-blue-500 hover:bg-blue-600" : "bg-red-500 hover:bg-red-600"}`}>
          {isVideoOn ? <Video size={24} /> : <VideoOff size={24} />}
        </button>

        <button onClick={endCall} className="cursor-pointer p-3 rounded-full bg-red-600 hover:bg-red-700 transition-all">
          <PhoneOff size={24} />
        </button>
      </div>
    </div>
  );
};

export default VideoCall;
