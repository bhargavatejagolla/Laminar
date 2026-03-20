"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { getToken } from "@/services/auth"

export default function ProtectedRoute({
  children
}: {
  children: React.ReactNode
}) {

  const router = useRouter()

  useEffect(() => {

    const token = getToken()

    if (!token) {
      router.push("/login")
    }

  }, [])

  return <>{children}</>
}