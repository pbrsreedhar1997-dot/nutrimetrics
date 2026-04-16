import { useState, useCallback } from 'react'

export function useAuth() {
  const [token, setToken] = useState(() => localStorage.getItem('nm_token') || null)
  const [username, setUsername] = useState(() => localStorage.getItem('nm_username') || null)

  const login = useCallback((newToken, newUsername) => {
    localStorage.setItem('nm_token', newToken)
    localStorage.setItem('nm_username', newUsername)
    setToken(newToken)
    setUsername(newUsername)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('nm_token')
    localStorage.removeItem('nm_username')
    setToken(null)
    setUsername(null)
  }, [])

  return { token, username, login, logout, isLoggedIn: !!token }
}
