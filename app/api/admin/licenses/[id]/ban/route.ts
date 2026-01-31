import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const BanSchema = z.object({
    reason: z.string().min(5),
    permanent: z.boolean().default(true)
});

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * Ban a license (manual enforcement)
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        // TODO: Add admin authentication middleware

        const body = await req.json();
        const parsed = BanSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
        }

        const { reason, permanent } = parsed.data;

        // Find license
        const license = await prisma.license.findUnique({
            where: { id },
            include: { user: { select: { id: true, email: true } } }
        });

        if (!license) {
            return NextResponse.json({ error: 'License not found' }, { status: 404 });
        }

        if (license.isBanned) {
            return NextResponse.json({ error: 'License is already banned' }, { status: 400 });
        }

        // Ban the license
        const updatedLicense = await prisma.license.update({
            where: { id },
            data: {
                isBanned: true,
                bannedReason: reason,
                bannedAt: new Date(),
                status: 'INACTIVE'
            }
        });

        // Create system alert
        await prisma.systemAlert.create({
            data: {
                type: 'ABUSE_DETECTED',
                severity: 'MEDIUM',
                title: `License banned: ${license.key}`,
                message: reason,
                metadata: {
                    licenseId: license.id,
                    userId: license.userId,
                    reason,
                    permanent
                }
            }
        });

        // Create audit log
        await prisma.auditLog.create({
            data: {
                userId: license.userId,
                action: 'license.banned',
                entityType: 'license',
                entityId: license.id,
                changes: { reason, permanent },
                ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0] || 'admin',
                userAgent: req.headers.get('user-agent') || 'admin-panel'
            }
        });

        logger.info('License banned', { licenseId: id, reason });

        return NextResponse.json({
            success: true,
            data: {
                license: {
                    id: updatedLicense.id,
                    key: updatedLicense.key,
                    status: 'BANNED',
                    bannedReason: updatedLicense.bannedReason,
                    bannedAt: updatedLicense.bannedAt
                }
            }
        });

    } catch (error) {
        logger.error('License ban error', { error: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
