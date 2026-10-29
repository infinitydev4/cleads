"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { 
  Save,
  Plus,
  Trash2,
  FileText,
  Eye,
  Image as ImageIcon,
  Settings2,
  Mail,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { format, addDays } from "date-fns"
import { fr } from "date-fns/locale"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { DocumentType } from "@prisma/client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import dynamic from "next/dynamic"
import { 
  InvoiceItem,
  CompanyInfo,
  ClientInfo,
  Client,
  InvoiceSettings
} from "@/types/billing"

const PDFPreview = dynamic(() => import("./PDFPreview").then(mod => mod.default), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center w-full h-[calc(100vh-200px)]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#BFFF00]"></div>
    </div>
  )
})

export default function NewInvoicePage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [companies, setCompanies] = useState<any[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [selectedCompany, setSelectedCompany] = useState<string>("")
  const [selectedClient, setSelectedClient] = useState<string>("")
  const [invoiceNumber, setInvoiceNumber] = useState(`FACT-${format(new Date(), "yyyyMM")}-001`)
  const [items, setItems] = useState<InvoiceItem[]>([
    { id: "1", description: "", quantity: 1, price: 0, details: "" }
  ])
  const [showPreview, setShowPreview] = useState(false)
  const [showPDFPreview, setShowPDFPreview] = useState(false)
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [isCreatingCompany, setIsCreatingCompany] = useState(false)
  const [newCompany, setNewCompany] = useState({
    name: "",
    address: "",
    city: "",
    email: "",
    phone: "",
    siret: "",
    tva: "",
    website: "",
    rib: {
      bank: "",
      iban: "",
      bic: "",
    }
  })

  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({
    name: "",
    address: "",
    city: "",
    email: "",
    phone: "",
    siret: "",
    tva: "",
    website: "",
    rib: {
      bank: "",
      iban: "",
      bic: "",
    }
  })

  const [clientInfo, setClientInfo] = useState<ClientInfo>({
    firstName: "",
    name: "",
    address: "",
    city: "",
    email: "",
    phone: "",
  })

  const [settings, setSettings] = useState<InvoiceSettings>({
    showRib: false,
    showTva: true,
    showLogo: true,
    accentColor: "#BFFF00",
    paymentDelay: 30,
    taxType: "TVA",
    taxValue: 20,
    website: "",
    email: "",
  })

  const [dueDate, setDueDate] = useState(format(addDays(new Date(), 30), "yyyy-MM-dd"))

  const invoiceData = {
    number: invoiceNumber,
    date: new Date(),
    dueDate: new Date(dueDate),
    clientName: `${clientInfo.firstName} ${clientInfo.name}`,
    clientEmail: clientInfo.email,
    clientPhone: clientInfo.phone,
    clientAddress: clientInfo.address,
    clientCity: clientInfo.city,
    items: items.map(item => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      price: item.price,
      details: item.details
    })),
    taxType: settings.taxType,
    taxValue: settings.taxValue,
    subtotal: items.reduce((sum, item) => sum + (item.quantity * item.price), 0),
    tax: items.reduce((sum, item) => sum + (item.quantity * item.price * (settings.taxValue / 100)), 0),
    total: items.reduce((sum, item) => sum + (item.quantity * item.price * (1 + (settings.taxValue / 100))), 0),
  }

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Récupérer les entreprises
        const companiesResponse = await fetch("/api/companies")
        if (!companiesResponse.ok) throw new Error("Erreur lors de la recuperation des entreprises")
        const companiesData = await companiesResponse.json()
        setCompanies(companiesData)

        if (companiesData.length > 0) {
          setSelectedCompany(companiesData[0].id)
          setCompanyInfo({
            name: companiesData[0].name,
            address: companiesData[0].address,
            city: companiesData[0].city,
            email: companiesData[0].email,
            phone: companiesData[0].phone,
            siret: companiesData[0].siret || "",
            tva: companiesData[0].tva || "",
            website: companiesData[0].website || "",
            rib: companiesData[0].rib || {
              bank: "",
              iban: "",
              bic: "",
            }
          })
        }

        // Récupérer les clients
        const clientsResponse = await fetch("/api/clients")
        if (!clientsResponse.ok) throw new Error("Erreur lors de la recuperation des clients")
        const clientsData = await clientsResponse.json()
        setClients(clientsData)

        // Générer le numéro de facture
        const numberResponse = await fetch(`/api/documents/number?type=${DocumentType.INVOICE}`)
        if (!numberResponse.ok) throw new Error("Erreur lors de la generation du numero")
        const { number } = await numberResponse.json()
        setInvoiceNumber(number)
      } catch (error) {
        console.error("Erreur:", error)
        toast.error("Erreur lors de l'initialisation")
      }
    }

    fetchInitialData()
  }, [])

  const handleSave = async () => {
    try {
      setIsLoading(true)

      // Validation des champs requis
      if (!selectedCompany) {
        toast.error("Veuillez sélectionner une entreprise")
        return
      }

      if (!clientInfo.firstName || !clientInfo.name || !clientInfo.email) {
        toast.error("Veuillez remplir les informations du client")
        return
      }

      if (items.some(item => !item.description || item.price <= 0)) {
        toast.error("Veuillez remplir correctement les items")
        return
      }

      const invoiceDataToSave = {
        number: invoiceNumber,
        date: new Date(),
        dueDate: new Date(dueDate),
        clientName: `${clientInfo.firstName} ${clientInfo.name}`,
        clientEmail: clientInfo.email,
        clientPhone: clientInfo.phone,
        clientAddress: clientInfo.address,
        clientCity: clientInfo.city,
        items: items.map(item => ({
          description: item.description,
          quantity: item.quantity,
          price: item.price,
          details: item.details || "",
        })),
        taxType: settings.taxType,
        taxValue: settings.taxValue,
        notes: "",
        companyId: selectedCompany,
        type: DocumentType.INVOICE,
        status: "DRAFT",
      }

      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(invoiceDataToSave),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Erreur lors de la création de la facture")
      }

      toast.success("Facture créée avec succès")
      
      // Rediriger vers la page de facturation avec un paramètre de rafraîchissement
      router.push("/dashboard/billing?refresh=true")
    } catch (error) {
      console.error("Erreur:", error)
      toast.error(error instanceof Error ? error.message : "Erreur lors de la création de la facture")
    } finally {
      setIsLoading(false)
    }
  }

  const addItem = () => {
    setItems([
      ...items,
      { id: crypto.randomUUID(), description: "", quantity: 1, price: 0, details: "" }
    ])
  }

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id))
  }

  const updateItem = (id: string, field: keyof InvoiceItem, value: string | number) => {
    setItems(items.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ))
  }

  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.price), 0)
  const tax = subtotal * (settings.taxValue / 100)
  const total = subtotal + tax

  const handleSendEmail = async () => {
    try {
      setIsSendingEmail(true)

      // Envoyer la requête au serveur pour générer le PDF et envoyer l'email
      const response = await fetch("/api/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoice: {
            ...invoiceData,
            clientEmail: clientInfo.email,
          },
          company: companyInfo,
        }),
      })

      if (!response.ok) {
        throw new Error("Erreur lors de l'envoi de l'email")
      }

      toast.success("Email envoyé avec succès")
    } catch (error) {
      console.error(error)
      toast.error("Erreur lors de l'envoi de l'email")
    } finally {
      setIsSendingEmail(false)
    }
  }

  const handleCreateCompany = async () => {
    try {
      setIsCreatingCompany(true)

      // Validation des champs requis
      if (!newCompany.name || !newCompany.email) {
        toast.error("Le nom et l'email sont requis")
        return
      }

      const response = await fetch("/api/companies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newCompany),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Erreur lors de la création de l'entreprise")
      }

      const createdCompany = await response.json()
      
      // Mettre à jour la liste des entreprises
      setCompanies([createdCompany, ...companies])
      
      // Sélectionner la nouvelle entreprise
      setSelectedCompany(createdCompany.id)
      setCompanyInfo({
        name: createdCompany.name,
        address: createdCompany.address,
        city: createdCompany.city,
        email: createdCompany.email,
        phone: createdCompany.phone,
        siret: createdCompany.siret || "",
        tva: createdCompany.tva || "",
        website: createdCompany.website || "",
        rib: createdCompany.rib || {
          bank: "",
          iban: "",
          bic: "",
        }
      })

      toast.success("Entreprise créée avec succès")
      
      // Réinitialiser le formulaire
      setNewCompany({
        name: "",
        address: "",
        city: "",
        email: "",
        phone: "",
        siret: "",
        tva: "",
        website: "",
        rib: {
          bank: "",
          iban: "",
          bic: "",
        }
      })
    } catch (error) {
      console.error("Erreur:", error)
      toast.error(error instanceof Error ? error.message : "Erreur lors de la création de l'entreprise")
    } finally {
      setIsCreatingCompany(false)
    }
  }

  const handleClientSelect = (clientId: string) => {
    setSelectedClient(clientId)
    const client = clients.find(c => c.id === clientId)
    if (client) {
      const [firstName, ...nameParts] = client.name.split(" ")
      setClientInfo({
        firstName: firstName || "",
        name: nameParts.join(" ") || "",
        address: client.address || "",
        city: client.city || "",
        email: client.email || "",
        phone: client.phone || "",
      })
    }
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Nouvelle facture</h1>
          <p className="text-gray-400">Créez et envoyez une facture</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="border-gray-800 text-black hover:bg-[#BFFF00] hover:text-black">
                <Settings2 className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent className="bg-gray-950 border-gray-800">
              <SheetHeader>
                <SheetTitle className="text-white">Paramètres du document</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 mt-6">
                <div className="space-y-2">
                  <Label className="text-white">Style</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant="outline"
                      className={cn(
                        "border-gray-800 h-20 w-full",
                        settings.accentColor === "#BFFF00" && "border-[#BFFF00]"
                      )}
                      onClick={() => setSettings({ ...settings, accentColor: "#BFFF00" })}
                    >
                      <div className="h-4 w-4 rounded-full bg-[#BFFF00]" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-white">Afficher le RIB</Label>
                    <Switch
                      checked={settings.showRib}
                      onCheckedChange={(checked) => 
                        setSettings({ ...settings, showRib: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-white">Afficher la TVA</Label>
                    <Switch
                      checked={settings.showTva}
                      onCheckedChange={(checked) =>
                        setSettings({ ...settings, showTva: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-white">Afficher le logo</Label>
                    <Switch
                      checked={settings.showLogo}
                      onCheckedChange={(checked) =>
                        setSettings({ ...settings, showLogo: checked })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label className="text-white mb-2 block">Type de taxe</Label>
                    <Input
                      value={settings.taxType}
                      onChange={(e) => setSettings({ ...settings, taxType: e.target.value })}
                      className="bg-gray-900 border-gray-800 text-white"
                      placeholder="TVA, TPS, etc."
                    />
                  </div>
                  <div>
                    <Label className="text-white mb-2 block">Taux de taxe (%)</Label>
                    <Input
                      type="number"
                      value={settings.taxValue}
                      onChange={(e) => setSettings({ ...settings, taxValue: parseFloat(e.target.value) })}
                      className="bg-gray-900 border-gray-800 text-white"
                      placeholder="20"
                    />
                  </div>
                  <div>
                    <Label className="text-white mb-2 block">Site web</Label>
                    <Input
                      value={settings.website}
                      onChange={(e) => setSettings({ ...settings, website: e.target.value })}
                      className="bg-gray-900 border-gray-800 text-white"
                      placeholder="www.example.com"
                    />
                  </div>
                  <div>
                    <Label className="text-white mb-2 block">Email</Label>
                    <Input
                      value={settings.email}
                      onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                      className="bg-gray-900 border-gray-800 text-white"
                      placeholder="contact@example.com"
                    />
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <Button
            variant="outline"
            className="border-gray-800 text-black hover:bg-[#BFFF00] hover:text-black"
            onClick={() => setShowPreview(!showPreview)}
          >
            <Eye className="h-4 w-4 mr-2 text-black" />
            {showPreview ? "Éditer" : "Aperçu"}
          </Button>

          <Button
            variant="outline"
            className="border-gray-800 text-black hover:bg-[#BFFF00] hover:text-black"
            onClick={() => setShowPDFPreview(!showPDFPreview)}
          >
            <FileText className="h-4 w-4 mr-2 text-black" />
            {showPDFPreview ? "Éditer" : "PDF"}
          </Button>

          <Button
            variant="outline"
            className="border-gray-800 text-black hover:bg-[#BFFF00] hover:text-black"
            onClick={handleSendEmail}
            disabled={isSendingEmail || !clientInfo.email}
          >
            <Mail className="h-4 w-4 mr-2 text-black" />
            {isSendingEmail ? "Envoi..." : "Envoyer"}
          </Button>

          <Button 
            className="bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
            onClick={handleSave}
            disabled={isLoading}
          >
            <Save className="h-4 w-4 mr-2 text-black" />
            {isLoading ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
      </div>

      {showPDFPreview ? (
        <PDFPreview invoice={invoiceData} company={companyInfo} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("space-y-6", showPreview && "lg:hidden")}
          >
            {/* Company Selection */}
            <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-white">Sélection de l'entreprise</h2>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="border-gray-800 text-black hover:bg-[#BFFF00] hover:text-black">
                      <Plus className="h-4 w-4 mr-2 text-black" />
                      Nouvelle entreprise
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-gray-950 border-gray-800">
                    <DialogHeader>
                      <DialogTitle className="text-white">Créer une nouvelle entreprise</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6 mt-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Input
                          placeholder="Nom de l'entreprise"
                          value={newCompany.name}
                          onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })}
                          className="bg-gray-900 border-gray-800 text-white"
                        />
                        <Input
                          placeholder="Email"
                          value={newCompany.email}
                          onChange={(e) => setNewCompany({ ...newCompany, email: e.target.value })}
                          className="bg-gray-900 border-gray-800 text-white"
                        />
                        <Input
                          placeholder="Téléphone"
                          value={newCompany.phone}
                          onChange={(e) => setNewCompany({ ...newCompany, phone: e.target.value })}
                          className="bg-gray-900 border-gray-800 text-white"
                        />
                        <Input
                          placeholder="Site web"
                          value={newCompany.website}
                          onChange={(e) => setNewCompany({ ...newCompany, website: e.target.value })}
                          className="bg-gray-900 border-gray-800 text-white"
                        />
                        <Input
                          placeholder="Adresse"
                          value={newCompany.address}
                          onChange={(e) => setNewCompany({ ...newCompany, address: e.target.value })}
                          className="bg-gray-900 border-gray-800 text-white"
                        />
                        <Input
                          placeholder="Ville"
                          value={newCompany.city}
                          onChange={(e) => setNewCompany({ ...newCompany, city: e.target.value })}
                          className="bg-gray-900 border-gray-800 text-white"
                        />
                        <Input
                          placeholder="SIRET"
                          value={newCompany.siret}
                          onChange={(e) => setNewCompany({ ...newCompany, siret: e.target.value })}
                          className="bg-gray-900 border-gray-800 text-white"
                        />
                        <Input
                          placeholder="N° TVA"
                          value={newCompany.tva}
                          onChange={(e) => setNewCompany({ ...newCompany, tva: e.target.value })}
                          className="bg-gray-900 border-gray-800 text-white"
                        />
                      </div>

                      <div className="space-y-4">
                        <h3 className="text-white font-medium">Coordonnées bancaires</h3>
                        <Input
                          placeholder="Banque"
                          value={newCompany.rib.bank}
                          onChange={(e) => setNewCompany({
                            ...newCompany,
                            rib: { ...newCompany.rib, bank: e.target.value }
                          })}
                          className="bg-gray-900 border-gray-800 text-white"
                        />
                        <Input
                          placeholder="IBAN"
                          value={newCompany.rib.iban}
                          onChange={(e) => setNewCompany({
                            ...newCompany,
                            rib: { ...newCompany.rib, iban: e.target.value }
                          })}
                          className="bg-gray-900 border-gray-800 text-white"
                        />
                        <Input
                          placeholder="BIC"
                          value={newCompany.rib.bic}
                          onChange={(e) => setNewCompany({
                            ...newCompany,
                            rib: { ...newCompany.rib, bic: e.target.value }
                          })}
                          className="bg-gray-900 border-gray-800 text-white"
                        />
                      </div>

                      <Button
                        className="w-full bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
                        onClick={handleCreateCompany}
                        disabled={isCreatingCompany}
                      >
                        {isCreatingCompany ? "Création..." : "Créer l'entreprise"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <Select
                value={selectedCompany}
                onValueChange={(value) => {
                  setSelectedCompany(value)
                  const company = companies.find(c => c.id === value)
                  if (company) {
                    setCompanyInfo({
                      name: company.name,
                      address: company.address,
                      city: company.city,
                      email: company.email,
                      phone: company.phone,
                      siret: company.siret || "",
                      tva: company.tva || "",
                      website: company.website || "",
                      rib: company.rib || {
                        bank: "",
                        iban: "",
                        bic: "",
                      }
                    })
                  }
                }}
              >
                <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                  <SelectValue placeholder="Sélectionner une entreprise" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Company Info */}
            <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-6">Informations de l'entreprise</h2>
              <div className="flex items-center gap-4 mb-6">
                <div className="h-20 w-20 rounded-lg border-2 border-dashed border-gray-800 flex items-center justify-center">
                  {settings.showLogo ? (
                    <Image src="/logo.svg" alt="Logo" width={60} height={60} />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-gray-400" />
                  )}
                </div>
                <Button variant="outline" className="border-gray-800 text-black hover:bg-[#BFFF00] hover:text-black">
                  Changer le logo
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Input
                  placeholder="Nom de l'entreprise"
                  value={companyInfo.name}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, name: e.target.value })}
                  className="bg-gray-900 border-gray-800 text-white"
                />
                <Input
                  placeholder="Email"
                  value={companyInfo.email}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, email: e.target.value })}
                  className="bg-gray-900 border-gray-800 text-white"
                />
                <Input
                  placeholder="Téléphone"
                  value={companyInfo.phone}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, phone: e.target.value })}
                  className="bg-gray-900 border-gray-800 text-white"
                />
                <Input
                  placeholder="Site web"
                  value={companyInfo.website}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, website: e.target.value })}
                  className="bg-gray-900 border-gray-800 text-white"
                />
                <Input
                  placeholder="Adresse"
                  value={companyInfo.address}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, address: e.target.value })}
                  className="bg-gray-900 border-gray-800 text-white"
                />
                <Input
                  placeholder="Ville"
                  value={companyInfo.city}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, city: e.target.value })}
                  className="bg-gray-900 border-gray-800 text-white"
                />
                <Input
                  placeholder="SIRET"
                  value={companyInfo.siret}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, siret: e.target.value })}
                  className="bg-gray-900 border-gray-800 text-white"
                />
                <Input
                  placeholder="N° TVA"
                  value={companyInfo.tva}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, tva: e.target.value })}
                  className="bg-gray-900 border-gray-800 text-white"
                />
              </div>
            </div>

            {/* Client Info */}
            <div className="bg-gray-950 border border-gray-800 rounded-xl p-6 mt-6">
              <h2 className="text-lg font-semibold text-white mb-6">Informations du client</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="col-span-full">
                  <label className="text-sm text-gray-400 mb-2 block">Sélectionner un client</label>
                  <select
                    value={selectedClient}
                    onChange={(e) => handleClientSelect(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-800 rounded-md px-3 py-2 text-white"
                  >
                    <option value="">Sélectionner un client...</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name} - {client.email}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Input
                  placeholder="Prénom"
                  value={clientInfo.firstName}
                  onChange={(e) => setClientInfo({ ...clientInfo, firstName: e.target.value })}
                  className="bg-gray-900 border-gray-800 text-white"
                />
                <Input
                  placeholder="Nom"
                  value={clientInfo.name}
                  onChange={(e) => setClientInfo({ ...clientInfo, name: e.target.value })}
                  className="bg-gray-900 border-gray-800 text-white"
                />
                <Input
                  placeholder="Email"
                  value={clientInfo.email}
                  onChange={(e) => setClientInfo({ ...clientInfo, email: e.target.value })}
                  className="bg-gray-900 border-gray-800 text-white"
                />
                <Input
                  placeholder="Téléphone"
                  value={clientInfo.phone}
                  onChange={(e) => setClientInfo({ ...clientInfo, phone: e.target.value })}
                  className="bg-gray-900 border-gray-800 text-white"
                />
                <Input
                  placeholder="Adresse"
                  value={clientInfo.address}
                  onChange={(e) => setClientInfo({ ...clientInfo, address: e.target.value })}
                  className="bg-gray-900 border-gray-800 text-white"
                />
                <Input
                  placeholder="Ville"
                  value={clientInfo.city}
                  onChange={(e) => setClientInfo({ ...clientInfo, city: e.target.value })}
                  className="bg-gray-900 border-gray-800 text-white"
                />
              </div>
            </div>

            {/* Invoice Details */}
            <div className="bg-gray-950 border border-gray-800 rounded-xl p-6 mt-6">
              <h2 className="text-lg font-semibold text-white mb-6">Détails de la facture</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">Numéro de facture</label>
                  <Input
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    className="bg-gray-900 border-gray-800 text-white"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">Date d'émission</label>
                  <Input
                    type="date"
                    defaultValue={format(new Date(), "yyyy-MM-dd")}
                    className="bg-gray-900 border-gray-800 text-white"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">Date d'échéance</label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="bg-gray-900 border-gray-800 text-white"
                  />
                </div>
              </div>

              <div className="space-y-4">
                {items.map((item, index) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-12 gap-4 items-start"
                  >
                    <div className="col-span-12 md:col-span-6">
                      <Input
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => updateItem(item.id, "description", e.target.value)}
                        className="bg-gray-900 border-gray-800 text-white"
                      />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <Input
                        type="number"
                        placeholder="Qté"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, "quantity", parseFloat(e.target.value))}
                        className="bg-gray-900 border-gray-800 text-white"
                      />
                    </div>
                    <div className="col-span-6 md:col-span-3">
                      <Input
                        type="number"
                        placeholder="Prix unitaire"
                        value={item.price}
                        onChange={(e) => updateItem(item.id, "price", parseFloat(e.target.value))}
                        className="bg-gray-900 border-gray-800 text-white"
                      />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(item.id)}
                        className="text-red-400 hover:text-red-500 hover:bg-red-500/10"
                        disabled={items.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <Button
                variant="outline"
                className="mt-4 border-gray-800 text-black hover:bg-[#BFFF00] hover:text-black"
                onClick={addItem}
              >
                <Plus className="h-4 w-4 mr-2 text-black" />
                Ajouter une ligne
              </Button>
            </div>

            {/* Notes */}
            <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-6">Notes</h2>
              <Textarea
                placeholder="Notes ou conditions de paiement..."
                className="bg-gray-900 border-gray-800 text-white min-h-[100px]"
              />
            </div>
          </motion.div>

          {/* Preview */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "bg-white text-black rounded-xl p-8 shadow-xl",
              !showPreview && "hidden lg:block"
            )}
          >
            {/* En-tête de la facture */}
            <div className="flex justify-between items-start mb-12">
              <div className="space-y-4">
                <div className="h-20 w-20 bg-[#BFFF00] rounded-xl flex items-center justify-center">
                  {settings.showLogo ? (
                    <Image src="/logo.svg" alt="Logo" width={200} height={200} />
                  ) : (
                    <FileText className="h-12 w-12 text-black" />
                  )}
                </div>
                <div>
                  <h2 className="text-3xl font-bold tracking-tight">FACTURE</h2>
                  <p className="text-gray-500 font-medium">{invoiceNumber}</p>
                </div>
              </div>
              <div className="text-right space-y-4">
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-500 mb-1">Date d'émission</p>
                  <p className="font-medium">{format(new Date(), "dd MMMM yyyy", { locale: fr })}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-500 mb-1">Date d'échéance</p>
                  <p className="font-medium">
                    {format(new Date(dueDate), "dd MMMM yyyy", { locale: fr })}
                  </p>
                </div>
              </div>
            </div>

            {/* Informations entreprise et client */}
            <div className="grid grid-cols-2 gap-12 mb-12">
              <div className="bg-gray-50 rounded-xl p-6">
                <p className="text-sm text-gray-500 mb-3">DE</p>
                <div className="space-y-1">
                  <p className="font-bold text-lg">{companyInfo.name || "Votre Entreprise"}</p>
                  <p className="text-gray-600">{companyInfo.address || "Adresse"}</p>
                  <p className="text-gray-600">{companyInfo.city || "Ville"}</p>
                  <p className="text-gray-600">{companyInfo.email || "Email"}</p>
                  <p className="text-gray-600">SIRET: {companyInfo.siret || "..."}</p>
                  {settings.showTva && (
                    <p className="text-gray-600">TVA: {companyInfo.tva || "..."}</p>
                  )}
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-6">
                <p className="text-sm text-gray-500 mb-3">POUR</p>
                <div className="space-y-1">
                  <p className="font-bold text-lg">
                    {clientInfo.firstName ? `${clientInfo.firstName} ${clientInfo.name}` : "Client"}
                  </p>
                  <p className="text-gray-600">{clientInfo.address || "Adresse"}</p>
                  <p className="text-gray-600">{clientInfo.city || "Ville"}</p>
                  <p className="text-gray-600">{clientInfo.email || "Email"}</p>
                  <p className="text-gray-600">{clientInfo.phone || "Téléphone"}</p>
                </div>
              </div>
            </div>

            {/* Tableau des prestations */}
            <div className="mb-12">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-4 text-gray-500 font-medium">Description</th>
                    <th className="text-right py-4 text-gray-500 font-medium">Qté</th>
                    <th className="text-right py-4 text-gray-500 font-medium">Prix unitaire</th>
                    <th className="text-right py-4 text-gray-500 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-4">
                        <p className="font-medium">{item.description || "..."}</p>
                        {item.details && (
                          <p className="text-sm text-gray-500 mt-1">{item.details}</p>
                        )}
                      </td>
                      <td className="text-right py-4 font-medium">{item.quantity}</td>
                      <td className="text-right py-4 font-medium">
                        {item.price.toLocaleString()}€
                      </td>
                      <td className="text-right py-4 font-medium">
                        {(item.quantity * item.price).toLocaleString()}€
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totaux */}
            <div className="flex justify-end mb-12">
              <div className="w-72 space-y-3">
                <div className="flex justify-between py-3 bg-gray-50 px-4 rounded-lg">
                  <span className="text-gray-600">Sous-total</span>
                  <span className="font-medium">{subtotal.toLocaleString()}€</span>
                </div>
                <div className="flex justify-between py-3 bg-gray-50 px-4 rounded-lg">
                  <span className="text-gray-600">{settings.taxType} ({settings.taxValue}%)</span>
                  <span className="font-medium">{tax.toLocaleString()}€</span>
                </div>
                <div className="flex justify-between py-4 bg-[#BFFF00] px-4 rounded-lg">
                  <span className="font-bold text-black">Total TTC</span>
                  <span className="font-bold text-black">{total.toLocaleString()}€</span>
                </div>
              </div>
            </div>

            {/* Conditions et notes */}
            <div className="space-y-6">
              <div className="bg-gray-50 rounded-xl p-6">
                <h3 className="font-medium mb-3">Conditions de paiement</h3>
                <p className="text-gray-600 text-sm">
                  Cette facture est payable sous {settings.paymentDelay} jours.
                  Le paiement est dû au plus tard le {format(new Date(dueDate), "dd/MM/yyyy")}.
                </p>
              </div>

              {settings.showRib && (
                <div className="bg-gray-50 rounded-xl p-6">
                  <h3 className="font-medium mb-3">Coordonnées bancaires</h3>
                  <div className="space-y-1 text-sm text-gray-600">
                    <p>Banque: {companyInfo.rib.bank || "..."}</p>
                    <p>IBAN: {companyInfo.rib.iban || "..."}</p>
                    <p>BIC: {companyInfo.rib.bic || "..."}</p>
                  </div>
                </div>
              )}
            </div>

           {/* Footer */}
           <div className="mt-28 pt-6 border-t border-gray-200">
              <div className="flex justify-between text-sm text-gray-500">
                <div>
                  <p>Votre Entreprise - SIRET: 123 456 789 00001</p>
                  <p>TVA Intracommunautaire: FR 12 345 678 900</p>
                </div>
                <div className="text-right">
                  <p>{settings.email || "contact@entreprise.com"}</p>
                  <p>{settings.website || "www.entreprise.com"}</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
} 