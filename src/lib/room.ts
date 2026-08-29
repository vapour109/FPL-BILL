// The app used to put every league behind a shared room code. It now serves one
// league at the root URL, so a single fixed room backs the whole app — the code
// is an internal database key, never shown or typed.
//
// The rooms/managers schema is unchanged, so multi-room support is a UI concern
// only if it's ever wanted back.
export const LEAGUE_ROOM_CODE = "THEBILL";

// One name per browser, no longer scoped per room.
export const NAME_STORAGE_KEY = "thebill_name";
