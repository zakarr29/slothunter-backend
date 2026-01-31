import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
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
 * Mock payment endpoint for testing without Midtrans
 * Returns fake snap token and redirect URL
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        const parsed = CreatePaymentSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid request', details: parsed.error.flatten() },
                { status: 400 }
            );
        }

        const { planType, email, name } = parsed.data;
        const amount = PLAN_PRICES[planType];
        const orderId = generateOrderId('MOCK');

        // Find or create user
        let user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            user = await prisma.user.create({
                data: { email, name }
            });
        }

        // Create pending payment
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

        // Generate mock tokens
        const mockSnapToken = `mock_snap_${orderId}_${Date.now()}`;
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://slothunter-backend.vercel.app';

        return NextResponse.json({
            success: true,
            mock: true,
            data: {
                orderId,
                snapToken: mockSnapToken,
                redirectUrl: `${baseUrl}/payment/success?order_id=${orderId}`,
                amount,
                planType,
                message: '⚠️ MOCK MODE: Use mock-success endpoint to simulate payment'
            }
        });

    } catch (error) {
        console.error('Mock payment error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
