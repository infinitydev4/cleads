import { Document } from "@react-pdf/renderer"
import { InvoicePDF } from "./InvoicePDF"
import { QuotePDF } from "./QuotePDF"
import { DocumentType } from "@prisma/client"

interface PDFDocumentProps {
  type: DocumentType
  data: any
  company: any
}

export function PDFDocument({ type, data, company }: PDFDocumentProps) {
  return (
    <Document>
      {type === DocumentType.INVOICE ? (
        <InvoicePDF invoice={data} company={company} />
      ) : (
        <QuotePDF quote={data} company={company} />
      )}
    </Document>
  )
} 