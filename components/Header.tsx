import Link from 'next/link';

export function Header() {
  return <header><Link className="brand" href="/">LITYFIED</Link><nav><Link href="/products">Collection</Link><Link href="/cart">Bag</Link></nav></header>;
}
