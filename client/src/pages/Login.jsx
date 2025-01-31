
import React, { useEffect, useState } from "react";
import { auth } from "../Firebase/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useNavigate, Link } from "react-router-dom";
import { useGetUserInfo } from "../hooks/useGetUserInfo";
import { useGetUserName } from "../hooks/useGetUsername";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");  // State for handling error messages
  const {isAuth}=useGetUserInfo()
  const {getUsername}=useGetUserName()
  const navigate=useNavigate()



  useEffect(()=>{
    if(isAuth){
      navigate("/home")
    }
  },[])

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const result=await signInWithEmailAndPassword(auth, email, password);
      console.log(result.user.email);
      const authInfo= {
        displayName: await getUsername(result.user.email),
        userId: result.user.uid,
        email: result.user.email,
        isAuth: true,
      }
      localStorage.setItem("auth-info", JSON.stringify(authInfo))
      navigate("/home")
      // Redirect user or update UI based on login success
    } catch (err) {
      // Handle specific Firebase errors
      if (err.code === "auth/user-not-found") {
        setError("No user found with this email. Please check your email or sign up.");
      } else if (err.code === "auth/wrong-password") {
        setError("Incorrect password. Please try again.");
      } else if (err.code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Login</h2>

        {/* Display error message */}
        {error && (
          <div className="bg-red-500 text-white text-center p-2 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
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
          <button
            type="submit"
            className="w-full bg-blue-500 text-white py-2 rounded-lg font-medium hover:bg-blue-600 transition duration-200"
          >
            Login
          </button>
        </form>
        <p className="text-sm text-center text-gray-600 mt-4">
          Don't have an account? <Link to="/signup" className="text-blue-500 hover:underline">Sign up</Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
