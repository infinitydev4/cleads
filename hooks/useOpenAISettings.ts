import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ModelType } from "@/lib/openai";

interface OpenAISettings {
  apiKey: string;
  model: ModelType;
  autoGenerateTags: boolean;
  autoOptimizeSEO: boolean;
}

export const useOpenAISettings = () => {
  const [settings, setSettings] = useState<OpenAISettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/settings/openai");
      if (!response.ok) throw new Error("Erreur lors de la récupération des paramètres");
      const data = await response.json();
      setSettings(data);
    } catch (error) {
      console.error("Erreur lors du chargement des paramètres OpenAI:", error);
      toast.error("Erreur lors du chargement des paramètres OpenAI");
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (newSettings: Partial<OpenAISettings>) => {
    try {
      const response = await fetch("/api/settings/openai", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSettings),
      });

      if (!response.ok) throw new Error("Erreur lors de la mise à jour des paramètres");

      const updatedSettings = await response.json();
      setSettings(updatedSettings);
      toast.success("Paramètres OpenAI mis à jour avec succès");
    } catch (error) {
      console.error("Erreur lors de la mise à jour des paramètres OpenAI:", error);
      toast.error("Erreur lors de la mise à jour des paramètres OpenAI");
    }
  };

  return {
    settings,
    loading,
    updateSettings,
  };
}; 