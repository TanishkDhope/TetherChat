import React, { useState,useEffect } from "react";
import { useNavigate,Link } from "react-router-dom";
import { useAddUser } from "../hooks/useAddUser";
import { useGetUserInfo } from "../hooks/useGetUserInfo";
import { createUserWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../Firebase/firebase";
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

  const handleFileChange = (e) => {
    setProfilePic(e.target.files[0]);  // Set the selected file to state
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
        <h2 className="text-center text-2xl font-bold leading-tight text-black">Sign Up</h2>
        
        {error && (
          <div className="bg-red-500 text-white text-center p-2 rounded mb-4">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSignup}>
          <div className="mt-3 mb-3">
            <label htmlFor="name" className=" text-base font-medium text-gray-900">
              Full Name
            </label>
            <input
              type="text"
              id="name"
              className="mt-2 flex h-10 w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="mb-3">
            <label htmlFor="email" className="text-base font-medium text-gray-900">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              className="mt-2 flex h-10 w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="mb-3">
            <label htmlFor="password" className="text-base font-medium text-gray-900">
              Password
            </label>
            <input
              type="password"
              id="password"
              className="mt-2 flex h-10 w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
           {/* Profile Picture Upload */}
           <div className="mb-4">
            <label htmlFor="profilePic" className="text-base font-medium text-gray-900">
              Profile Picture
            </label>
            <input
              type="file"
              id="profilePic"
              accept="image/*"
              className="mt-2 flex h-10 w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
              onChange={handleFileChange}
            />
          </div>
          <button
            type="submit"
           className="cursor-pointer inline-flex w-full items-center justify-center rounded-md bg-black px-3.5 py-2.5 font-semibold leading-7 text-white hover:bg-black/80">
            Sign Up
          </button>
        </form>
        <button
        onClick={handleGoogleSignup}
            className="mt-4 cursor-pointer relative inline-flex w-full items-center justify-center rounded-md border border-gray-400 bg-white px-3.5 py-2.5 font-semibold text-gray-700 transition-all duration-200 hover:bg-gray-100 hover:text-black focus:bg-gray-100 focus:text-black focus:outline-none"
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
