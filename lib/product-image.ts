/** Supplier image fields can be URLs, arrays, or JSON-encoded arrays. */
export function productImage(value: unknown): string {
  if (Array.isArray(value)) return value.map(productImage).find(Boolean) || '';
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (text.startsWith('[') || text.startsWith('"')) {
    try { return productImage(JSON.parse(text)); } catch { return ''; }
  }
  if (text.startsWith('//')) return productImage(`https:${text}`);
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch { return ''; }
}
