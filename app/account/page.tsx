import { notFound } from 'next/navigation';

// Customer data is unavailable until authenticated sessions and row-level
// authorization are backed by the commerce database.
export default function Account() {
  notFound();
}
