import { createContext, useContext } from "react";

// React context: lets any component read the logged-in user and the
// login/logout functions without passing them down through every level.
// The value is provided by <AuthProvider> (AuthProvider.jsx).
export const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}
