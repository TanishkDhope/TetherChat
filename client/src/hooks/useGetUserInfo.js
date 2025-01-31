
export const useGetUserInfo=()=>{
    const {email, userId, isAuth, displayName}=JSON.parse(localStorage.getItem("auth-info")) || {}

    return{email, userId, isAuth, displayName}
}