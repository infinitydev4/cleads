import { Toaster as SonnerToaster } from "sonner"
import { CheckCircle2, XCircle, AlertCircle, Info } from "lucide-react"

export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      richColors
      expand={true}
      closeButton
      toastOptions={{
        duration: 5000,
        style: {
          background: "rgba(0, 0, 0, 0.9)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(191, 255, 0, 0.1)",
          borderRadius: "12px",
          padding: "16px",
          color: "white",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
        },
        className: "font-sans",
        classNames: {
          title: "text-lg font-semibold",
          description: "text-gray-300",
          actionButton: "bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90",
          cancelButton: "bg-gray-800 text-white hover:bg-gray-700",
          closeButton: "text-gray-400 hover:text-white",
          success: "border-[#BFFF00]/20",
          error: "border-red-500/20",
          warning: "border-yellow-500/20",
          info: "border-blue-500/20",
        },
      }}
      icons={{
        success: <CheckCircle2 className="h-5 w-5 text-[#BFFF00]" />,
        error: <XCircle className="h-5 w-5 text-red-500" />,
        warning: <AlertCircle className="h-5 w-5 text-yellow-500" />,
        info: <Info className="h-5 w-5 text-blue-500" />,
      }}
    />
  )
} 