"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { motion, AnimatePresence } from "framer-motion"
import { 
  FileText, 
  Download, 
  Loader2, 
  Share2, 
  Upload, 
  File, 
  Image as ImageIcon, 
  FileText as FileTextIcon, 
  X,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  List,
  Receipt,
  FileCheck
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { useDropzone } from "react-dropzone"
import { cn } from "@/lib/utils"
import { Document, SharedDocument } from "@/types/documents"
import { DocumentType, DocumentStatus, SharedDocumentType } from "@prisma/client"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export default function DocumentsPage() {
  const { data: session } = useSession()
  const [documents, setDocuments] = useState<Document[]>([])
  const [sharedDocuments, setSharedDocuments] = useState<SharedDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [description, setDescription] = useState("")
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [viewMode, setViewMode] = useState<"grid" | "list">("list")

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setSelectedFiles(prev => [...prev, ...acceptedFiles])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
  })

  useEffect(() => {
    fetchDocuments()
    fetchSharedDocuments()
  }, [])

  const fetchDocuments = async () => {
    try {
      const response = await fetch('/api/client/documents')
      if (!response.ok) {
        throw new Error("Erreur lors de la récupération des documents")
      }
      const data = await response.json()
      setDocuments(data)
    } catch (error) {
      console.error("Erreur:", error)
      toast.error("Erreur lors de la récupération des documents")
      setDocuments([])
    } finally {
      setLoading(false)
    }
  }

  const fetchSharedDocuments = async () => {
    try {
      const response = await fetch('/api/client/shared-documents')
      if (!response.ok) {
        throw new Error("Erreur lors de la récupération des documents partagés")
      }
      const data = await response.json()
      setSharedDocuments(data)
    } catch (error) {
      console.error("Erreur:", error)
      toast.error("Erreur lors de la récupération des documents partagés")
      setSharedDocuments([])
    }
  }

  const handleDownload = async (documentId: string) => {
    try {
      const response = await fetch(`/api/documents/${documentId}/pdf`)
      if (!response.ok) {
        throw new Error("Erreur lors du téléchargement du document")
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `document-${documentId}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error("Erreur:", error)
      toast.error("Erreur lors du téléchargement du document")
    }
  }

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      toast.error("Veuillez sélectionner des fichiers")
      return
    }

    setIsUploading(true)
    const formData = new FormData()
    selectedFiles.forEach((file) => {
      formData.append("file", file)
    })
    formData.append("description", description)

    try {
      const response = await fetch("/api/client/documents/upload", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Erreur lors de l'upload des documents")
      }

      toast.success("Documents uploadés avec succès")
      setSelectedFiles([])
      setDescription("")
      fetchSharedDocuments()
    } catch (error) {
      console.error("Erreur:", error)
      toast.error("Erreur lors de l'upload des documents")
    } finally {
      setIsUploading(false)
    }
  }

  // Fonction utilitaire pour obtenir le badge du document
  const getDocumentBadge = (document: Document | SharedDocument) => {
    if ('type' in document && (document.type === DocumentType.INVOICE || document.type === DocumentType.QUOTE)) {
      return {
        label: document.type === DocumentType.INVOICE ? "Facture" : "Devis",
        color: "bg-purple-500/10 text-purple-500 border-purple-500/20"
      }
    }
    
    if ('isShared' in document) {
      return {
        label: "Document partagé",
        color: "bg-blue-500/10 text-blue-500 border-blue-500/20"
      }
    }

    return {
      label: "Document",
      color: "bg-gray-500/10 text-gray-500 border-gray-500/20"
    }
  }

  // Combiner tous les documents en une seule liste
  const allDocuments = [...documents, ...sharedDocuments]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-[#BFFF00]" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto">
      {/* Section Documents Unifiée */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Documents</h2>
          <div className="flex gap-4">
            <div className="flex items-center gap-2 bg-gray-900 rounded-lg p-1">
              <Button
                size="icon"
                variant={viewMode === "list" ? "default" : "ghost"}
                onClick={() => setViewMode("list")}
                className={cn(
                  "h-8 w-8",
                  viewMode === "list" && "bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
                )}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant={viewMode === "grid" ? "default" : "ghost"}
                onClick={() => setViewMode("grid")}
                className={cn(
                  "h-8 w-8",
                  viewMode === "grid" && "bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
            <Button
              onClick={() => setIsUploadOpen(!isUploadOpen)}
              className="bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
            >
              {isUploadOpen ? (
                <ChevronUp className="w-4 h-4 mr-2" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              {isUploadOpen ? "Fermer" : "Partager un document"}
            </Button>
          </div>
        </div>

        {/* Vue en liste */}
        {viewMode === "list" && (
          <div className="space-y-4">
            {allDocuments.map((document) => {
              const badge = getDocumentBadge(document)
              const isSharedDoc = 'isShared' in document
              const isBillingDoc = 'type' in document && (document.type === DocumentType.INVOICE || document.type === DocumentType.QUOTE)
              
              return (
                <motion.div
                  key={document.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gray-950 border border-gray-800 rounded-xl p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="p-2 bg-gray-900 rounded-lg shrink-0">
                        {isSharedDoc ? (
                          document.type === SharedDocumentType.IMAGE ? (
                            <ImageIcon className="w-6 h-6 text-[#BFFF00]" />
                          ) : document.type === SharedDocumentType.PDF ? (
                            <FileTextIcon className="w-6 h-6 text-[#BFFF00]" />
                          ) : (
                            <File className="w-6 h-6 text-[#BFFF00]" />
                          )
                        ) : (
                          <FileText className="w-6 h-6 text-[#BFFF00]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-semibold text-white truncate">
                            {isSharedDoc ? document.name : `${document.type === DocumentType.INVOICE ? "Facture" : "Devis"} ${document.number}`}
                          </h3>
                          <span className={cn("px-2 py-1 rounded-full text-xs border", badge.color)}>
                            {badge.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1">
                          <p className="text-sm text-gray-400">
                            {format(new Date(document.createdAt), "d MMMM yyyy", { locale: fr })}
                          </p>
                          {isBillingDoc && (
                            <>
                              <span className="text-gray-600">•</span>
                              <p className="text-sm font-medium text-white">
                                {document.total.toFixed(2)} €
                              </p>
                              <span className="text-gray-600">•</span>
                              <p className={cn(
                                "text-sm",
                                document.status === DocumentStatus.PAID && "text-green-500",
                                document.status === DocumentStatus.SENT && "text-blue-500",
                                document.status === DocumentStatus.DRAFT && "text-gray-400",
                                document.status === DocumentStatus.OVERDUE && "text-red-500"
                              )}>
                                {document.status === DocumentStatus.PAID ? "Payé" :
                                 document.status === DocumentStatus.SENT ? "Envoyé" :
                                 document.status === DocumentStatus.DRAFT ? "Brouillon" :
                                 document.status === DocumentStatus.OVERDUE ? "En retard" :
                                 document.status === DocumentStatus.ACCEPTED ? "Accepté" : "Refusé"}
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="icon"
                        onClick={() => isSharedDoc ? window.open(document.url, "_blank") : handleDownload(document.id)}
                        className="bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )
            })}

            {allDocuments.length === 0 && (
              <div className="text-center py-12 bg-gray-950 border border-gray-800 rounded-xl">
                <p className="text-gray-400">Aucun document</p>
              </div>
            )}
          </div>
        )}

        {/* Vue en grille */}
        {viewMode === "grid" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allDocuments.map((document) => {
              const badge = getDocumentBadge(document)
              const isSharedDoc = 'isShared' in document
              const isBillingDoc = 'type' in document && (document.type === DocumentType.INVOICE || document.type === DocumentType.QUOTE)
              
              return (
                <motion.div
                  key={document.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gray-950 border border-gray-800 rounded-xl p-4"
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex items-start justify-between">
                      <div className="p-2 bg-gray-900 rounded-lg">
                        {isSharedDoc ? (
                          document.type === SharedDocumentType.IMAGE ? (
                            <ImageIcon className="w-8 h-8 text-[#BFFF00]" />
                          ) : document.type === SharedDocumentType.PDF ? (
                            <FileTextIcon className="w-8 h-8 text-[#BFFF00]" />
                          ) : (
                            <File className="w-8 h-8 text-[#BFFF00]" />
                          )
                        ) : (
                          <FileText className="w-8 h-8 text-[#BFFF00]" />
                        )}
                      </div>
                      <span className={cn("px-2 py-1 rounded-full text-xs border", badge.color)}>
                        {badge.label}
                      </span>
                    </div>
                    
                    <div>
                      <h3 className="text-lg font-semibold text-white truncate">
                        {isSharedDoc ? document.name : `${document.type === DocumentType.INVOICE ? "Facture" : "Devis"} ${document.number}`}
                      </h3>
                      <p className="text-sm text-gray-400 mt-1">
                        {format(new Date(document.createdAt), "d MMMM yyyy", { locale: fr })}
                      </p>
                      {isBillingDoc && (
                        <div className="flex items-center gap-2 mt-2">
                          <p className="text-sm font-medium text-white">
                            {document.total.toFixed(2)} €
                          </p>
                          <span className="text-gray-600">•</span>
                          <p className={cn(
                            "text-sm",
                            document.status === DocumentStatus.PAID && "text-green-500",
                            document.status === DocumentStatus.SENT && "text-blue-500",
                            document.status === DocumentStatus.DRAFT && "text-gray-400",
                            document.status === DocumentStatus.OVERDUE && "text-red-500"
                          )}>
                            {document.status === DocumentStatus.PAID ? "Payé" :
                             document.status === DocumentStatus.SENT ? "Envoyé" :
                             document.status === DocumentStatus.DRAFT ? "Brouillon" :
                             document.status === DocumentStatus.OVERDUE ? "En retard" :
                             document.status === DocumentStatus.ACCEPTED ? "Accepté" : "Refusé"}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="icon"
                        onClick={() => isSharedDoc ? window.open(document.url, "_blank") : handleDownload(document.id)}
                        className="bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )
            })}

            {allDocuments.length === 0 && (
              <div className="col-span-full text-center py-12 bg-gray-950 border border-gray-800 rounded-xl">
                <p className="text-gray-400">Aucun document</p>
              </div>
            )}
          </div>
        )}

        {/* Formulaire d'upload */}
        <AnimatePresence>
          {isUploadOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 lg:p-6">
                <div className="space-y-4">
                  <div
                    {...getRootProps()}
                    className={cn(
                      "border-2 border-dashed rounded-lg p-6 transition-colors",
                      isDragActive ? "border-[#BFFF00] bg-[#BFFF00]/5" : "border-gray-800 hover:border-gray-700",
                      "cursor-pointer"
                    )}
                  >
                    <input {...getInputProps()} />
                    <div className="flex flex-col items-center justify-center text-center">
                      <Upload className="w-12 h-12 text-gray-400 mb-4" />
                      <p className="text-gray-400 mb-1">
                        {isDragActive
                          ? "Déposez les fichiers ici..."
                          : "Glissez-déposez vos fichiers ici ou cliquez pour sélectionner"}
                      </p>
                      <p className="text-sm text-gray-500">
                        PDF, images, documents (max 10MB)
                      </p>
                    </div>
                  </div>

                  <AnimatePresence>
                    {selectedFiles.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-2"
                      >
                        {selectedFiles.map((file, index) => (
                          <motion.div
                            key={index}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg border border-gray-800"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <File className="w-5 h-5 text-gray-400 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-white truncate">{file.name}</p>
                                <p className="text-xs text-gray-400">
                                  {(file.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedFiles(prev => prev.filter((_, i) => i !== index))
                              }}
                              className="text-gray-400 hover:text-red-500 transition-colors shrink-0"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </motion.div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <Textarea
                    placeholder="Description du document (optionnel)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="bg-gray-900 border-gray-800 text-white"
                  />

                  <Button
                    onClick={handleUpload}
                    disabled={selectedFiles.length === 0 || isUploading}
                    className={cn(
                      "w-full bg-[#BFFF00] text-black",
                      !isUploading && "hover:bg-[#BFFF00]/90",
                      isUploading && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Partage en cours...
                      </>
                    ) : (
                      <>
                        <Share2 className="w-4 h-4 mr-2" />
                        Partager
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
} 