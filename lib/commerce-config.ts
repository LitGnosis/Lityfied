const requiredCommerceEnvironment = [
  'NEXT_PUBLIC_SITE_URL',
  'DATABASE_URL',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'AUTH_SECRET',
  'NEXT_PUBLIC_AUTH_PUBLISHABLE_KEY',
  'EMAIL_API_KEY',
  'SHIPPING_API_KEY',
  'BLOB_READ_WRITE_TOKEN',
] as const;

export type CommerceEnvironment = (typeof requiredCommerceEnvironment)[number];

export function commerceReadiness() {
  const missing = requiredCommerceEnvironment.filter((key) => !process.env[key]);
  return { ready: missing.length === 0, missing };
}

export function canonicalOrigin(requestUrl: string) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  return configured ? new URL(configured).origin : new URL(requestUrl).origin;
}
