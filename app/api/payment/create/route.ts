import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { generateOrderId } from '@/lib/payment/license-generator';
import { z } from 'zod';

const PLAN_PRICES = {
    LIFETIME: 299000,
    ANNUAL: 149000,
    MONTHLY: 49000
} as const;

const CreatePaymentSchema = z.object({
    planType: z.enum(['LIFETIME', 'ANNUAL', 'MONTHLY']),
    email: z.string().email(),
    name: z.string().min(2)
});

/**
 * Create a payment order and get Midtrans Snap token
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        // Validate input
        const parsed = CreatePaymentSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid request', details: parsed.error.flatten() },
                { status: 400 }
            );
        }

        const { planType, email, name } = parsed.data;
        const amount = PLAN_PRICES[planType];
        const orderId = generateOrderId('SH');

        // Find or create user
        let user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            user = await prisma.user.create({
                data: {
                    email,
                    name
                }
            });
        }

        // Get Midtrans credentials
        const serverKey = process.env.MIDTRANS_SERVER_KEY;
        const isProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';

        if (!serverKey) {
            logger.error('MIDTRANS_SERVER_KEY not configured');
            return NextResponse.json({ error: 'Payment service not configured' }, { status: 500 });
        }

        // Create Midtrans Snap transaction
        const midtransUrl = isProduction
            ? 'https://app.midtrans.com/snap/v1/transactions'
            : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

        const midtransPayload = {
            transaction_details: {
                order_id: orderId,
                gross_amount: amount
            },
            customer_details: {
                email,
                first_name: name.split(' ')[0],
                last_name: name.split(' ').slice(1).join(' ') || undefined
            },
            item_details: [
                {
                    id: planType,
                    price: amount,
                    quantity: 1,
                    name: `SlotHunter ${planType.charAt(0) + planType.slice(1).toLowerCase()} License`
                }
            ],
            callbacks: {
                finish: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/payment/success`
            }
        };

        const authString = Buffer.from(`${serverKey}:`).toString('base64');

        const midtransResponse = await fetch(midtransUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${authString}`,
                'Accept': 'application/json'
            },
            body: JSON.stringify(midtransPayload)
        });

        if (!midtransResponse.ok) {
            const errorData = await midtransResponse.text();
            logger.error('Midtrans API error', {
                status: midtransResponse.status,
                error: errorData
            });
            return NextResponse.json(
                { error: 'Failed to create payment', details: errorData },
                { status: 502 }
            );
        }

        const midtransData = await midtransResponse.json();

        // Save payment record
        await prisma.payment.create({
            data: {
                userId: user.id,
                provider: 'MIDTRANS',
                externalId: orderId,
                amount,
                currency: 'IDR',
                planType,
                status: 'PENDING'
            }
        });

        logger.info('Payment created', { orderId, userId: user.id, amount });

        return NextResponse.json({
            success: true,
            data: {
                orderId,
                snapToken: midtransData.token,
                redirectUrl: midtransData.redirect_url,
                amount,
                planType
            }
        });

    } catch (error) {
        logger.error('Payment creation error', {
            error: error instanceof Error ? error.message : String(error)
        });
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
