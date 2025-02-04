import React, { useState,useEffect } from "react";
import { useNavigate,Link } from "react-router-dom";
import { useAddUser } from "../hooks/useAddUser";
import { useGetUserInfo } from "../hooks/useGetUserInfo";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../Firebase/firebase";
import axios from "axios"; 

const SignUp = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { addUser } = useAddUser();
  const [profilePic, setProfilePic] = useState(null); 
  const {isAuth}=useGetUserInfo()
  const navigate = useNavigate();

    useEffect(()=>{
      if(isAuth){
        navigate("/home")
      }
    },[])
  

  const handleSignup = async (e) => {
    e.preventDefault();
    
    try {
  
      // 1. Upload the profile picture to Cloudinary
      let profilePicUrl = "";
      if (profilePic) {
        const formData = new FormData();
        formData.append("file", profilePic);
        formData.append("upload_preset", "ml_default");  // Add your Cloudinary upload preset here

        const response = await axios.post(
          "https://api.cloudinary.com/v1_1/dzlr1rtln/image/upload",
          formData
        );
        profilePicUrl = response.data.secure_url;  // URL of the uploaded image
      }

      // 2. Create the user with Firebase Auth
      const result = await createUserWithEmailAndPassword(auth, email, password);
      console.log(result);

      const authInfo = {
        userId: result.user.uid,
        displayName: name,
        email: result.user.email,
        isAuth: true,
        profilePicUrl,  // Save the Cloudinary URL
      };

      // 3. Add user to your Firebase Firestore
      addUser({ email, name, profilePicUrl });

      localStorage.setItem("auth-info", JSON.stringify(authInfo));
      navigate("/home");
    } 
    catch (err) {

      if (err.code === "auth/email-already-in-use") {
        setError("This email is already in use. Please try a different one.");
      } else if (err.code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else if (err.code === "auth/weak-password") {
        setError("Password should be at least 6 characters long.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    }
  };

  const handleGoogleSignup = () => {
    console.log("Sign up with Google");
    // Add your Google signup logic here
  };

  const handleFileChange = (e) => {
    setProfilePic(e.target.files[0]);  // Set the selected file to state
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Sign Up</h2>
        
        {error && (
          <div className="bg-red-500 text-white text-center p-2 rounded mb-4">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSignup}>
          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Full Name
            </label>
            <input
              type="text"
              id="name"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="mb-4">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="mb-6">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              id="password"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
           {/* Profile Picture Upload */}
           <div className="mb-4">
            <label htmlFor="profilePic" className="block text-sm font-medium text-gray-700 mb-1">
              Profile Picture
            </label>
            <input
              type="file"
              id="profilePic"
              accept="image/*"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              onChange={handleFileChange}
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-500 text-white py-2 rounded-lg font-medium hover:bg-blue-600 transition duration-200"
          >
            Sign Up
          </button>
        </form>
        <button
          onClick={handleGoogleSignup}
          className="w-full mt-4 bg-red-500 text-white py-2 rounded-lg font-medium hover:bg-red-600 transition duration-200"
        >
          Sign Up with Google
        </button>
        <p className="text-sm text-center text-gray-600 mt-4">
          Already have an account? <Link to="/" className="text-blue-500 hover:underline">Login</Link>

        </p>
      </div>
    </div>
  );
};

export default SignUp;
