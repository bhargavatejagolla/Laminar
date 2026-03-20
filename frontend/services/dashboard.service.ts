import { api } from "./api";

export async function getDashboardStats() {
  const res = await api.get("/system/dashboard-stats");
  return res.data;
}
