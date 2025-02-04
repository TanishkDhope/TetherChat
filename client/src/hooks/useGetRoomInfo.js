export const GetRoomInfo = (username) => {
    const roomId = localStorage.getItem(username) || null;
    return{roomId}
}