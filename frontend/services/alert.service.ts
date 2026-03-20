import { api } from "./api"

export async function getAlerts() {
  const res = await api.get("/alerts")
  return res.data
}

export async function acknowledgeAlert(id: string) {
  const res = await api.patch(`/alerts/${id}/acknowledge`)
  return res.data
}

export async function resolveAlert(id: string) {
  const res = await api.patch(`/alerts/${id}/resolve`)
  return res.data
}