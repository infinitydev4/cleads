import * as React from "react"
import {
  Html,
  Body,
  Head,
  Heading,
  Hr,
  Container,
  Preview,
  Section,
  Text,
} from "react-email"

interface EmailTemplateProps {
  documentType: "INVOICE" | "QUOTE"
  documentNumber: string
  companyName: string
}

export const EmailTemplate = ({
  documentType,
  documentNumber,
  companyName,
}: EmailTemplateProps) => {
  const previewText = `${documentType === "INVOICE" ? "Facture" : "Devis"} ${documentNumber}`

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>
            {documentType === "INVOICE" ? "Facture" : "Devis"} {documentNumber}
          </Heading>
          
          <Text style={text}>Bonjour,</Text>
          
          <Text style={text}>
            Vous trouverez ci-joint votre {documentType === "INVOICE" ? "facture" : "devis"} {documentNumber}.
          </Text>
          
          <Section style={section}>
            <Text style={text}>Cordialement,</Text>
            <Text style={signature}>{companyName}</Text>
          </Section>
          
          <Hr style={hr} />
          
          <Text style={footer}>
            Cet email a été envoyé automatiquement, merci de ne pas y répondre.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: "#ffffff",
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
}

const container = {
  margin: "0 auto",
  padding: "20px 0 48px",
  maxWidth: "580px",
}

const h1 = {
  color: "#333",
  fontSize: "24px",
  fontWeight: "bold",
  margin: "30px 0",
  padding: "0",
}

const section = {
  margin: "30px 0",
}

const text = {
  color: "#666",
  fontSize: "16px",
  lineHeight: "24px",
  margin: "16px 0",
}

const signature = {
  color: "#333",
  fontSize: "16px",
  fontWeight: "bold",
  margin: "16px 0",
}

const hr = {
  borderColor: "#eee",
  margin: "30px 0",
}

const footer = {
  color: "#999",
  fontSize: "12px",
  margin: "30px 0",
} 