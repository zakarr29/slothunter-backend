import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Keep-alive endpoint to prevent cold starts
 * 
 * Vercel Cron Jobs (FREE tier):
 * - Run every 5 minutes
 * - Keeps serverless functions warm
 * - Prevents Supabase database pause (7 days inactivity limit)
 */
export async function GET(req: NextRequest) {
    try {
        // Verify cron secret to prevent abuse
        const authHeader = req.headers.get('authorization');
        if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 1. Ping database (prevents auto-pause)
        await prisma.$queryRaw`SELECT 1 as ping`;

        // 2. Check system health
        const licenseCount = await prisma.license.count({
            where: { status: 'ACTIVE' }
        });

        // 3. Clean up expired rate limit entries
        const deletedRateLimits = await prisma.rateLimit.deleteMany({
            where: {
                resetAt: { lt: new Date() }
            }
        });

        // 4. Return success
        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            metrics: {
                database: 'active',
                activeLicenses: licenseCount,
                rateLimitsCleaned: deletedRateLimits.count
            }
        });

    } catch (error) {
        console.error('Keep-alive error:', error);

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}

// Also export as POST for testing
export { GET as POST };
