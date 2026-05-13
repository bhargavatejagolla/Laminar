import {api} from "./api";

export async function login(email: string, password: string) {
  const res = await api.post("/auth/login", {
    email,
    password,
  });

  const token = res.data.access_token;
  if (token) {
    localStorage.setItem("access_token", token);
  }

  return res.data;
}

export async function loginWithGoogle(token: string) {
  const res = await api.post("/auth/google", {
    token
  });
  
  const accessToken = res.data.access_token;
  if (accessToken) {
    localStorage.setItem("access_token", accessToken);
  }
  return res.data;
}

export async function register(email: string, password: string, full_name?: string) {
  return api.post("/auth/register", {
    email,
    password,
    ...(full_name ? { full_name } : {}),
  });
}

export async function getMe(): Promise<{ id: string; email: string; full_name?: string; name?: string } | null> {
  try {
    const res = await api.get("/auth/me");
    return res.data;
  } catch {
    return null;
  }
}

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

export function logout() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("access_token");
    window.location.replace("/login");
  }
}

export async function verifyEmail(email: string, otp: string) {
  return api.post("/auth/verify-email", {
    email,
    otp,
  });
}

export async function resendOtp(email: string) {
  return api.post("/auth/resend-otp", {
    email,
  });
}
