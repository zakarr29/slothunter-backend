import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { generateLicenseKey, calculateExpiryDate } from '@/lib/payment/license-generator';

/**
 * Xendit Webhook Handler (Backup payment gateway)
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        // 1. Verify Xendit Callback Token
        const callbackToken = req.headers.get('x-callback-token');
        const expectedToken = process.env.XENDIT_CALLBACK_TOKEN;

        if (!expectedToken || callbackToken !== expectedToken) {
            logger.warn('Invalid Xendit callback token');
            return NextResponse.json({ error: 'Invalid callback token' }, { status: 403 });
        }

        const externalId = body.external_id;
        const status = body.status;

        logger.info('Xendit webhook received', { externalId, status });

        // Find payment record
        const payment = await prisma.payment.findUnique({
            where: {
                provider_externalId: {
                    provider: 'XENDIT',
                    externalId
                }
            },
            include: { user: true }
        });

        if (!payment) {
            logger.error('Payment not found', { externalId });
            return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
        }

        // 2. Process based on status
        if (status === 'PAID' || status === 'SETTLED') {
            await handleSuccessfulPayment(payment, body);
        } else if (status === 'PENDING') {
            await prisma.payment.update({
                where: { id: payment.id },
                data: { status: 'PENDING' }
            });
        } else if (['FAILED', 'EXPIRED'].includes(status)) {
            await prisma.payment.update({
                where: { id: payment.id },
                data: { status: status === 'EXPIRED' ? 'EXPIRED' : 'FAILED' }
            });
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        logger.error('Xendit webhook error', {
            error: error instanceof Error ? error.message : String(error)
        });
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

interface PaymentWithUser {
    id: string;
    userId: string;
    amount: number;
    planType: 'LIFETIME' | 'ANNUAL' | 'MONTHLY';
    user: { id: string; email: string; name: string | null };
}

async function handleSuccessfulPayment(payment: PaymentWithUser, webhookData: Record<string, unknown>) {
    await prisma.payment.update({
        where: { id: payment.id },
        data: {
            status: 'PAID',
            paidAt: new Date(),
            paymentMethod: webhookData.payment_method as string || 'xendit'
        }
    });

    const licenseKey = generateLicenseKey();

    const license = await prisma.license.create({
        data: {
            key: licenseKey,
            userId: payment.userId,
            purchasePrice: payment.amount,
            planType: payment.planType,
            status: 'INACTIVE',
            expiresAt: calculateExpiryDate(payment.planType)
        }
    });

    await prisma.auditLog.create({
        data: {
            userId: payment.userId,
            action: 'license.created',
            entityType: 'license',
            entityId: license.id,
            changes: { paymentId: payment.id, amount: payment.amount },
            ipAddress: 'webhook',
            userAgent: 'xendit-webhook'
        }
    });

    logger.info('License generated via Xendit', {
        paymentId: payment.id,
        licenseId: license.id
    });
}
