import { api } from "./api"
import { Venue } from "@/types/venue"

export interface VenueFilters {
  city?: string
  country?: string
  is_active?: boolean
  skip?: number
  limit?: number
}

export interface VenueStats {

  id: string

  current_occupancy: number

  name: string

  capacity: number

  current_risk: number

  camera_count: number

  active_cameras: number

  is_active: boolean

  monitoring_enabled: boolean

  warning_threshold: number

  critical_threshold: number

  created_at: string

  city?: string

  country?: string
  avg_velocity?: number
}

export interface CapacityStatus {
  current_people: number
  capacity: number
  percent_full: number
  status: "low" | "medium" | "high" | "critical"
}

export class VenueService {

  /*
  =============================
  Get All Venues
  =============================
  */

  static async getVenues(filters?: VenueFilters): Promise<Venue[]> {

    const response = await api.get("/venues", {
      params: filters
    })

    return response.data
  }

  /*
  =============================
  Get Single Venue
  =============================
  */

  static async getVenue(venueId: string): Promise<Venue> {

    const response = await api.get(`/venues/${venueId}`)

    return response.data
  }

  /*
  =============================
  Create Venue
  =============================
  */

  static async createVenue(data: Partial<Venue>): Promise<Venue> {

    const response = await api.post("/venues", data)

    return response.data
  }

  /*
  =============================
  Update Venue
  =============================
  */

  static async updateVenue(
    venueId: string,
    data: Partial<Venue>
  ): Promise<Venue> {

    const response = await api.put(`/venues/${venueId}`, data)

    return response.data
  }

  /*
  =============================
  Delete Venue
  =============================
  */

  static async deleteVenue(venueId: string): Promise<void> {

    await api.delete(`/venues/${venueId}`)
  }

  /*
  =============================
  Venue Stats
  =============================
  */

  static async getVenueStats(venueId: string): Promise<VenueStats> {

    const response = await api.get(`/venues/${venueId}/stats`)

    return response.data
  }

  /*
  =============================
  Capacity Status
  =============================
  */

  static async getCapacityStatus(
    venueId: string
  ): Promise<CapacityStatus> {

    const response = await api.post(`/venues/${venueId}/capacity-status`)

    return response.data
  }

  /*
  =============================
  Forecast
  =============================
  */

  static async getForecast(venueId: string) {

    const response = await api.get(`/venues/${venueId}/forecast`)

    return response.data
  }
}