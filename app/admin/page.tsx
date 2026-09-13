import { notFound } from 'next/navigation';

// This boundary prevents accidental publication of operational data until an
// identity provider and server-side role check are implemented.
export default function Admin() {
  notFound();
}
