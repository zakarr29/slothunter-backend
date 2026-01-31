import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Health check endpoint for monitoring
 * Use with UptimeRobot (FREE tier)
 */
export async function GET() {
    const startTime = Date.now();

    const checks = {
        status: 'healthy' as 'healthy' | 'unhealthy',
        database: false,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '0.1.0'
    };

    try {
        // Check database connection
        await prisma.$queryRaw`SELECT 1`;
        checks.database = true;
    } catch (error) {
        checks.database = false;
        checks.status = 'unhealthy';
        console.error('Database health check failed:', error);
    }

    const responseTime = Date.now() - startTime;

    return NextResponse.json(
        {
            ...checks,
            responseTimeMs: responseTime
        },
        {
            status: checks.status === 'healthy' ? 200 : 503,
            headers: {
                'Cache-Control': 'no-cache, no-store',
                'X-Response-Time': `${responseTime}ms`
            }
        }
    );
}
