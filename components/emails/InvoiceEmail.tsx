import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "react-email"
import { format } from "date-fns"
import { fr } from "date-fns/locale"

interface InvoiceEmailProps {
  invoice: any
  company: any
  previewUrl?: string
}

export const InvoiceEmail = ({
  invoice,
  company,
  previewUrl = "https://cleads.fr",
}: InvoiceEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>Votre facture {invoice.number} est disponible</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logo}>
            <Img src={`${previewUrl}/logo.svg`} width="40" height="40" alt="Logo" />
          </Section>
          <Section style={content}>
            <Text style={paragraph}>
              Bonjour {invoice.clientName},
            </Text>
            <Text style={paragraph}>
              Vous trouverez ci-joint votre facture n°{invoice.number} d'un montant de{" "}
              <strong>{invoice.total.toLocaleString()}€ TTC</strong>.
            </Text>
            <Text style={paragraph}>
              Cette facture est payable jusqu'au{" "}
              {format(new Date(invoice.dueDate), "dd MMMM yyyy", { locale: fr })}.
            </Text>

            {company.rib && (
              <>
                <Text style={paragraph}>
                  Vous pouvez effectuer le paiement par virement bancaire aux coordonnées suivantes :
                </Text>
                <Text style={bankDetails}>
                  IBAN : {company.rib.iban}
                  <br />
                  BIC : {company.rib.bic}
                </Text>
              </>
            )}

            <Button style={button} href={previewUrl}>
              Voir la facture
            </Button>

            <Hr style={hr} />

            <Text style={footer}>
              {company.name}
              <br />
              {company.address}
              <br />
              {company.city}
              <br />
              SIRET : {company.siret}
              <br />
              TVA : {company.tva}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export default InvoiceEmail

const main = {
  backgroundColor: "#ffffff",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
}

const container = {
  margin: "0 auto",
  padding: "20px 0 48px",
  maxWidth: "560px",
}

const logo = {
  padding: "20px 0",
}

const content = {
  padding: "0 24px",
}

const paragraph = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#333",
}

const bankDetails = {
  padding: "24px",
  backgroundColor: "#f9f9f9",
  borderRadius: "12px",
  marginBottom: "24px",
  fontSize: "16px",
  lineHeight: "26px",
  color: "#333",
}

const button = {
  backgroundColor: "#BFFF00",
  borderRadius: "8px",
  color: "#000",
  fontSize: "16px",
  fontWeight: "bold",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  padding: "12px",
  marginTop: "24px",
  marginBottom: "24px",
}

const hr = {
  borderColor: "#e6ebf1",
  margin: "20px 0",
}

const footer = {
  color: "#666",
  fontSize: "14px",
  lineHeight: "24px",
} 