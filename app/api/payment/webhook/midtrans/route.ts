import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { generateLicenseKey, calculateExpiryDate } from '@/lib/payment/license-generator';

/**
 * Midtrans Webhook Handler
 * 
 * Receives payment notifications from Midtrans and:
 * 1. Verifies the signature
 * 2. Updates payment status
 * 3. Generates license on successful payment
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        // 1. Verify Midtrans Signature
        const serverKey = process.env.MIDTRANS_SERVER_KEY;
        if (!serverKey) {
            logger.error('MIDTRANS_SERVER_KEY not configured');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const orderId = body.order_id;
        const statusCode = body.status_code;
        const grossAmount = body.gross_amount;

        const signatureString = orderId + statusCode + grossAmount + serverKey;
        const calculatedSignature = createHash('sha512')
            .update(signatureString)
            .digest('hex');

        if (calculatedSignature !== body.signature_key) {
            logger.warn('Invalid Midtrans signature', { orderId });
            return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
        }

        // 2. Handle transaction statuses
        const transactionStatus = body.transaction_status;
        const fraudStatus = body.fraud_status;

        logger.info('Midtrans webhook received', {
            orderId,
            transactionStatus,
            fraudStatus
        });

        // Find payment record
        const payment = await prisma.payment.findUnique({
            where: {
                provider_externalId: {
                    provider: 'MIDTRANS',
                    externalId: orderId
                }
            },
            include: { user: true }
        });

        if (!payment) {
            logger.error('Payment not found', { orderId });
            return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
        }

        // 3. Process based on status
        if (transactionStatus === 'capture' || transactionStatus === 'settlement') {
            if (fraudStatus === 'accept' || !fraudStatus) {
                await handleSuccessfulPayment(payment, body);
            } else {
                // Fraud detected
                await prisma.payment.update({
                    where: { id: payment.id },
                    data: {
                        status: 'FAILED',
                        fraudScore: 100,
                        fraudReason: `Midtrans fraud status: ${fraudStatus}`
                    }
                });

                logger.warn('Payment flagged as fraud', {
                    paymentId: payment.id,
                    fraudStatus
                });
            }
        } else if (transactionStatus === 'pending') {
            await prisma.payment.update({
                where: { id: payment.id },
                data: { status: 'PENDING' }
            });
        } else if (['deny', 'cancel', 'expire'].includes(transactionStatus)) {
            await prisma.payment.update({
                where: { id: payment.id },
                data: {
                    status: transactionStatus === 'expire' ? 'EXPIRED' : 'FAILED'
                }
            });
        } else if (transactionStatus === 'refund') {
            await handleRefund(payment);
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        logger.error('Midtrans webhook error', {
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
    createdAt: Date;
    user: {
        id: string;
        email: string;
        name: string | null;
    };
}

async function handleSuccessfulPayment(payment: PaymentWithUser, webhookData: Record<string, unknown>) {
    // 1. Update payment status
    await prisma.payment.update({
        where: { id: payment.id },
        data: {
            status: 'PAID',
            paidAt: new Date(),
            paymentMethod: webhookData.payment_type as string
        }
    });

    // 2. Generate license
    const licenseKey = generateLicenseKey();

    const license = await prisma.license.create({
        data: {
            key: licenseKey,
            userId: payment.userId,
            purchasePrice: payment.amount,
            planType: payment.planType,
            status: 'INACTIVE', // Will be ACTIVE on first use
            expiresAt: calculateExpiryDate(payment.planType)
        }
    });

    // 3. Log audit trail
    await prisma.auditLog.create({
        data: {
            userId: payment.userId,
            action: 'license.created',
            entityType: 'license',
            entityId: license.id,
            changes: {
                paymentId: payment.id,
                amount: payment.amount
            },
            ipAddress: 'webhook',
            userAgent: 'midtrans-webhook'
        }
    });

    logger.info('License generated', {
        paymentId: payment.id,
        licenseId: license.id,
        userId: payment.userId
    });

    // TODO: Send email with license key (implement email service)
}

async function handleRefund(payment: PaymentWithUser) {
    await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'REFUNDED' }
    });

    // Find and ban associated license
    const license = await prisma.license.findFirst({
        where: {
            userId: payment.userId,
            purchasePrice: payment.amount,
            createdAt: {
                gte: payment.createdAt,
                lte: new Date(payment.createdAt.getTime() + 86400000) // Within 24 hours
            }
        }
    });

    if (license) {
        await prisma.license.update({
            where: { id: license.id },
            data: {
                isBanned: true,
                bannedReason: 'Payment refunded',
                bannedAt: new Date()
            }
        });

        logger.info('License banned due to refund', {
            licenseId: license.id,
            paymentId: payment.id
        });
    }
}
