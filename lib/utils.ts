import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generatePassword(length: number = 12): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
  let password = ""
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length)
    password += charset[randomIndex]
  }
  return password
}

export function slugify(text: string): string {
  if (!text) return '';
  
  // Conversion des caractères accentués
  const normalized = text
    .normalize('NFD')                       // Décompose les caractères accentués
    .replace(/[\u0300-\u036f]/g, '')       // Supprime les diacritiques
    .replace(/œ/g, 'oe')                   // Cas spécial pour œ
    .replace(/æ/g, 'ae')                   // Cas spécial pour æ
    .replace(/ç/g, 'c');                   // Cas spécial pour ç
  
  return normalized
    .toString()
    .toLowerCase()
    .trim()
    .replace(/&/g, '-et-')                 // Remplace & par "et"
    .replace(/\s+/g, '-')                  // Remplace espaces par -
    .replace(/[^\w-]+/g, '')               // Supprime caractères spéciaux
    .replace(/--+/g, '-')                  // Remplace -- par -
    .replace(/^-+|-+$/g, '');              // Supprime - au début/fin
}

