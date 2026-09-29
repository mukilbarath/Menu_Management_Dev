import { uuidPattern } from '@/lib/config';

export async function GET(request: Request, { params }: RouteContext<'/q/[token]'>) {
  const { token } = await params;
  if (!uuidPattern.test(token)) return new Response('Invalid QR code', { status: 404 });

  const destination = new URL(`/menu/${token}`, request.url);
  return Response.redirect(destination, 307);
}
