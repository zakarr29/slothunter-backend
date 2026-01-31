import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const QuerySchema = z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(50),
    status: z.enum(['ACTIVE', 'INACTIVE', 'EXPIRED', 'BANNED']).optional(),
    search: z.string().optional()
});

/**
 * List all licenses with pagination & filters
 * Admin endpoint - requires admin auth (TODO: implement admin auth middleware)
 */
export async function GET(req: NextRequest) {
    try {
        // TODO: Add admin authentication middleware

        // Parse query params
        const { searchParams } = new URL(req.url);
        const parsed = QuerySchema.safeParse({
            page: searchParams.get('page') || 1,
            limit: searchParams.get('limit') || 50,
            status: searchParams.get('status') || undefined,
            search: searchParams.get('search') || undefined
        });

        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 });
        }

        const { page, limit, status, search } = parsed.data;
        const skip = (page - 1) * limit;

        // Build where clause
        const where: {
            status?: typeof status;
            isBanned?: boolean;
            OR?: Array<{ key?: { contains: string; mode: 'insensitive' }; user?: { email: { contains: string; mode: 'insensitive' } } }>;
        } = {};

        if (status) {
            if (status === 'BANNED') {
                where.isBanned = true;
            } else {
                where.status = status;
            }
        }

        if (search) {
            where.OR = [
                { key: { contains: search, mode: 'insensitive' } },
                { user: { email: { contains: search, mode: 'insensitive' } } }
            ];
        }

        // Fetch licenses with count
        const [licenses, total] = await Promise.all([
            prisma.license.findMany({
                where,
                include: {
                    user: { select: { id: true, email: true, name: true } },
                    _count: { select: { validationLogs: true } }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.license.count({ where })
        ]);

        return NextResponse.json({
            success: true,
            data: {
                licenses: licenses.map(l => ({
                    id: l.id,
                    key: l.key,
                    status: l.isBanned ? 'BANNED' : l.status,
                    planType: l.planType,
                    user: l.user,
                    deviceName: l.deviceName,
                    activationCount: l.activationCount,
                    maxActivations: l.maxActivations,
                    validationsCount: l._count.validationLogs,
                    expiresAt: l.expiresAt,
                    createdAt: l.createdAt,
                    lastValidatedAt: l.lastValidatedAt
                })),
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        console.error('Admin licenses list error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
