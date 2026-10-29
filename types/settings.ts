export interface AdminSettings {
  id?: string;
  userId?: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  language: string;
  openaiApiKey?: string;
  openaiModel: string;
  autoGenerateTags: boolean;
  autoOptimizeSEO: boolean;
  textProvider: string;
  huggingFaceApiKey?: string;
  huggingFaceTextModel?: string;
  imageProvider: string;
  pexelsApiKey?: string;
  huggingFaceModel?: string;
  stableDiffusionApiKey?: string;
  replicateApiKey?: string;
  replicateModel?: string;
  newsApiKey?: string;
  rssSourceCount?: number;
  rssArticleSelectionMode?: string;
  defaultRssCategory?: string;
  highQualityGeneration?: boolean;
  allowRsslessGeneration?: boolean;
  validatedRssFeeds?: any[];
}

export interface CompanySettings {
  id?: string;
  userId?: string;
  name: string;
  email: string;
  phone: string;
  website?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  siret?: string;
  tva?: string;
  bank?: string;
  iban?: string;
  bic?: string;
}

export interface NotificationSettings {
  email: boolean;
  push: boolean;
  appointments: boolean;
  appointmentReminders: boolean;
  appointmentChanges: boolean;
  appointmentCancellations: boolean;
  newMessages: boolean;
  contactForm: boolean;
  systemUpdates: boolean;
  securityAlerts: boolean;
  newsletters: boolean;
  specialOffers: boolean;
} 