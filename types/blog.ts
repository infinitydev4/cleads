/**
 * Types pour le système de blog et génération d'articles
 */

export interface Category {
  id: string
  name: string
  slug: string
  articles: Article[]
  createdAt: Date
  updatedAt: Date
}

export interface Tag {
  id: string
  name: string
  slug: string
  articles: Article[]
  createdAt: Date
  updatedAt: Date
}

export interface Article {
  id: string
  title: string
  slug: string
  content: string
  excerpt?: string
  coverImage?: string | null
  status: "DRAFT" | "PUBLISHED"
  publishedAt?: Date
  categoryId?: string
  category?: Category
  tags: Tag[]
  views: number
  metaTitle?: string
  metaDescription?: string
  themeId?: string
  theme?: Theme
  userId: string
  user: User
  comments: Comment[]
  imageSuggestions?: string[]
  createdAt: Date
  updatedAt: Date
}

export interface Theme {
  id: string
  name: string
  description: string
  type: "BLOG" | "LANDING" | "DASHBOARD"
  colors: {
    primary: string
    background: string
    card: string
    text: string
    muted: string
  }
  features: string[]
  layout: "grid" | "masonry" | "split" | "full"
  isDefault: boolean
  createdAt: Date
  updatedAt: Date
}

export interface User {
  id: string
  name?: string
  email?: string
  image?: string
}

export interface Comment {
  id: string
  content: string
  createdAt: Date
  updatedAt: Date
  articleId: string
  article: Article
  userId: string
  user: User
}

export interface ArticleSchedule {
  id: string
  name: string
  userId: string
  user?: User
  frequency: "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY"
  status: "ACTIVE" | "PAUSED" | "COMPLETED" | "FAILED"
  categories: string[]
  keywords: string[]
  textProvider?: string
  openaiModel?: string
  huggingFaceModel?: string
  contentSource?: string
  category?: string
  rssSourceCount?: number
  rssArticleSelectionMode?: string
  highQualityGeneration?: boolean
  newsQuery?: string
  nextRunDate: Date | string
  lastRunDate?: Date | string
  lastRunStatus?: string
  tone: string
  language: string
  publishImmediately: boolean
  generateImage: boolean
  imageProvider?: string
  imageModel?: string
  maxArticlesPerMonth: number
  articlesGenerated: number
  createdAt: Date | string
  updatedAt: Date | string
}

export interface ArticleScheduleWithUser extends ArticleSchedule {
  user?: {
    id: string
    email: string
    settings?: any
  }
}

// Structure des articles d'actualité
export interface NewsArticle {
  title: string;
  description: string;
  url: string;
  publishedAt: string;
  source: {
    name: string;
  };
}

// Type pour les sources de contenu utilisées dans la génération d'articles
export type ContentSourceType = "rss" | "ai" | "social" | "custom"; 