import * as React from "react"
import {
  Html,
  Body,
  Container,
  Text,
  Link,
  Preview,
  Section,
  Row,
  Column,
  Heading,
  Img,
} from "react-email"

interface AppointmentConfirmationProps {
  clientName: string
  clientEmail: string
  date: string
  time: string
  meetLink: string
  generatedPassword?: string
  previewUrl?: string
  calendarLinks: {
    google: string
    outlook: string
  }
}

export const AppointmentConfirmation = ({
  clientName,
  clientEmail,
  date,
  time,
  meetLink,
  generatedPassword,
  calendarLinks,
}: AppointmentConfirmationProps) => {
  return (
    <Html>
      <Preview>Confirmation de votre rendez-vous avec Cleads</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logo}>
            <Img
              src="https://cleads.fr/logo.png"
              width="120"
              height="120"
              alt="Cleads"
              style={{
                margin: "0 auto",
                display: "block",
              }}
            />
          </Section>
          
          <Heading style={h1}>Votre rendez-vous est confirmé !</Heading>
          
          <Text style={text}>
            Bonjour {clientName},
          </Text>
          
          <Text style={text}>
            Votre rendez-vous avec Cleads est confirmé pour le {date} à {time}.
          </Text>

          <Section style={buttonContainer}>
            <Link style={button} href={meetLink}>
              Rejoindre la réunion
            </Link>
          </Section>

          <Section style={calendarSection}>
            <Text style={text}>
              Ajoutez ce rendez-vous à votre calendrier :
            </Text>
            <Row>
              <Column>
                <Link href={calendarLinks.google} style={calendarButton}>
                  <Img
                    src="https://cleads.fr/gagenda.webp"
                    width="20"
                    height="20"
                    alt="Google Calendar"
                    style={calendarIcon}
                  />
                  Google Calendar
                </Link>
              </Column>
              <Column>
                <Link href={calendarLinks.outlook} style={calendarButton}>
                  <Img
                    src="https://cleads.fr/outlook.png"
                    width="20"
                    height="20"
                    alt="Outlook"
                    style={calendarIcon}
                  />
                  Outlook
                </Link>
              </Column>
            </Row>
          </Section>

          {generatedPassword && (
            <Section style={passwordSection}>
              <Text style={passwordText}>
                Voici vos identifiants temporaires pour accéder à votre espace client :
              </Text>
              <Text style={passwordDetails}>
                Email : {clientEmail}
                <br />
                Mot de passe : {generatedPassword}
              </Text>
            </Section>
          )}

          <Text style={text}>
            Nous avons hâte de vous rencontrer et de discuter de votre projet !
          </Text>

          <Section style={footer}>
            <Text style={footerText}>
              Si vous avez besoin de modifier ou d'annuler votre rendez-vous, 
              veuillez nous contacter directement par email à contact@cleads.fr
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: "#ffffff",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
}

const container = {
  margin: "0 auto",
  padding: "20px 0 48px",
  maxWidth: "580px",
}

const logo = {
  margin: "0 auto",
  marginBottom: "24px",
}

const h1 = {
  color: "#1a1a1a",
  fontSize: "24px",
  fontWeight: "600",
  lineHeight: "1.3",
  margin: "0 0 24px",
}

const text = {
  color: "#444",
  fontSize: "16px",
  lineHeight: "1.5",
  margin: "0 0 16px",
}

const buttonContainer = {
  margin: "24px 0",
}

const button = {
  backgroundColor: "#000000",
  borderRadius: "3px",
  color: "#fff",
  fontSize: "16px",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  padding: "12px",
}

const calendarSection = {
  margin: "24px 0",
}

const calendarButton = {
  backgroundColor: "#f5f5f5",
  borderRadius: "3px",
  color: "#000",
  fontSize: "14px",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "8px 12px",
  margin: "0 8px",
  border: "1px solid #e0e0e0",
}

const calendarIcon = {
  marginRight: "8px",
  verticalAlign: "middle",
}

const passwordSection = {
  margin: "24px 0",
  padding: "24px",
  backgroundColor: "#f9f9f9",
  borderRadius: "4px",
}

const passwordText = {
  ...text,
  margin: "0 0 12px",
}

const passwordDetails = {
  ...text,
  backgroundColor: "#ffffff",
  padding: "12px",
  borderRadius: "4px",
  fontFamily: "monospace",
}

const footer = {
  marginTop: "32px",
  textAlign: "center" as const,
}

const footerText = {
  ...text,
  fontSize: "14px",
  color: "#666",
} 