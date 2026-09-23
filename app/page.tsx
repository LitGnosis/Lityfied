import Link from 'next/link';
import { getProducts, money } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const products = await getProducts();

  return <>
    <p className="eyebrow">The new collection</p>
    <h1>Considered objects for an exceptional everyday.</h1>
    <Link className="button" href="/products">Shop the collection</Link>
    <section className="grid">
      {products.map((product) => <article className="card" key={product.slug}>
        <div className="image" />
        <h2>{product.name}</h2>
        <p>{product.description}</p>
        <p className="price">{money(product.price)}</p>
        <Link href={`/products/${product.slug}`}>View piece →</Link>
      </article>)}
    </section>
  </>;
}
