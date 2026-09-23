const requiredCommerceEnvironment = [
  'LG_STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
] as const;

export type CommerceEnvironment = (typeof requiredCommerceEnvironment)[number] | 'LG_POSTGRES_URL';

export function commerceReadiness() {
  const missing: CommerceEnvironment[] = requiredCommerceEnvironment.filter((key) => !process.env[key]);
  if (!process.env.LG_DATABASE_URL && !process.env.LG_POSTGRES_URL) missing.push('LG_POSTGRES_URL');
  return { ready: missing.length === 0, missing };
}

export function stripeSecretKey() {
  return process.env.LG_STRIPE_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY;
}

export function canonicalOrigin(requestUrl: string) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  return configured ? new URL(configured).origin : new URL(requestUrl).origin;
}
