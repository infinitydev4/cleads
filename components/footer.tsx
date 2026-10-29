import Link from "next/link"
import Image from "next/image"
import { Phone, Mail, MapPin, Facebook, Twitter, Instagram, Linkedin, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

const footerLinks = {
  services: [
    { name: "Landing Page SaaS", href: "/services/saas" },
    { name: "E-commerce", href: "/services/ecommerce" },
    { name: "B2B", href: "/services/b2b" },
    { name: "Développement Web", href: "/services/web" },
    { name: "SEO", href: "/services/seo" },
    { name: "Performance", href: "/services/performance" }
  ],
  company: [
    { name: "À propos", href: "/about" },
    { name: "Réalisations", href: "/realisations" },
    { name: "Blog", href: "/blog" },
    { name: "Tarifs", href: "/tarifs" },
    { name: "Contact", href: "/contact" }
  ],
  legal: [
    { name: "Mentions légales", href: "/mentions-legales" },
    { name: "Politique de confidentialité", href: "/politique-de-confidentialite" },
    { name: "CGV", href: "/cgv" },
    { name: "Cookies", href: "/cookies" }
  ]
}

const socialLinks = [
  { name: "Facebook", icon: Facebook, href: "https://facebook.com" },
  { name: "Twitter", icon: Twitter, href: "https://twitter.com" },
  { name: "Instagram", icon: Instagram, href: "https://instagram.com" },
  { name: "LinkedIn", icon: Linkedin, href: "https://linkedin.com" }
]

export function Footer() {
  return (
    <footer className="bg-black pt-16 md:pt-24 border-t border-gray-800">
      {/* Newsletter Section */}
      <div className="container px-4 mb-16">
        <div className="relative overflow-hidden rounded-2xl bg-black p-6 md:p-8 border border-gray-800">
          {/* Effet de grain */}
          <div 
            className="absolute inset-0 opacity-20" 
            style={{ backgroundImage: 'url("/noise.png")' }}
          />
          
          <div className="relative grid gap-8 md:grid-cols-2 items-center">
            <div>
              <h3 className="text-2xl md:text-3xl font-bold mb-2">
                Restez informé
              </h3>
              <p className="text-gray-400">
                Recevez nos meilleurs conseils pour optimiser vos landing pages et booster vos conversions.
              </p>
            </div>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Votre email"
                className="flex-1 bg-gray-900 rounded-lg px-4 py-2 border border-gray-800 focus:border-[#BFFF00] focus:outline-none text-white"
              />
              <Button className="group"
              variant="3d"
              >
                <span className="flex items-center gap-2">
                  S'inscrire
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container px-4">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-4 pb-12 md:pb-16 border-b border-gray-800">
          {/* Brand Column */}
          <div>
            <Link href="/" className="inline-block mb-6">
              <Image
                src="/logo-white.svg"
                alt="Cleads Logo"
                width={120}
                height={40}
                className="h-8 w-auto"
              />
            </Link>
            <p className="text-gray-400 mb-6">
              Nous créons des landing pages qui convertissent vos visiteurs en clients fidèles.
            </p>
            <div className="space-y-3">
              <a href="tel:+33767036848" className="flex items-center gap-2 text-gray-400 hover:text-white">
                <Phone className="h-4 w-4" />
                <span>+33 7 67 03 68 48</span>
              </a>
              <a href="mailto:contact@cleads.fr" className="flex items-center gap-2 text-gray-400 hover:text-white">
                <Mail className="h-4 w-4" />
                <span>contact@cleads.fr</span>
              </a>
              <div className="flex items-center gap-2 text-gray-400">
                <MapPin className="h-4 w-4 flex-shrink-0" />
                <span>39 Boulevard Albert Einstein, 44300 Nantes</span>
              </div>
            </div>
          </div>

          {/* Services Links */}
          <div>
            <h4 className="font-bold mb-4">Services</h4>
            <ul className="space-y-2">
              {footerLinks.services.map((link) => (
                <li key={link.name}>
                  <Link 
                    href={link.href}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company Links */}
          <div>
            <h4 className="font-bold mb-4">Entreprise</h4>
            <ul className="space-y-2">
              {footerLinks.company.map((link) => (
                <li key={link.name}>
                  <Link 
                    href={link.href}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="font-bold mb-4">Légal</h4>
            <ul className="space-y-2">
              {footerLinks.legal.map((link) => (
                <li key={link.name}>
                  <Link 
                    href={link.href}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="py-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-gray-400 text-sm">
            © {new Date().getFullYear()} Cleads. Tous droits réservés.
          </p>
          <div className="flex items-center gap-4">
            {socialLinks.map((social) => (
              <a
                key={social.name}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors"
                aria-label={`Suivez-nous sur ${social.name}`}
              >
                <social.icon className="h-5 w-5" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}

