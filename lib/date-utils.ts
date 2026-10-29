import { format, parseISO } from "date-fns"
import { fr } from "date-fns/locale"

export function convertToUTC(date: Date): Date {
  return new Date(Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    0
  ))
}

export function convertFromUTC(utcDate: Date): Date {
  return new Date(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth(),
    utcDate.getUTCDate(),
    utcDate.getUTCHours(),
    utcDate.getUTCMinutes(),
    0
  )
}

export function formatAppointmentDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date
  return format(dateObj, "d MMMM yyyy 'à' HH:mm", { locale: fr })
}

export function formatAppointmentTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date
  return format(dateObj, "HH:mm")
}

export function formatAppointmentDateOnly(date: Date | string): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date
  return format(dateObj, "d MMMM yyyy", { locale: fr })
} 