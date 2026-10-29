"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { 
  Save,
  Eye,
  Settings2,
  Plus,
  Trash2,
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
import Image from "next/image"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { 
  QuoteItem,
  CompanyInfo,
  ClientInfo,
  Client,
  QuoteSettings
} from "@/types/billing"

export default function NewQuotePage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [companies, setCompanies] = useState<any[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [selectedCompany, setSelectedCompany] = useState<string>("")
  const [selectedClient, setSelectedClient] = useState<string>("")
  const [quoteNumber, setQuoteNumber] = useState(`DEVIS-${format(new Date(), "yyyyMM")}-001`)
  const [items, setItems] = useState<QuoteItem[]>([
    { id: "1", description: "", quantity: 1, price: 0, details: "" }
  ])
  const [showPreview, setShowPreview] = useState(false)
  const [validity, setValidity] = useState("30") // Durée de validité en jours

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

  const [settings, setSettings] = useState<QuoteSettings>({
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
      } catch (error) {
        console.error("Erreur:", error)
        toast.error("Erreur lors de l'initialisation")
      }
    }

    fetchInitialData()
  }, [])

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

  const handleSave = async () => {
    try {
      setIsLoading(true)

      // Validation des champs requis
      if (!selectedCompany) {
        toast.error("Veuillez selectionner une entreprise")
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

      const quoteData = {
        number: quoteNumber,
        clientName: `${clientInfo.firstName} ${clientInfo.name}`,
        clientEmail: clientInfo.email,
        clientPhone: clientInfo.phone,
        clientAddress: clientInfo.address,
        clientCity: clientInfo.city,
        items: items.map(item => ({
          description: item.description,
          quantity: item.quantity,
          price: item.price,
          details: item.details
        })),
        taxType: settings.taxType,
        taxValue: settings.taxValue,
        notes: "",
        companyId: selectedCompany
      }

      const response = await fetch("/api/quotes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(quoteData),
      })

      if (!response.ok) throw new Error("Erreur lors de la creation du devis")

      toast.success("Devis cree avec succes")
      router.push("/dashboard/billing")
    } catch (error) {
      console.error("Erreur:", error)
      toast.error("Erreur lors de la creation du devis")
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

  const updateItem = (id: string, field: keyof QuoteItem, value: string | number) => {
    setItems(items.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ))
  }

  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.price), 0)
  const tax = subtotal * (settings.taxValue / 100)
  const total = subtotal + tax

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Nouveau devis</h1>
          <p className="text-gray-400">Creez et envoyez un devis</p>
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
                    {/* Ajoutez d'autres styles */}
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
            className="bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
            onClick={handleSave}
            disabled={isLoading}
          >
            <Save className="h-4 w-4 mr-2 text-black" />
            {isLoading ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn("space-y-6", showPreview && "lg:hidden")}
        >
          {/* Company Info */}
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-6">Informations de l'entreprise</h2>
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
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
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
              <Input
                placeholder="Téléphone"
                value={clientInfo.phone}
                onChange={(e) => setClientInfo({ ...clientInfo, phone: e.target.value })}
                className="bg-gray-900 border-gray-800 text-white"
              />
            </div>
          </div>

          {/* Quote Details */}
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-6">Détails du devis</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Numéro de devis</label>
                <Input
                  value={quoteNumber}
                  onChange={(e) => setQuoteNumber(e.target.value)}
                  className="bg-gray-900 border-gray-800 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Date</label>
                <Input
                  type="date"
                  defaultValue={format(new Date(), "yyyy-MM-dd")}
                  className="bg-gray-900 border-gray-800 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Validité (jours)</label>
                <Input
                  type="number"
                  value={validity}
                  onChange={(e) => setValidity(e.target.value)}
                  className="bg-gray-900 border-gray-800 text-white"
                />
              </div>
            </div>

            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="space-y-4 p-4 border border-gray-800 rounded-lg"
                >
                  <div className="grid grid-cols-12 gap-4 items-start">
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
                  <Textarea
                    placeholder="Détails supplémentaires..."
                    value={item.details}
                    onChange={(e) => updateItem(item.id, "details", e.target.value)}
                    className="bg-gray-900 border-gray-800 text-white min-h-[80px]"
                  />
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

          {/* Conditions */}
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-6">Conditions</h2>
            <Textarea
              placeholder="Conditions de vente, modalités de paiement..."
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
          {/* En-tête du devis */}
          <div className="flex justify-between items-start mb-12">
            <div className="space-y-4">
              <div className="h-20 w-20 bg-[#BFFF00] rounded-xl flex items-center justify-center">
                <Image src="/logo.svg" alt="Logo" width={200} height={200} />
              </div>
              <div>
                <h2 className="text-3xl font-bold tracking-tight">DEVIS</h2>
                <p className="text-gray-500 font-medium">{quoteNumber}</p>
              </div>
            </div>
            <div className="text-right space-y-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-500 mb-1">Date d'émission</p>
                <p className="font-medium">{format(new Date(), "dd MMMM yyyy", { locale: fr })}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-500 mb-1">Date de validité</p>
                <p className="font-medium">
                  {format(addDays(new Date(), parseInt(validity)), "dd MMMM yyyy", { locale: fr })}
                </p>
              </div>
            </div>
          </div>

          {/* Informations entreprise et client avec données dynamiques */}
          <div className="grid grid-cols-2 gap-12 mb-12">
            <div className="bg-gray-50 rounded-xl p-6">
              <p className="text-sm text-gray-500 mb-3">DE</p>
              <div className="space-y-1">
                <p className="font-bold text-lg">{companyInfo.name || "Votre Entreprise"}</p>
                <p className="text-gray-600">{companyInfo.address || "Adresse"}</p>
                <p className="text-gray-600">{companyInfo.city || "Ville"}</p>
                <p className="text-gray-600">{companyInfo.email || "Email"}</p>
                <p className="text-gray-600">SIRET: {companyInfo.siret || "..."}</p>
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
                Ce devis est valable 30 jours à compter de sa date d'émission.
                Le paiement s'effectue à 30 jours à compter de la date de facturation.
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-6">
              <h3 className="font-medium mb-3">Notes</h3>
              <p className="text-gray-600 text-sm">
                Pour accepter ce devis, merci de le retourner signé avec la mention "Bon pour accord".
                Pour toute question, n'hésitez pas à nous contacter.
              </p>
            </div>
          </div>

          {/* Affichage conditionnel du RIB */}
          {settings.showRib && (
            <div className="mt-6 bg-gray-50 rounded-xl p-6">
              <h3 className="font-medium mb-3">Coordonnées bancaires</h3>
              <div className="space-y-1 text-sm text-gray-600">
                <p>Banque: {companyInfo.rib.bank}</p>
                <p>IBAN: {companyInfo.rib.iban}</p>
                <p>BIC: {companyInfo.rib.bic}</p>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="mt-12 pt-6 border-t border-gray-200">
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
    </div>
  )
} 