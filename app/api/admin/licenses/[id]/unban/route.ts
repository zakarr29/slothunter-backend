import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * Unban a license
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        // TODO: Add admin authentication middleware

        // Find license
        const license = await prisma.license.findUnique({
            where: { id }
        });

        if (!license) {
            return NextResponse.json({ error: 'License not found' }, { status: 404 });
        }

        if (!license.isBanned) {
            return NextResponse.json({ error: 'License is not banned' }, { status: 400 });
        }

        // Unban the license
        const updatedLicense = await prisma.license.update({
            where: { id },
            data: {
                isBanned: false,
                bannedReason: null,
                bannedAt: null,
                status: license.expiresAt && license.expiresAt < new Date() ? 'EXPIRED' : 'ACTIVE'
            }
        });

        // Create audit log
        await prisma.auditLog.create({
            data: {
                userId: license.userId,
                action: 'license.unbanned',
                entityType: 'license',
                entityId: license.id,
                changes: { previousBanReason: license.bannedReason },
                ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0] || 'admin',
                userAgent: req.headers.get('user-agent') || 'admin-panel'
            }
        });

        logger.info('License unbanned', { licenseId: id });

        return NextResponse.json({
            success: true,
            data: {
                license: {
                    id: updatedLicense.id,
                    key: updatedLicense.key,
                    status: updatedLicense.status
                }
            }
        });

    } catch (error) {
        logger.error('License unban error', { error: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
