import { createContext, useState } from "react";

export const socketContext=createContext();

export const SocketProvider=({children})=>{
    const [socket, setSocket] = useState(null);

    return (
        <socketContext.Provider value={{socket, setSocket}}>
            {children}
        </socketContext.Provider>
    );
}
