import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateLicenseKey, calculateExpiryDate } from '@/lib/payment/license-generator';

/**
 * Mock success endpoint - simulates successful payment
 * Auto-generates license and redirects to success page
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const orderId = searchParams.get('order_id');

        if (!orderId) {
            return NextResponse.json({ error: 'Missing order_id' }, { status: 400 });
        }

        // Find payment
        const payment = await prisma.payment.findFirst({
            where: { externalId: orderId },
            include: { user: true }
        });

        if (!payment) {
            return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
        }

        if (payment.status === 'PAID') {
            // Already processed - find existing license
            const existingLicense = await prisma.license.findFirst({
                where: { userId: payment.userId }
            });

            return NextResponse.json({
                success: true,
                message: 'Payment already processed',
                data: {
                    orderId,
                    licenseKey: existingLicense?.key || 'N/A',
                    status: 'PAID'
                }
            });
        }

        // Update payment status
        await prisma.payment.update({
            where: { id: payment.id },
            data: {
                status: 'PAID',
                paidAt: new Date(),
                paymentMethod: 'MOCK_PAYMENT'
            }
        });

        // Generate license
        const licenseKey = generateLicenseKey();
        const expiresAt = calculateExpiryDate(payment.planType);

        const license = await prisma.license.create({
            data: {
                key: licenseKey,
                userId: payment.userId,
                status: 'INACTIVE', // Will be ACTIVE after first device activation
                planType: payment.planType,
                purchasePrice: payment.amount,
                expiresAt
            }
        });

        // Log audit
        await prisma.auditLog.create({
            data: {
                userId: payment.userId,
                action: 'license.created',
                entityType: 'license',
                entityId: license.id,
                changes: {
                    orderId,
                    planType: payment.planType,
                    amount: payment.amount,
                    mock: true
                },
                ipAddress: 'mock-payment',
                userAgent: 'mock-success-endpoint'
            }
        });

        console.log('Mock payment success:', { orderId, licenseKey, userId: payment.userId });

        // Return success with license info
        return NextResponse.json({
            success: true,
            mock: true,
            data: {
                orderId,
                licenseKey,
                planType: payment.planType,
                expiresAt,
                email: payment.user.email,
                message: '✅ MOCK PAYMENT SUCCESS! License created.',
                nextStep: 'Use /api/licenses/activate to bind device'
            }
        });

    } catch (error) {
        console.error('Mock success error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
