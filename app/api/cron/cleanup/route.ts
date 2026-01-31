import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Daily cleanup tasks
 * 
 * Runs at 2 AM UTC daily via Vercel Cron
 * - Archives old validation logs (keep 30 days)
 * - Cleans expired rate limits
 * - Removes old audit logs (keep 90 days)
 * - Cleans old config delivery logs (keep 30 days)
 * - Cleans old error logs (keep 14 days)
 */
export async function GET(req: NextRequest) {
    try {
        // Verify cron secret
        const authHeader = req.headers.get('authorization');
        if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

        // 1. Archive old validation logs (keep only 30 days)
        const deletedValidationLogs = await prisma.validationLog.deleteMany({
            where: { createdAt: { lt: thirtyDaysAgo } }
        });

        // 2. Clean expired rate limits
        const deletedRateLimits = await prisma.rateLimit.deleteMany({
            where: { resetAt: { lt: new Date() } }
        });

        // 3. Archive old audit logs (keep 90 days)
        const deletedAuditLogs = await prisma.auditLog.deleteMany({
            where: { createdAt: { lt: ninetyDaysAgo } }
        });

        // 4. Clean old config delivery logs (keep 30 days)
        const deletedConfigLogs = await prisma.configDeliveryLog.deleteMany({
            where: { deliveredAt: { lt: thirtyDaysAgo } }
        });

        // 5. Clean old error logs (keep 14 days)
        const deletedErrorLogs = await prisma.errorLog.deleteMany({
            where: { createdAt: { lt: fourteenDaysAgo } }
        });

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            cleaned: {
                validationLogs: deletedValidationLogs.count,
                rateLimits: deletedRateLimits.count,
                auditLogs: deletedAuditLogs.count,
                configLogs: deletedConfigLogs.count,
                errorLogs: deletedErrorLogs.count
            }
        });

    } catch (error) {
        console.error('Cleanup error:', error);

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}

export { GET as POST };
