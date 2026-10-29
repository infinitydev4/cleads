import { BreakTime } from "@prisma/client"

export interface BreakTimeData {
  startTime: string
  endTime: string
  isActive: boolean
}

export interface BreakTimeResponse extends BreakTime {
  userId: string
}

export interface BreakTimeError {
  error: string
}

export interface BreakTimeState {
  breakTime: BreakTime | null
  loading: boolean
  error: string | null
} 