import { db } from '@/lib/database';

export type Product = {
  id: string;
  slug: string;
  name: string;
  price: number;
  description: string;
  inventory: number;
};

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  price: number | string;
  description: string;
  inventory: number | string;
};

function productFromRow(row: ProductRow): Product {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    price: Number(row.price),
    description: row.description,
    inventory: Number(row.inventory),
  };
}

const selectProducts = `
  select
    p.id,
    p.slug,
    p.name,
    p.price_cents as price,
    p.description,
    greatest(coalesce(i.available, 0) - coalesce(i.reserved, 0), 0) as inventory
  from products p
  left join inventory i on i.product_id = p.id
  where p.active = true
`;

export async function getProducts(): Promise<Product[]> {
  const rows = await db().query(`${selectProducts} order by p.created_at desc`) as ProductRow[];
  return rows.map(productFromRow);
}

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  const rows = await db().query(`${selectProducts} and p.slug = $1 limit 1`, [slug]) as ProductRow[];
  return rows[0] ? productFromRow(rows[0]) : undefined;
}

export const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
