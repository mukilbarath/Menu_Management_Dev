import { NextResponse } from 'next/server';
import { authenticatedClient, adminClient, apiError, HttpError } from '@/lib/server';
import { gateway } from '@/lib/payments';
import { toPaise } from '@/lib/payment-security';
import { uuidPattern } from '@/lib/config';

export async function POST(request: Request) {
  try {
    const { client } = await authenticatedClient(request);
    const body = await request.json().catch(() => { throw new HttpError('Invalid JSON'); });
    if (typeof body?.orderId !== 'string' || !uuidPattern.test(body.orderId)) throw new HttpError('Invalid order ID');
    if (body.splitId != null && (typeof body.splitId !== 'string' || !uuidPattern.test(body.splitId))) throw new HttpError('Invalid bill split');
    const { data: order, error } = await client.from('orders').select('id,status,total_amount,restaurant_id').eq('id', body.orderId).single();
    if (error || !order) throw new HttpError('Order not found.', 404);
    if (!['billed','pending_payment'].includes(order.status)) throw new HttpError('This order is not awaiting online payment.', 409);
    const db = adminClient();
    const { data: bill } = await db.from('bills').select('id,status').eq('order_id',order.id).single();
    if (!bill || bill.status === 'paid') throw new HttpError('This bill has already been paid.',409);
    let amount = Number(order.total_amount);
    let splitId: string | null = null;
    if (body.splitId) {
      const { data: split } = await client.from('bill_splits').select('id,amount,status,bill_id').eq('id',body.splitId).eq('bill_id',bill.id).single();
      if (!split || split.status !== 'unpaid') throw new HttpError('This split is no longer awaiting payment.',409);
      amount=Number(split.amount); splitId=split.id;
    }
    const pendingQuery=db.from('payments').select('provider_order_id').eq('order_id',order.id).eq('provider','razorpay').eq('status','pending');
    const { data: existing } = splitId ? await pendingQuery.eq('split_id',splitId).maybeSingle() : await pendingQuery.is('split_id',null).maybeSingle();
    const { client: razorpay, key_id } = gateway();
    let gatewayId=existing?.provider_order_id;
    if (!gatewayId) {
      const created=await razorpay.orders.create({amount:toPaise(amount),currency:'INR',receipt:`${order.id.slice(0,18)}-${(splitId??'full').slice(0,12)}`});
      gatewayId=created.id;
      const {error:paymentError}=await db.from('payments').insert({restaurant_id:order.restaurant_id,order_id:order.id,bill_id:bill.id,split_id:splitId,method:'online_upi',provider:'razorpay',status:'pending',amount,provider_order_id:gatewayId});
      if(paymentError)throw paymentError;
    }
    return NextResponse.json({id:gatewayId,amount:toPaise(amount),currency:'INR',key:key_id});
  } catch (error) { return apiError(error); }
}
