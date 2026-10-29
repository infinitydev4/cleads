export enum AppointmentType {
  CONSULTATION = "CONSULTATION",
  SUIVI = "SUIVI",
  URGENCE = "URGENCE",
  LANDING_PAGE = "LANDING_PAGE",
  ECOMMERCE = "ECOMMERCE",
  SAAS = "SAAS",
  OTHER = "OTHER"
}

export enum AppointmentStatus {
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  CANCELLED = "CANCELLED",
  COMPLETED = "COMPLETED"
}

export interface Appointment {
  id: string
  clientName: string
  email: string
  phone: string
  date: Date
  status: AppointmentStatus
  type: AppointmentType
  notes?: string
  userId: string
}

export interface AppointmentData {
  clientName: string
  email: string
  phone: string
  date: Date
  type: AppointmentType
  notes?: string
}

export interface AppointmentResponse {
  id: string
  clientName: string
  email: string
  phone: string
  date: string
  status: AppointmentStatus
  type: AppointmentType
  notes?: string
  userId: string
}

export interface AppointmentError {
  error: string
} 