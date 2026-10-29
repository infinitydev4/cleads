"use client"

import { useState, useEffect } from "react"
import { 
  Calendar, 
  Check,
  Clock, 
  Edit, 
  PlayCircle, 
  PauseCircle, 
  RefreshCw, 
  Trash2, 
  AlertCircle,
  CalendarClock 
} from "lucide-react"
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { EditScheduleForm } from "@/components/blog/edit-schedule-form"
import { ArticleSchedule } from "@/types/blog"

// Interface locale pour le composant qui restreint les champs Date à string
interface Schedule extends Omit<ArticleSchedule, 'nextRunDate' | 'lastRunDate' | 'createdAt' | 'updatedAt'> {
  nextRunDate: string;
  lastRunDate?: string;
  createdAt: string;
  updatedAt: string;
}

export function ScheduleList() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const [runningNow, setRunningNow] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Charger les planifications au chargement du composant
  useEffect(() => {
    fetchSchedules()
  }, [])

  // Récupérer les planifications depuis l'API
  const fetchSchedules = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/blog/schedules")
      if (!response.ok) {
        throw new Error(`Erreur ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      setSchedules(data)
    } catch (error) {
      console.error("Erreur lors du chargement des planifications:", error)
      toast.error("Impossible de charger les planifications")
      setError("Erreur lors du chargement des planifications")
    } finally {
      setLoading(false)
    }
  }

  // Mettre en pause une planification
  const pauseSchedule = async (id: string) => {
    setUpdating(id)
    try {
      const response = await fetch(`/api/blog/schedules/${id}/pause`, {
        method: "PUT"
      })
      
      if (!response.ok) {
        throw new Error(`Erreur ${response.status}: ${response.statusText}`)
      }
      
      // Mettre à jour l'état local
      setSchedules(schedules.map(schedule => 
        schedule.id === id ? { ...schedule, status: "PAUSED" } : schedule
      ))
      
      toast.success("Planification mise en pause")
    } catch (error) {
      console.error("Erreur lors de la mise en pause:", error)
      toast.error("Impossible de mettre en pause la planification")
    } finally {
      setUpdating(null)
    }
  }

  // Réactiver une planification
  const resumeSchedule = async (id: string) => {
    setUpdating(id)
    try {
      const response = await fetch(`/api/blog/schedules/${id}/resume`, {
        method: "PUT"
      })
      
      if (!response.ok) {
        throw new Error(`Erreur ${response.status}: ${response.statusText}`)
      }
      
      // Mettre à jour l'état local
      setSchedules(schedules.map(schedule => 
        schedule.id === id ? { ...schedule, status: "ACTIVE" } : schedule
      ))
      
      toast.success("Planification réactivée")
    } catch (error) {
      console.error("Erreur lors de la réactivation:", error)
      toast.error("Impossible de réactiver la planification")
    } finally {
      setUpdating(null)
    }
  }

  // Exécuter une planification immédiatement
  const runScheduleNow = async (id: string) => {
    setRunningNow(id)
    try {
      // Augmentation du timeout à 60 secondes pour Netlify qui a des limites plus restrictives
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      
      const response = await fetch(`/api/blog/schedules/${id}/run-now`, {
        method: "POST",
        signal: controller.signal,
        // Ajout d'en-têtes pour éviter les problèmes de mise en cache
        headers: {
          "Cache-Control": "no-cache",
          "Pragma": "no-cache"
        }
      }).catch(error => {
        // Gérer spécifiquement les erreurs d'abandon et de réseau
        if (error.name === 'AbortError') {
          // Mettre à jour le statut même en cas de timeout
          setSchedules(schedules.map(schedule => 
            schedule.id === id ? { 
              ...schedule, 
              lastRunDate: new Date().toISOString(),
              lastRunStatus: "IN_PROGRESS"
            } : schedule
          ));
          throw new Error('La génération d\'article a pris trop de temps. Elle se poursuit en arrière-plan.');
        }
        throw new Error('Problème de connexion réseau. Veuillez réessayer.');
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        // Gestion spécifique pour les erreurs de type 502 et 504 (gateway timeout)
        if (response.status === 502 || response.status === 504) {
          // Pour les erreurs de timeout côté serveur, on considère que la tâche continue en arrière-plan
          setSchedules(schedules.map(schedule => 
            schedule.id === id ? { 
              ...schedule, 
              lastRunDate: new Date().toISOString(),
              lastRunStatus: "IN_PROGRESS"
            } : schedule
          ));
          throw new Error("La génération est trop longue mais continue en arrière-plan. Rafraîchissez dans quelques instants.");
        }
        
        // Essayer de récupérer le message d'erreur de l'API
        let errorMessage;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error;
        } catch (e) {
          errorMessage = `Erreur ${response.status}: ${response.statusText}`;
        }
        
        throw new Error(errorMessage || `Erreur ${response.status}`);
      }
      
      const data = await response.json();
      
      // Mettre à jour l'état local
      setSchedules(schedules.map(schedule => 
        schedule.id === id ? { 
          ...schedule, 
          lastRunDate: new Date().toISOString(),
          lastRunStatus: "SUCCESS",
          articlesGenerated: schedule.articlesGenerated + 1
        } : schedule
      ));
      
      toast.success("Article généré avec succès");
    } catch (error: any) {
      console.error("Erreur lors de l'exécution immédiate:", error);
      
      if (error.message.includes('arrière-plan')) {
        // Pour les timeouts, afficher un message informatif
        toast.info(error.message);
      } else {
        // Pour les autres erreurs, afficher l'erreur
        toast.error(`Erreur: ${error.message}`);
      }
    } finally {
      setTimeout(() => {
        setRunningNow(null);
      }, 2000); // Gardons l'état de chargement un moment pour l'UX
    }
  }

  // Supprimer une planification
  const deleteSchedule = async (id: string) => {
    setDeleting(id)
    try {
      const response = await fetch(`/api/blog/schedules/${id}`, {
        method: "DELETE"
      })
      
      if (!response.ok) {
        throw new Error(`Erreur ${response.status}: ${response.statusText}`)
      }
      
      // Mettre à jour l'état local
      setSchedules(schedules.filter(schedule => schedule.id !== id))
      
      toast.success("Planification supprimée")
    } catch (error) {
      console.error("Erreur lors de la suppression:", error)
      toast.error("Impossible de supprimer la planification")
    } finally {
      setDeleting(null)
    }
  }

  // Formater la date au format français
  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }
    return new Date(dateString).toLocaleDateString('fr-FR', options)
  }

  // Obtenir le libellé convivial de la fréquence
  const getFrequencyLabel = (frequency: string) => {
    const labels: Record<string, string> = {
      "DAILY": "Quotidienne",
      "WEEKLY": "Hebdomadaire",
      "BIWEEKLY": "Bihebdomadaire",
      "MONTHLY": "Mensuelle"
    }
    return labels[frequency] || frequency
  }

  // Obtenir la couleur associée au statut
  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      "ACTIVE": "bg-green-500/10 text-green-500 border-green-500/20",
      "PAUSED": "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
      "COMPLETED": "bg-blue-500/10 text-blue-500 border-blue-500/20",
      "FAILED": "bg-red-500/10 text-red-500 border-red-500/20",
      "IN_PROGRESS": "bg-blue-500/10 text-blue-500 border-blue-500/20 animate-pulse"
    }
    return colors[status] || "bg-gray-500/20 text-white border-gray-500/20"
  }

  // Obtenir le label du statut
  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      "ACTIVE": "Active",
      "PAUSED": "En pause",
      "COMPLETED": "Terminée",
      "FAILED": "Échec",
      "IN_PROGRESS": "En cours"
    }
    return labels[status] || status
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
          <p className="text-gray-400">Chargement des planifications...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle className="h-5 w-5" />
          <p>{error}</p>
        </div>
      </div>
    )
  }

  if (schedules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <CalendarClock className="h-12 w-12 text-gray-400 mb-3" />
        <h3 className="text-lg font-medium text-white mb-1">Aucune planification</h3>
        <p className="text-gray-400 mb-4">
          Vous n'avez pas encore créé de planification de génération d'articles automatique.
        </p>
        <Button variant="outline" className="text-[#BFFF00] border-[#BFFF00] hover:bg-[#BFFF00]/10">
          Créer une planification
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {schedules.map(schedule => (
          <Card key={schedule.id} className="bg-gray-950 border-gray-800">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <Badge className={`${getStatusColor(schedule.status)}`}>
                  {getStatusLabel(schedule.status)}
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1 text-white">
                  <Clock className="h-3 w-3 text-white" />
                  {getFrequencyLabel(schedule.frequency)}
                </Badge>
              </div>
              <CardTitle className="text-lg mt-2 text-white">{schedule.name}</CardTitle>
              <CardDescription>
                {schedule.categories.join(", ")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pb-3">
              <div className="text-sm">
                <div className="flex items-center gap-2 text-gray-400 mb-1">
                  <Calendar className="h-4 w-4 text-[#BFFF00]" />
                  <span>Prochaine génération:</span>
                </div>
                <p className="text-white">{formatDate(schedule.nextRunDate)}</p>
              </div>
              
              {schedule.lastRunDate && (
                <div className="text-sm">
                  <div className="flex items-center gap-2 text-gray-400 mb-1">
                    <Clock className="h-4 w-4 text-[#BFFF00]" />
                    <span>Dernière génération:</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-white">{formatDate(schedule.lastRunDate)}</p>
                    {schedule.lastRunStatus === "SUCCESS" && <Check className="h-4 w-4 text-green-500" />}
                    {schedule.lastRunStatus === "FAILED" && <AlertCircle className="h-4 w-4 text-red-500" />}
                    {schedule.lastRunStatus === "IN_PROGRESS" && <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />}
                  </div>
                </div>
              )}
              
              <div className="flex flex-wrap gap-1 pt-1">
                {schedule.keywords.slice(0, 5).map(keyword => (
                  <Badge key={keyword} variant="secondary" className="text-xs bg-[#BFFF00] text-black">
                    {keyword}
                  </Badge>
                ))}
                {schedule.keywords.length > 5 && (
                  <Badge variant="secondary" className="text-xs">
                    +{schedule.keywords.length - 5}
                  </Badge>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex justify-between pt-2 border-t border-gray-800">
              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => runScheduleNow(schedule.id)}
                        disabled={runningNow === schedule.id}
                      >
                        {runningNow === schedule.id ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <PlayCircle className="h-4 w-4 text-green-500" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Exécuter maintenant</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => schedule.status === "ACTIVE" 
                          ? pauseSchedule(schedule.id) 
                          : resumeSchedule(schedule.id)
                        }
                        disabled={updating === schedule.id}
                      >
                        {updating === schedule.id ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : schedule.status === "ACTIVE" ? (
                          <PauseCircle className="h-4 w-4 text-yellow-500" />
                        ) : (
                          <PlayCircle className="h-4 w-4 text-green-500" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{schedule.status === "ACTIVE" ? "Mettre en pause" : "Réactiver"}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                    >
                      <Edit className="h-4 w-4 text-blue-500" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent 
                    className="sm:max-w-[525px] bg-gray-950 border border-gray-800 p-0 max-h-[90vh] flex flex-col overflow-hidden"
                  >
                    <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-800 bg-gray-950 flex-shrink-0">
                      <DialogTitle>Modifier la planification</DialogTitle>
                      <DialogDescription>
                        Modifiez les paramètres de cette planification.
                      </DialogDescription>
                    </DialogHeader>
                    
                    <div className="overflow-y-auto flex-grow px-6 pb-6">
                      <EditScheduleForm 
                        schedule={schedule} 
                        onSuccess={() => {
                          fetchSchedules();
                          toast.success("Planification mise à jour avec succès");
                        }} 
                      />
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="h-8 w-8"
                    disabled={deleting === schedule.id}
                  >
                    {deleting === schedule.id ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-red-500" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-gray-950 border-gray-800">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer la planification</AlertDialogTitle>
                    <AlertDialogDescription>
                      Êtes-vous sûr de vouloir supprimer cette planification ? Cette action est irréversible.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-red-500 hover:bg-red-600"
                      onClick={() => deleteSchedule(schedule.id)}
                    >
                      Supprimer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  )
} 