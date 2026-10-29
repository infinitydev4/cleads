import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer"
import { format } from "date-fns"
import { fr } from "date-fns/locale"

// Définir l'URL de base pour les assets
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
    padding: 40,
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 40,
  },
  logo: {
    width: 80,
    height: 80,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#666666",
  },
  dates: {
    flexDirection: "column",
    gap: 8,
  },
  dateBox: {
    backgroundColor: "#F5F5F5",
    padding: 12,
    borderRadius: 8,
  },
  dateLabel: {
    fontSize: 12,
    color: "#666666",
    marginBottom: 4,
  },
  dateValue: {
    fontSize: 14,
    fontFamily: "Helvetica",
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    color: "#666666",
    marginBottom: 8,
  },
  infoBox: {
    backgroundColor: "#F5F5F5",
    padding: 16,
    borderRadius: 8,
  },
  companyName: {
    fontSize: 16,
    fontFamily: "Helvetica",
    marginBottom: 8,
  },
  text: {
    fontSize: 12,
    marginBottom: 4,
    color: "#333333",
  },
  table: {
    flexDirection: "column",
    marginTop: 20,
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
    paddingBottom: 8,
    marginBottom: 8,
  },
  tableHeaderCell: {
    fontSize: 12,
    color: "#666666",
    fontFamily: "Helvetica",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
  },
  tableCell: {
    fontSize: 12,
  },
  col1: { width: "40%" },
  col2: { width: "20%", textAlign: "right" },
  col3: { width: "20%", textAlign: "right" },
  col4: { width: "20%", textAlign: "right" },
  totals: {
    width: "300px",
    alignSelf: "flex-end",
    marginTop: 20,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#F5F5F5",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  totalRowHighlight: {
    backgroundColor: "#BFFF00",
  },
  totalLabel: {
    fontSize: 12,
  },
  totalValue: {
    fontSize: 12,
    fontFamily: "Helvetica",
  },
  footer: {
    position: "absolute",
    bottom: 40,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: "#EEEEEE",
    paddingTop: 20,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 10,
    color: "#666666",
  },
})

interface InvoicePDFProps {
  invoice: any
  company: any
}

export function InvoicePDF({ invoice, company }: InvoicePDFProps) {
  return (
    <Page size="A4" style={styles.page}>
      {/* En-tête */}
      <View style={styles.header}>
        <View>
          <Image
            src={`${BASE_URL}/logo.png`}
            style={styles.logo}
          />
          <Text style={styles.title}>FACTURE</Text>
          <Text style={styles.subtitle}>{invoice.number}</Text>
        </View>
        <View style={styles.dates}>
          <View style={styles.dateBox}>
            <Text style={styles.dateLabel}>Date d'émission</Text>
            <Text style={styles.dateValue}>
              {format(new Date(invoice.date), "dd MMMM yyyy", { locale: fr })}
            </Text>
          </View>
          <View style={styles.dateBox}>
            <Text style={styles.dateLabel}>Date d'échéance</Text>
            <Text style={styles.dateValue}>
              {format(new Date(invoice.dueDate), "dd MMMM yyyy", { locale: fr })}
            </Text>
          </View>
        </View>
      </View>
      
      {/* Informations entreprise et client */}
      <View style={{ flexDirection: "row", gap: 40, marginBottom: 40 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>DE</Text>
          <View style={styles.infoBox}>
            <Text style={styles.companyName}>{company.name}</Text>
            <Text style={styles.text}>{company.address}</Text>
            <Text style={styles.text}>{company.city}</Text>
            <Text style={styles.text}>{company.email}</Text>
            <Text style={styles.text}>
              <Text>SIRET:</Text>
              <Text> </Text>
              <Text>{company.siret}</Text>
            </Text>
            <Text style={styles.text}>
              <Text>TVA:</Text>
              <Text> </Text>
              <Text>{company.tva}</Text>
            </Text>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>POUR</Text>
          <View style={styles.infoBox}>
            <Text style={styles.companyName}>{invoice.clientName}</Text>
            <Text style={styles.text}>{invoice.clientAddress}</Text>
            <Text style={styles.text}>{invoice.clientCity}</Text>
            <Text style={styles.text}>{invoice.clientEmail}</Text>
            <Text style={styles.text}>{invoice.clientPhone}</Text>
          </View>
        </View>
      </View>

      {/* Tableau des prestations */}
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, styles.col1]}>Description</Text>
          <Text style={[styles.tableHeaderCell, styles.col2]}>Qté</Text>
          <Text style={[styles.tableHeaderCell, styles.col3]}>Prix unitaire</Text>
          <Text style={[styles.tableHeaderCell, styles.col4]}>Total</Text>
        </View>
        {invoice.items.map((item: any) => (
          <View key={item.id} style={styles.tableRow}>
            <View style={styles.col1}>
              <Text style={styles.tableCell}>{item.description}</Text>
              {item.details && (
                <Text style={[styles.tableCell, { fontSize: 10, color: "#666666" }]}>
                  {item.details}
                </Text>
              )}
            </View>
            <Text style={[styles.tableCell, styles.col2]}>{item.quantity}</Text>
            <Text style={[styles.tableCell, styles.col3]}>
              <Text>{item.price.toLocaleString()}</Text>
              <Text>€</Text>
            </Text>
            <Text style={[styles.tableCell, styles.col4]}>
              <Text>{(item.quantity * item.price).toLocaleString()}</Text>
              <Text>€</Text>
            </Text>
          </View>
        ))}
      </View>

      {/* Totaux */}
      <View style={styles.totals}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Sous-total</Text>
          <Text style={styles.totalValue}>
            <Text>{invoice.subtotal.toLocaleString()}</Text>
            <Text>€</Text>
          </Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>
            {invoice.taxType} ({invoice.taxValue}%)
          </Text>
          <Text style={styles.totalValue}>
            <Text>{invoice.tax.toLocaleString()}</Text>
            <Text>€</Text>
          </Text>
        </View>
        <View style={[styles.totalRow, styles.totalRowHighlight]}>
          <Text style={[styles.totalLabel, { fontFamily: "Helvetica" }]}>Total TTC</Text>
          <Text style={styles.totalValue}>
            <Text>{invoice.total.toLocaleString()}</Text>
            <Text>€</Text>
          </Text>
        </View>
      </View>

      {/* Conditions et notes */}
      <View style={styles.section}>
        <View style={styles.infoBox}>
          <Text style={[styles.text, { fontFamily: "Helvetica" }]}>Conditions de paiement</Text>
          <Text style={styles.text}>
            Cette facture est payable sous 30 jours. Le paiement est dû au plus tard le {format(new Date(invoice.dueDate), "dd/MM/yyyy")}.
          </Text>
        </View>
      </View>

      {/* RIB */}
      {company.rib && (
        <View style={styles.section}>
          <View style={styles.infoBox}>
            <Text style={[styles.text, { fontFamily: "Helvetica" }]}>Coordonnées bancaires</Text>
            <Text style={styles.text}>
              <Text>Banque:</Text>
              <Text> </Text>
              <Text>{company.rib.bank}</Text>
            </Text>
            <Text style={styles.text}>
              <Text>IBAN:</Text>
              <Text> </Text>
              <Text>{company.rib.iban}</Text>
            </Text>
            <Text style={styles.text}>
              <Text>BIC:</Text>
              <Text> </Text>
              <Text>{company.rib.bic}</Text>
            </Text>
          </View>
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <View>
          <Text style={styles.footerText}>{company.name}</Text>
          <Text style={styles.footerText}>
            <Text>SIRET:</Text>
            <Text> </Text>
            <Text>{company.siret}</Text>
          </Text>
          <Text style={styles.footerText}>
            <Text>TVA:</Text>
            <Text> </Text>
            <Text>{company.tva}</Text>
          </Text>
        </View>
        <View style={{ textAlign: "right" }}>
          <Text style={styles.footerText}>{company.email}</Text>
          <Text style={styles.footerText}>{company.website}</Text>
        </View>
      </View>
    </Page>
  )
} 