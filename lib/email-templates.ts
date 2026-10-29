import { format } from "date-fns"
import { fr } from "date-fns/locale"

interface Company {
  name: string
  address: string
  city: string
  email: string
  website?: string
  siret: string
  tva: string
  rib?: {
    bank: string
    iban: string
    bic: string
  }
}

interface Invoice {
  number: string
  date: Date
  dueDate: Date
  clientName: string
  total: number
}

export function generateInvoiceEmailHtml(invoice: Invoice, company: Company, previewUrl: string = "https://cleads.fr") {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Votre facture ${invoice.number}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.5;
            color: #333;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .logo {
            margin-bottom: 24px;
          }
          .content {
            background-color: #ffffff;
            padding: 24px;
            border-radius: 8px;
          }
          .bank-details {
            background-color: #f9f9f9;
            padding: 16px;
            border-radius: 8px;
            margin: 24px 0;
          }
          .button {
            display: inline-block;
            background-color: #BFFF00;
            color: #000000;
            padding: 12px 24px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: bold;
            margin: 24px 0;
          }
          .footer {
            margin-top: 24px;
            padding-top: 24px;
            border-top: 1px solid #eaeaea;
            color: #666;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">
            <img src="${previewUrl}/logo.svg" alt="Logo" width="40" height="40">
          </div>
          
          <div class="content">
            <p>Bonjour ${invoice.clientName},</p>
            
            <p>Vous trouverez ci-joint votre facture n°${invoice.number} d'un montant de 
              <strong>${invoice.total.toLocaleString()}€ TTC</strong>.
            </p>
            
            <p>Cette facture est payable jusqu'au 
              ${format(new Date(invoice.dueDate), "dd MMMM yyyy", { locale: fr })}.
            </p>
            
            ${company.rib ? `
              <div class="bank-details">
                <p><strong>Coordonnées bancaires pour le virement :</strong></p>
                <p>
                  IBAN : ${company.rib.iban}<br>
                  BIC : ${company.rib.bic}
                </p>
              </div>
            ` : ''}
            
            <a href="${previewUrl}" class="button">Voir la facture</a>
            
            <div class="footer">
              <p>
                ${company.name}<br>
                ${company.address}<br>
                ${company.city}<br>
                SIRET : ${company.siret}<br>
                TVA : ${company.tva}
              </p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `
} 