
export const useGetUserInfo=()=>{
    const {email, userId, isAuth, displayName, profilePicUrl}=JSON.parse(localStorage.getItem("auth-info")) || {}

    return{email, userId, isAuth, displayName, profilePicUrl}
}