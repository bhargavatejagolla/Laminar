"use client"

import { useEffect, useState } from "react"
import { getToken, logout } from "@/services/auth"
import { api } from "@/services/api"

export function useAuth() {
  const [isAuthenticated, setAuthenticated] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [profilePicture, setProfilePicture] = useState<string | null>(null)

  const refreshProfile = async () => {
    const token = getToken()

    if (!token) {
      setAuthenticated(false)
      setUser(null)
      setProfilePicture(null)
      return
    }

    setAuthenticated(true)
    
    try {
      const res = await api.get("/users/profile")
      setUser(res.data)
      setProfilePicture(res.data.profile_picture || null)
    } catch (error) {
      console.error("Failed to fetch profile:", error)
      setUser({ email: "admin@laminar.ai" }) // Fallback
      setProfilePicture(null)
    }
  }

  useEffect(() => {
    refreshProfile()
  }, [])

  const isSuperAdmin = user?.role === "super_admin"
  const isAdmin = user?.role === "super_admin" || user?.role === "admin"
  const isUser = user?.role === "user"

  return {
    isAuthenticated,
    user,
    profilePicture,
    isSuperAdmin,
    isAdmin,
    isUser,
    logout,
    refreshProfile
  }
}