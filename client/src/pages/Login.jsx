import React, { useEffect, useState } from "react";
import { auth, googleProvider } from "../Firebase/firebase";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { useNavigate, Link } from "react-router-dom";
import { useGetUserInfo } from "../hooks/useGetUserInfo";
import { useGetUserName } from "../hooks/useGetUsername";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(""); // State for handling error messages
  const { isAuth } = useGetUserInfo();
  const { getUsername } = useGetUserName();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuth) {
      navigate("/home");
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      console.log(result.user.email);
      const { displayName, profilePicUrl } = await getUsername(
        result.user.email
      );
      const authInfo = {
        displayName,
        userId: result.user.uid,
        email: result.user.email,
        profilePicUrl,
        isAuth: true,
      };
      localStorage.setItem("auth-info", JSON.stringify(authInfo));
      navigate("/home");
      // Redirect user or update UI based on login success
    } catch (err) {
      // Handle specific Firebase errors
      if (err.code === "auth/user-not-found") {
        setError(
          "No user found with this email. Please check your email or sign up."
        );
      } else if (err.code === "auth/wrong-password") {
        setError("Incorrect password. Please try again.");
      } else if (err.code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    }
  };

  const handleGoogleSignup = async () => {
      console.log("Sign up with Google");
     try{
      const result = await signInWithPopup(auth, googleProvider);
      const authInfo = {
        userId: result.user.uid,
        displayName: result.user.displayName,
        email: result.user.email,
        isAuth: true,
        profilePicUrl: result.user.photoURL,  // Save the Cloudinary URL
      };
      const email = result.user.email;
      const name = result.user.displayName;
      const photoURL = result.user.photoURL;
      addUser({ email, name, photoURL });
  
      localStorage.setItem("auth-info", JSON.stringify(authInfo));
      navigate("/home");
      
       } catch (error) {
       console.log(error);
      }
     
    };
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        backgroundImage:
          "url(https://images.unsplash.com/photo-1509023464722-18d996393ca8?q=80&w=2940&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D)",
        backgroundPosition: "center", // Centers the background image
        backgroundSize: "cover", // Ensures the image covers the entire container
      }}
      classNameName="
      bg-gray-100"
    >
      <div className="bg-white rounded-xl p-8 xl:mx-auto xl:w-full shadow-md p-4 xl:max-w-sm 2xl:max-w-md">
        <div className="mb-2 flex justify-center" />
        <h2 className="text-center text-2xl font-bold leading-tight text-black">
          Sign in to your account
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Don't have an account? <Link to={"/signup"}> <a
                  className="text-sm font-semibold text-black hover:underline"
                  title
                  href="#"
                >Create a free account </a></Link>
        </p>
        {error && (
          <div className="mt-6 bg-red-500 text-white text-center p-2 rounded mb-4">
            {error}
          </div>
        )}
        <form onSubmit={handleLogin} className="mt-8" method="POST" action="#">
          <div className="space-y-5">
            <div>
              <label className="text-base font-medium text-gray-900">
                Email address
              </label>
              <div className="mt-2">
                <input
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  className="flex h-10 w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-base font-medium text-gray-900">
                  Password
                </label>
                <a
                  className="text-sm font-semibold text-black hover:underline"
                  title
                  href="#"
                >
                  Forgot password?
                </a>
              </div>
              <div className="mt-2">
                <input
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  className="flex h-10 w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              
            </div>
            <div>
              <button
                className="cursor-pointer inline-flex w-full items-center justify-center rounded-md bg-black px-3.5 py-2.5 font-semibold leading-7 text-white hover:bg-black/80"
                type="submit"
              >
                Get started
              </button>
            </div>
          </div>
        </form>
        <div className="mt-3 space-y-3">
          <button
          onClick={handleGoogleSignup}
            className="cursor-pointer relative inline-flex w-full items-center justify-center rounded-md border border-gray-400 bg-white px-3.5 py-2.5 font-semibold text-gray-700 transition-all duration-200 hover:bg-gray-100 hover:text-black focus:bg-gray-100 focus:text-black focus:outline-none"
            type="button"
          >
            <span className="mr-2 inline-block">
              <svg
                fill="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6 text-rose-500"
              >
                <path d="M20.283 10.356h-8.327v3.451h4.792c-.446 2.193-2.313 3.453-4.792 3.453a5.27 5.27 0 0 1-5.279-5.28 5.27 5.27 0 0 1 5.279-5.279c1.259 0 2.397.447 3.29 1.178l2.6-2.599c-1.584-1.381-3.615-2.233-5.89-2.233a8.908 8.908 0 0 0-8.934 8.934 8.907 8.907 0 0 0 8.934 8.934c4.467 0 8.529-3.249 8.529-8.934 0-.528-.081-1.097-.202-1.625z" />
              </svg>
            </span>
            Sign in with Google
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
