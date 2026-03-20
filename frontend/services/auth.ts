import {api} from "./api";

export async function login(email: string, password: string) {
  const res = await api.post("/auth/login", {
    email,
    password,
  });

  const token = res.data.access_token;

  localStorage.setItem("access_token", token);

  return res.data;
}

export async function loginWithGoogle(token: string) {
  const res = await api.post("/auth/google", {
    token
  });
  
  const accessToken = res.data.access_token;
  localStorage.setItem("access_token", accessToken);
  return res.data;
}

export async function register(email: string, password: string) {
  return api.post("/auth/register", {
    email,
    password,
  });
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
