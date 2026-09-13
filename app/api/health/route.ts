import { NextResponse } from 'next/server';
import { commerceReadiness } from '@/lib/commerce-config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const readiness = commerceReadiness();
  return NextResponse.json(
    { status: readiness.ready ? 'ready' : 'not_ready', services: { commerce: readiness.ready }, missing: readiness.missing },
    { status: readiness.ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
