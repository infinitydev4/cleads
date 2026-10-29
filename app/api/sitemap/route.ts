import { NextResponse } from 'next/server';

// Dans une application réelle, vous importeriez vos modèles de données ou API
// pour récupérer dynamiquement les URLs des articles de blog, projets, etc.

interface UrlEntry {
  url: string;
  changefreq: string;
  priority: string;
  lastmod?: string;
}

export async function GET() {
  // Date actuelle pour l'attribut lastmod
  const date = new Date().toISOString().split('T')[0];
  
  // URLs statiques
  const staticUrls: UrlEntry[] = [
    { url: '/', changefreq: 'weekly', priority: '1.0' },
    { url: '/tarifs', changefreq: 'monthly', priority: '0.8' },
    { url: '/about', changefreq: 'monthly', priority: '0.7' },
    { url: '/realisations', changefreq: 'monthly', priority: '0.8' },
    { url: '/contact', changefreq: 'monthly', priority: '0.9' },
    { url: '/plan-du-site', changefreq: 'monthly', priority: '0.5' },
    // Le blog n'est pas encore prêt à être indexé
    // { url: '/blog', changefreq: 'weekly', priority: '0.7' },
    
    // Services
    { url: '/services/saas', changefreq: 'monthly', priority: '0.8' },
    { url: '/services/ecommerce', changefreq: 'monthly', priority: '0.8' },
    { url: '/services/b2b', changefreq: 'monthly', priority: '0.8' },
    { url: '/services/web', changefreq: 'monthly', priority: '0.8' },
    { url: '/services/seo', changefreq: 'monthly', priority: '0.8' },
    { url: '/services/performance', changefreq: 'monthly', priority: '0.8' },
    
    // Pages légales
    { url: '/mentions-legales', changefreq: 'yearly', priority: '0.3' },
    { url: '/politique-de-confidentialite', changefreq: 'yearly', priority: '0.3' },
    { url: '/cgv', changefreq: 'yearly', priority: '0.3' },
    { url: '/cookies', changefreq: 'yearly', priority: '0.3' },
  ];

  /* 
  // Cette partie sera décommentée quand le blog sera prêt
  // Pour une implémentation réelle, vous récupéreriez les articles de blog dynamiquement
  // Exemple fictif :
  const blogPosts = [
    { slug: 'article-exemple-1', date: '2023-05-10' },
    { slug: 'article-exemple-2', date: '2023-06-15' },
    // Récupérer dynamiquement depuis la base de données
  ];

  // Générer les URLs des articles de blog
  const blogUrls: UrlEntry[] = blogPosts.map(post => ({
    url: `/blog/${post.slug}`,
    changefreq: 'monthly',
    priority: '0.6',
    lastmod: post.date
  }));

  // Combiner toutes les URLs
  const allUrls = [...staticUrls, ...blogUrls];
  */

  // Utiliser seulement les URLs statiques pour le moment
  const allUrls = staticUrls;

  // Construire le XML
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(({ url, changefreq, priority, lastmod = date }) => `
  <url>
    <loc>https://cleads.fr${url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`).join('')}
</urlset>`;

  // Renvoyer le sitemap XML avec les en-têtes appropriés
  return new NextResponse(sitemap, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600'
    }
  });
} 