import Link from 'next/link';
import { getProducts, money } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

export default async function Products() {
  const products = await getProducts();

  return <>
    <p className="eyebrow">Collection</p>
    <h1>Permanent pieces, limited quantities.</h1>
    <section className="grid">
      {products.map((product) => <article className="card" key={product.slug}>
        <div className="image" />
        <h2>{product.name}</h2>
        <p className="price">{money(product.price)}</p>
        <Link href={`/products/${product.slug}`}>View piece →</Link>
      </article>)}
    </section>
  </>;
}
