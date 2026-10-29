"use client"

import { useEffect, useRef } from 'react'
import Image from 'next/image'

// Styles pour masquer les bannières de cookies
const cookieBannerStyles = `
  /* Styles pour masquer les bannières de cookies courantes */
  .cc-window, .cookie-banner, .cookie-consent, .cookie-notice, 
  .gdpr, .gdpr-banner, .js-cookie-consent, #cookie-law-info-bar,
  #cookie-notice, #cookiebanner, #cookieConsent, #cookiePolicy,
  [class*="cookie-banner"], [class*="cookie-consent"], [class*="cookie_banner"],
  [class*="cookie_consent"], [id*="cookie-banner"], [id*="cookie-consent"],
  [id*="cookie_banner"], [id*="cookie_consent"], [id*="gdpr"],
  div[role="dialog"] {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    height: 0 !important;
    max-height: 0 !important;
    overflow: hidden !important;
    z-index: -9999 !important;
    pointer-events: none !important;
  }
  
  /* Enlever le padding ajouté par certaines bannières */
  body:has(.cc-window), body:has(.cookie-banner), 
  body[style*="padding-top"], body[style*="margin-top"] {
    padding-top: 0 !important;
    margin-top: 0 !important;
  }
`;

type ProjectCardProps = {
  title: string;
  description: string;
  category: string;
  url: string;
  domain: string;
  isLive: boolean;
}

export function ProjectCard({ title, description, category, url, domain, isLive }: ProjectCardProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Fonction pour injecter les styles CSS pour masquer les bannières de cookies
    const injectCookieBlocker = () => {
      if (!iframeRef.current) return;
      
      try {
        const iframe = iframeRef.current;
        const iframeDocument = iframe.contentDocument || iframe.contentWindow?.document;
        
        if (iframeDocument) {
          // Vérifier si le style a déjà été injecté
          if (!iframeDocument.getElementById('cookie-hider-style')) {
            const style = iframeDocument.createElement('style');
            style.id = 'cookie-hider-style';
            style.textContent = cookieBannerStyles;
            iframeDocument.head.appendChild(style);
          }
        }
      } catch (error) {
        // En cas d'erreur de sécurité cross-origin, on ne fait rien
        console.log("Impossible d'accéder au contenu de l'iframe");
      }
    };

    // Essayer d'injecter le style à plusieurs moments pour s'assurer qu'il est appliqué
    const iframe = iframeRef.current;
    if (iframe) {
      iframe.addEventListener('load', injectCookieBlocker);
      
      // Essayer d'injecter périodiquement au cas où le contenu de l'iframe change
      const interval = setInterval(injectCookieBlocker, 1000);
      
      return () => {
        iframe.removeEventListener('load', injectCookieBlocker);
        clearInterval(interval);
      };
    }
  }, []);

  return (
    <div className="group relative overflow-hidden border border-gray-800 hover:border-[#BFFF00] transition-colors bg-black/50 rounded-xl h-[650px]">
      {/* Mockup de navigateur */}
      <div className="relative w-full h-full flex flex-col">
        {/* Barre d'adresse du navigateur */}
        <div className="h-10 bg-gray-900 rounded-t-xl flex items-center px-3 gap-2 border-b border-gray-800 flex-shrink-0">
          <div className="flex space-x-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>
          <div className="flex-1 mx-2">
            <div className="bg-gray-800 rounded-md h-6 flex items-center px-3 text-xs text-gray-400 truncate">
              <span className="hidden sm:inline">https://</span>{domain}
            </div>
          </div>
          <div className="flex space-x-1">
            <div className="w-6 h-6 flex items-center justify-center text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </div>
            <div className="w-6 h-6 flex items-center justify-center text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
              </svg>
            </div>
          </div>
        </div>
        
        {/* Contenu du navigateur */}
        <div className="flex-grow bg-white overflow-hidden">
          <iframe 
            ref={iframeRef}
            src={url} 
            title={`${title} - ${category}`}
            className="w-full h-full"
            loading="lazy"
            style={{ border: 'none' }}
          ></iframe>
        </div>
        
        {/* Badge */}
        <div className="absolute top-12 right-2 bg-[#BFFF00] text-black text-xs font-medium px-2 py-1 rounded-md z-10">
          {isLive ? 'Site live' : 'Demo'}
        </div>
      </div>
      
      {/* Informations du projet */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black to-transparent">
        <span className="text-[#BFFF00] text-sm block mb-1">{category}</span>
        <h3 className="text-xl font-bold mb-2 group-hover:text-[#BFFF00]">{title}</h3>
        <p className="text-gray-300 text-sm">{description}</p>
      </div>
    </div>
  )
} 