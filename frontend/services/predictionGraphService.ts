import { api } from "./api"

export async function getPredictionGraph(venueId: string) {

  const res = await api.get(`/prediction/graph/${venueId}`)

  return res.data
}