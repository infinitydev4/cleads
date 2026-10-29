export interface InvoiceItem {
  id: string
  description: string
  quantity: number
  price: number
  details?: string
}

export interface CompanyInfo {
  name: string
  address: string
  city: string
  email: string
  phone: string
  siret: string
  tva: string
  website: string
  rib: {
    bank: string
    iban: string
    bic: string
  }
}

export interface ClientInfo {
  firstName: string
  name: string
  address: string
  city: string
  email: string
  phone: string
}

export interface Client {
  id: string
  name: string
  email: string
  phone: string
  address: string
  city: string
}

export interface InvoiceSettings {
  showRib: boolean
  showTva: boolean
  showLogo: boolean
  accentColor: string
  paymentDelay: number
  taxType: string
  taxValue: number
  website: string
  email: string
}

export interface QuoteItem extends InvoiceItem {}

export interface QuoteSettings extends InvoiceSettings {} 