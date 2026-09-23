const requiredCommerceEnvironment = [
  'LG_DATABASE_URL',
  'LG_STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
] as const;

export type CommerceEnvironment = (typeof requiredCommerceEnvironment)[number];

export function commerceReadiness() {
  const missing = requiredCommerceEnvironment.filter((key) => !process.env[key]);
  return { ready: missing.length === 0, missing };
}

export function stripeSecretKey() {
  return process.env.LG_STRIPE_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY;
}

export function canonicalOrigin(requestUrl: string) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  return configured ? new URL(configured).origin : new URL(requestUrl).origin;
}
