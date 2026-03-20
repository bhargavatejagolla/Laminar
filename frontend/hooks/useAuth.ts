"use client"

import { useEffect, useState } from "react"
import { getToken, logout } from "@/services/auth"

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
    
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    try {
      const res = await fetch(`${API_BASE}/api/v1/users/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setUser(data)
      setProfilePicture(data.profile_picture || null)
    } catch (error) {
      console.error("Failed to fetch profile:", error)
      setUser({ email: "admin@laminar.ai" }) // Fallback
      setProfilePicture(null)
    }
  }

  useEffect(() => {
    refreshProfile()
  }, [])

  return {
    isAuthenticated,
    user,
    profilePicture,
    logout,
    refreshProfile
  }
}