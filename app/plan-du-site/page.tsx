import Link from 'next/link';

export const metadata = {
  title: 'Plan du site - Cleads',
  description: 'Découvrez toutes les pages de Cleads, agence spécialisée en création de landing pages et sites web pour maximiser vos conversions.',
};

export default function SitemapPage() {
  return (
    <main className="bg-black text-white">
      <section className="py-24 md:py-32 bg-gradient-to-b from-black to-gray-950">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-300">
              Plan du site
            </h1>
            <p className="text-gray-400 text-lg mb-16">
              Retrouvez facilement toutes les pages de notre site web.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
              {/* Pages principales */}
              <div>
                <h2 className="text-xl font-bold mb-4 text-[#BFFF00]">Pages principales</h2>
                <ul className="space-y-3">
                  <li>
                    <Link href="/" className="text-gray-300 hover:text-white transition">
                      Accueil
                    </Link>
                  </li>
                  <li>
                    <Link href="/tarifs" className="text-gray-300 hover:text-white transition">
                      Tarifs
                    </Link>
                  </li>
                  <li>
                    <Link href="/about" className="text-gray-300 hover:text-white transition">
                      À propos
                    </Link>
                  </li>
                  <li>
                    <Link href="/realisations" className="text-gray-300 hover:text-white transition">
                      Réalisations
                    </Link>
                  </li>
                  {/* Blog - Sera activé lorsque prêt
                  <li>
                    <Link href="/blog" className="text-gray-300 hover:text-white transition">
                      Blog
                    </Link>
                  </li>
                  */}
                  <li>
                    <Link href="/contact" className="text-gray-300 hover:text-white transition">
                      Contact
                    </Link>
                  </li>
                </ul>
              </div>

              {/* Services */}
              <div>
                <h2 className="text-xl font-bold mb-4 text-[#BFFF00]">Nos services</h2>
                <ul className="space-y-3">
                  <li>
                    <Link href="/services/saas" className="text-gray-300 hover:text-white transition">
                      Landing Page SaaS
                    </Link>
                  </li>
                  <li>
                    <Link href="/services/ecommerce" className="text-gray-300 hover:text-white transition">
                      E-commerce
                    </Link>
                  </li>
                  <li>
                    <Link href="/services/b2b" className="text-gray-300 hover:text-white transition">
                      B2B
                    </Link>
                  </li>
                  <li>
                    <Link href="/services/web" className="text-gray-300 hover:text-white transition">
                      Développement Web
                    </Link>
                  </li>
                  <li>
                    <Link href="/services/seo" className="text-gray-300 hover:text-white transition">
                      SEO
                    </Link>
                  </li>
                  <li>
                    <Link href="/services/performance" className="text-gray-300 hover:text-white transition">
                      Performance
                    </Link>
                  </li>
                </ul>
              </div>

              {/* Pages légales */}
              <div>
                <h2 className="text-xl font-bold mb-4 text-[#BFFF00]">Informations légales</h2>
                <ul className="space-y-3">
                  <li>
                    <Link href="/mentions-legales" className="text-gray-300 hover:text-white transition">
                      Mentions légales
                    </Link>
                  </li>
                  <li>
                    <Link href="/politique-de-confidentialite" className="text-gray-300 hover:text-white transition">
                      Politique de confidentialité
                    </Link>
                  </li>
                  <li>
                    <Link href="/cgv" className="text-gray-300 hover:text-white transition">
                      Conditions générales de vente
                    </Link>
                  </li>
                  <li>
                    <Link href="/cookies" className="text-gray-300 hover:text-white transition">
                      Politique de cookies
                    </Link>
                  </li>
                  <li>
                    <Link href="/plan-du-site" className="text-gray-300 hover:text-white transition">
                      Plan du site
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
} 