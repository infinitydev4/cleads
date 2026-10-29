import { Availability } from "@prisma/client"

export interface AvailabilityData {
  dayOfWeek: number
  startTime: string
  endTime: string
  isActive: boolean
}

export interface AvailabilityResponse extends Availability {
  userId: string
}

export interface AvailabilityError {
  error: string
}

export interface AvailabilityState {
  availabilities: Availability[]
  loading: boolean
  error: string | null
} 