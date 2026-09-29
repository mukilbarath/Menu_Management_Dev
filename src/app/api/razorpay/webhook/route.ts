import { NextResponse } from 'next/server';
import { apiError, HttpError } from '@/lib/server';
import { validSignature } from '@/lib/payment-security';
import { settlePayment } from '@/lib/payments';
export async function POST(request: Request) {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) throw new HttpError('Webhook not configured', 503);
    const raw = await request.text();
    if (!validSignature(raw, request.headers.get('x-razorpay-signature') ?? '', secret)) throw new HttpError('Invalid signature', 401);
    const event = JSON.parse(raw);
    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const payment = event.payload?.payment?.entity;
      if (!payment?.id || !payment?.order_id) throw new HttpError('Invalid event');
      await settlePayment(payment.id, payment.order_id);
    }
    return NextResponse.json({ received: true });
  } catch (error) { return apiError(error); }
}
