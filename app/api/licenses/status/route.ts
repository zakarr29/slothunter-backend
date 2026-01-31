import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyJWT, extractBearerToken } from '@/lib/security/jwt';

/**
 * Get license status and details
 * Requires JWT authentication
 */
export async function GET(req: NextRequest) {
    try {
        // 1. Verify JWT
        const token = extractBearerToken(req.headers.get('authorization'));
        if (!token) {
            return NextResponse.json({ error: 'Missing authorization' }, { status: 401 });
        }

        const decoded = await verifyJWT(token);
        if (!decoded) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        // 2. Fetch license with stats
        const license = await prisma.license.findUnique({
            where: { id: decoded.licenseId },
            include: {
                user: { select: { name: true, email: true } },
                _count: { select: { validationLogs: true, deviceSwapLogs: true } }
            }
        });

        if (!license) {
            return NextResponse.json({ error: 'License not found' }, { status: 404 });
        }

        // 3. Get recent usage
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const usage = await prisma.usageMetric.findUnique({
            where: {
                licenseId_date: {
                    licenseId: license.id,
                    date: today
                }
            }
        });

        return NextResponse.json({
            success: true,
            data: {
                license: {
                    id: license.id,
                    status: license.status,
                    planType: license.planType,
                    expiresAt: license.expiresAt,
                    deviceName: license.deviceName,
                    activationCount: license.activationCount,
                    maxActivations: license.maxActivations,
                    createdAt: license.createdAt
                },
                user: license.user,
                stats: {
                    totalValidations: license._count.validationLogs,
                    deviceSwaps: license._count.deviceSwapLogs,
                    todayUsage: usage || { slotChecks: 0, slotsFound: 0, bookingAttempts: 0, bookingSuccess: 0 }
                }
            }
        });

    } catch (error) {
        console.error('License status error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
