import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { verifyJWT, extractBearerToken } from '@/lib/security/jwt';
import { checkLicenseRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/logger';

/**
 * Get latest active configuration for the extension
 * Supports ETag caching to minimize bandwidth
 */
export async function GET(req: NextRequest) {
    try {
        // 1. Verify JWT from Authorization header
        const token = extractBearerToken(req.headers.get('authorization'));
        if (!token) {
            return NextResponse.json(
                { error: 'Missing or invalid authorization header' },
                { status: 401 }
            );
        }

        const decoded = await verifyJWT(token);
        if (!decoded || !decoded.licenseId) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        // 2. Rate Limiting
        const limit = await checkLicenseRateLimit(decoded.licenseId);
        if (!limit.success) {
            return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
        }

        // 3. Verify license is still active
        const license = await prisma.license.findUnique({
            where: { id: decoded.licenseId },
            select: { id: true, status: true, isBanned: true }
        });

        if (!license || license.isBanned || license.status !== 'ACTIVE') {
            return NextResponse.json({ error: 'License is no longer valid' }, { status: 403 });
        }

        // 4. Get latest active config
        const config = await prisma.webConfig.findFirst({
            where: { isActive: true },
            orderBy: { publishedAt: 'desc' }
        });

        if (!config) {
            return NextResponse.json({ error: 'No active configuration found' }, { status: 404 });
        }

        // 5. Check If-None-Match header (ETag caching)
        const clientETag = req.headers.get('if-none-match');
        const serverETag = `"${config.checksum}"`;

        if (clientETag === serverETag) {
            return new NextResponse(null, {
                status: 304,
                headers: {
                    'ETag': serverETag,
                    'Cache-Control': 'public, max-age=300'
                }
            });
        }

        // 6. Prepare config response
        const responseData = {
            version: config.version,
            minExtensionVersion: config.minExtensionVersion,
            maxExtensionVersion: config.maxExtensionVersion,
            targets: {
                vfs: config.vfsSelectors,
                tls: config.tlsSelectors
            },
            featureFlags: config.featureFlags,
            checksum: config.checksum,
            publishedAt: config.publishedAt
        };

        // 7. Log delivery
        await prisma.configDeliveryLog.create({
            data: {
                licenseId: license.id,
                configVersion: config.version,
                extensionVersion: req.headers.get('x-extension-version') || 'unknown'
            }
        });

        return NextResponse.json(responseData, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'ETag': serverETag,
                'Cache-Control': 'public, max-age=300',
                'X-Config-Version': config.version
            }
        });

    } catch (error) {
        logger.error('Config delivery error', {
            error: error instanceof Error ? error.message : String(error)
        });
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
