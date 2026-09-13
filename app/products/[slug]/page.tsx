import { notFound } from 'next/navigation';
import Link from 'next/link';
import { money, products } from '@/lib/catalog';

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = products.find((item) => item.slug === slug);
  if (!product) notFound();

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    offers: {
      '@type': 'Offer',
      price: product.price / 100,
      priceCurrency: 'USD',
      availability: product.inventory ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  };

  return <article>
    <p className="eyebrow">{product.inventory} available</p>
    <div className="grid"><div className="image" /><div>
      <h1>{product.name}</h1><p>{product.description}</p><p className="price">{money(product.price)}</p>
      <Link className="button" href={`/checkout?product=${product.slug}`}>Secure checkout</Link>
    </div></div>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
  </article>;
}
