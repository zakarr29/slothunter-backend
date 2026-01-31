import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, parseSignedRequest } from '@/lib/security/hmac';
import { checkIpRateLimit, getRateLimitHeaders } from '@/lib/security/rate-limit';
import { bindDevice, getClientIp } from '@/lib/security/device-binding';
import { signAccessToken } from '@/lib/security/jwt';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const ActivatePayloadSchema = z.object({
    licenseKey: z.string().min(10),
    browserFingerprint: z.string().min(10),
    hardwareFingerprint: z.string().optional(),
    deviceName: z.string().optional()
});

/**
 * Activate a license for first-time use
 */
export async function POST(req: NextRequest) {
    const ip = getClientIp(req.headers);

    try {
        // 1. Rate limiting
        const rateLimit = await checkIpRateLimit(ip);
        if (!rateLimit.success) {
            return NextResponse.json(
                { success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests' } },
                { status: 429, headers: getRateLimitHeaders(rateLimit) }
            );
        }

        // 2. Parse and verify request
        const body = await req.json();
        const signedRequest = parseSignedRequest(body);

        if (!signedRequest) {
            return NextResponse.json(
                { success: false, error: { code: 'INVALID_REQUEST', message: 'Missing required fields' } },
                { status: 400 }
            );
        }

        const apiSecret = process.env.API_SECRET;
        if (!apiSecret || !verifyRequest(signedRequest, apiSecret, 60000)) {
            return NextResponse.json(
                { success: false, error: { code: 'INVALID_SIGNATURE', message: 'Request signature is invalid' } },
                { status: 401 }
            );
        }

        // 3. Validate payload
        const parsed = ActivatePayloadSchema.safeParse(signedRequest.payload);
        if (!parsed.success) {
            return NextResponse.json(
                { success: false, error: { code: 'INVALID_PAYLOAD', message: 'Invalid activation data' } },
                { status: 400 }
            );
        }

        const { licenseKey, browserFingerprint, hardwareFingerprint, deviceName } = parsed.data;

        // 4. Find license
        const license = await prisma.license.findUnique({
            where: { key: licenseKey },
            include: { user: { select: { id: true, email: true, name: true } } }
        });

        if (!license) {
            return NextResponse.json(
                { success: false, error: { code: 'INVALID_LICENSE', message: 'License not found' } },
                { status: 404 }
            );
        }

        // 5. Check license status
        if (license.isBanned) {
            return NextResponse.json(
                { success: false, error: { code: 'LICENSE_BANNED', message: 'License has been banned' } },
                { status: 403 }
            );
        }

        if (license.status === 'ACTIVE') {
            // Already activated - check device match
            if (license.browserFingerprint && license.browserFingerprint !== browserFingerprint) {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: 'ALREADY_ACTIVATED',
                            message: 'License is already activated on another device',
                            boundDevice: license.deviceName
                        }
                    },
                    { status: 403 }
                );
            }
            // Same device - return existing token
            const accessToken = await signAccessToken({
                licenseId: license.id,
                userId: license.userId,
                email: license.user.email
            });

            return NextResponse.json({
                success: true,
                data: {
                    accessToken,
                    license: {
                        key: license.key,
                        status: license.status,
                        expiresAt: license.expiresAt,
                        activatedAt: license.createdAt
                    }
                }
            });
        }

        if (license.status !== 'INACTIVE') {
            return NextResponse.json(
                { success: false, error: { code: 'INVALID_STATUS', message: `Cannot activate license with status: ${license.status}` } },
                { status: 400 }
            );
        }

        // 6. Check activation limit
        if (license.activationCount >= license.maxActivations) {
            return NextResponse.json(
                { success: false, error: { code: 'MAX_ACTIVATIONS', message: 'Maximum activations reached' } },
                { status: 403 }
            );
        }

        // 7. Activate license and bind device
        const success = await bindDevice(
            license.id,
            { browserFingerprint, hardwareFingerprint },
            deviceName || 'Chrome Extension',
            ip
        );

        if (!success) {
            return NextResponse.json(
                { success: false, error: { code: 'ACTIVATION_FAILED', message: 'Failed to activate license' } },
                { status: 500 }
            );
        }

        // 8. Log activation
        await prisma.validationLog.create({
            data: {
                licenseId: license.id,
                browserFingerprint,
                hardwareFingerprint,
                ipAddress: ip,
                userAgent: req.headers.get('user-agent') || 'Chrome Extension',
                result: 'SUCCESS',
                failureReason: 'First activation',
                extensionVersion: '1.0.0'
            }
        });


        // 10. Generate access token
        const accessToken = await signAccessToken({
            licenseId: license.id,
            userId: license.userId,
            email: license.user.email
        });

        logger.info('License activated', { licenseId: license.id, userId: license.userId });

        return NextResponse.json({
            success: true,
            data: {
                accessToken,
                expiresIn: 3600,
                license: {
                    key: license.key,
                    status: 'ACTIVE',
                    expiresAt: license.expiresAt,
                    activatedAt: new Date().toISOString()
                }
            }
        });

    } catch (error) {
        logger.error('License activation error', {
            error: error instanceof Error ? error.message : String(error),
            ip
        });
        return NextResponse.json(
            { success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
            { status: 500 }
        );
    }
}
