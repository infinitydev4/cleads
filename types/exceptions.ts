import { Exception } from "@prisma/client"

export interface ExceptionData {
  date: Date
  isAvailable: boolean
  reason?: string
}

export interface ExceptionResponse extends Exception {
  userId: string
}

export interface ExceptionError {
  error: string
}

export interface ExceptionState {
  exceptions: Exception[]
  loading: boolean
  error: string | null
}

export interface ExceptionFilters {
  startDate?: Date
  endDate?: Date
} 