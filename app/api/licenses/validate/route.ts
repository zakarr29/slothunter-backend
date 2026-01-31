import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, parseSignedRequest } from '@/lib/security/hmac';
import { checkIpRateLimit, checkLicenseRateLimit, getRateLimitHeaders } from '@/lib/security/rate-limit';
import { checkDeviceBinding, bindDevice, getClientIp } from '@/lib/security/device-binding';
import { signAccessToken } from '@/lib/security/jwt';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';


interface ValidatePayload {
    licenseKey: string;
    browserFingerprint: string;
    hardwareFingerprint?: string;
    extensionVersion: string;
    deviceName?: string;
}

export async function POST(req: NextRequest) {
    const startTime = Date.now();
    const ip = getClientIp(req.headers);

    try {
        // 1. Rate Limiting (IP Level)
        const ipLimit = await checkIpRateLimit(ip);
        if (!ipLimit.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'RATE_LIMIT_EXCEEDED',
                        message: 'Too many requests. Please try again later.',
                        retryAfter: Math.ceil((ipLimit.reset.getTime() - Date.now()) / 1000)
                    }
                },
                {
                    status: 429,
                    headers: getRateLimitHeaders(ipLimit)
                }
            );
        }

        // 2. Parse & Validate Request Body
        const body = await req.json();
        const signedRequest = parseSignedRequest(body);

        if (!signedRequest) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'INVALID_REQUEST',
                        message: 'Missing required fields'
                    }
                },
                { status: 400 }
            );
        }

        // 3. Verify HMAC Signature
        const apiSecret = process.env.API_SECRET;
        if (!apiSecret) {
            logger.error('API_SECRET not configured');
            return NextResponse.json(
                { success: false, error: { code: 'SERVER_ERROR', message: 'Server configuration error' } },
                { status: 500 }
            );
        }

        const isValidSignature = verifyRequest(signedRequest, apiSecret, 60000);

        if (!isValidSignature) {
            logger.warn('Invalid HMAC signature', { ip });
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'INVALID_SIGNATURE',
                        message: 'Request signature is invalid or expired'
                    }
                },
                { status: 401 }
            );
        }

        const payload = signedRequest.payload as ValidatePayload;

        if (!payload.licenseKey || !payload.browserFingerprint || !payload.extensionVersion) {
            return NextResponse.json(
                { success: false, error: { code: 'INVALID_PAYLOAD', message: 'Missing license key or fingerprint' } },
                { status: 400 }
            );
        }

        // 4. Rate Limiting (License Level)
        const licenseLimit = await checkLicenseRateLimit(payload.licenseKey);
        if (!licenseLimit.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'LICENSE_RATE_LIMIT',
                        message: 'Too many validation requests for this license'
                    }
                },
                { status: 429 }
            );
        }

        // 5. Fetch License from Database
        const license = await prisma.license.findUnique({
            where: { key: payload.licenseKey },
            include: {
                user: {
                    select: { id: true, email: true, name: true }
                }
            }
        });

        if (!license) {
            await logValidation(null, 'FAILED_INVALID_KEY', payload, ip);
            return NextResponse.json(
                { success: false, error: { code: 'INVALID_LICENSE', message: 'License key not found' } },
                { status: 404 }
            );
        }

        // 6. Check License Status
        if (license.isBanned) {
            await logValidation(license.id, 'FAILED_BANNED', payload, ip);
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'LICENSE_BANNED',
                        message: license.bannedReason || 'This license has been banned',
                        bannedAt: license.bannedAt
                    }
                },
                { status: 403 }
            );
        }

        if (license.status === 'EXPIRED' || (license.expiresAt && license.expiresAt < new Date())) {
            await logValidation(license.id, 'FAILED_EXPIRED', payload, ip);
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'LICENSE_EXPIRED',
                        message: 'Your license has expired',
                        expiresAt: license.expiresAt
                    }
                },
                { status: 403 }
            );
        }

        // 7. Device Binding Check
        const deviceCheck = await checkDeviceBinding(license.id, {
            browserFingerprint: payload.browserFingerprint,
            hardwareFingerprint: payload.hardwareFingerprint
        });

        if (deviceCheck.isFirstActivation) {
            // First-time activation
            const bound = await bindDevice(
                license.id,
                { browserFingerprint: payload.browserFingerprint, hardwareFingerprint: payload.hardwareFingerprint },
                payload.deviceName || `Chrome Extension v${payload.extensionVersion}`,
                ip
            );

            if (!bound) {
                return NextResponse.json(
                    { success: false, error: { code: 'ACTIVATION_FAILED', message: 'Failed to activate license' } },
                    { status: 500 }
                );
            }

            await logValidation(license.id, 'SUCCESS', payload, ip, 'First activation');
        } else if (!deviceCheck.isValid) {
            // Device mismatch
            await logValidation(license.id, 'FAILED_DEVICE_MISMATCH', payload, ip);
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'DEVICE_MISMATCH',
                        message: 'This license is bound to another device',
                        details: {
                            boundDevice: deviceCheck.boundDevice || 'Unknown Device',
                            canSwap: deviceCheck.canSwap,
                            swapsRemaining: deviceCheck.swapsRemaining
                        }
                    }
                },
                { status: 403 }
            );
        } else {
            // Success - Update last validation
            await prisma.license.update({
                where: { id: license.id },
                data: {
                    lastValidatedAt: new Date(),
                    lastValidatedIp: ip
                }
            });
            await logValidation(license.id, 'SUCCESS', payload, ip);
        }

        // 8. Generate Access Token
        const accessToken = await signAccessToken({
            licenseId: license.id,
            userId: license.userId,
            email: license.user.email
        });

        // 9. Get Latest Config Version
        const config = await prisma.webConfig.findFirst({
            where: { isActive: true },
            orderBy: { createdAt: 'desc' },
            select: { version: true }
        });

        const responseTime = Date.now() - startTime;

        return NextResponse.json(
            {
                success: true,
                data: {
                    accessToken,
                    expiresIn: 3600,
                    license: {
                        id: license.id,
                        status: license.status,
                        expiresAt: license.expiresAt,
                        deviceName: license.deviceName
                    },
                    config: {
                        version: config?.version || '1.0.0'
                    },
                    user: {
                        name: license.user.name,
                        email: license.user.email
                    }
                }
            },
            {
                headers: {
                    'X-Response-Time': `${responseTime}ms`
                }
            }
        );

    } catch (error) {
        logger.error('License validation error', {
            error: error instanceof Error ? error.message : String(error),
            ip
        });

        return NextResponse.json(
            { success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
            { status: 500 }
        );
    }
}

async function logValidation(
    licenseId: string | null,
    result: string,
    payload: ValidatePayload,
    ip: string,
    note?: string
) {
    try {
        if (!licenseId) return;

        await prisma.validationLog.create({
            data: {
                licenseId,
                browserFingerprint: payload.browserFingerprint,
                hardwareFingerprint: payload.hardwareFingerprint,
                ipAddress: ip,
                userAgent: 'Chrome Extension',
                result: result as 'SUCCESS' | 'FAILED_INVALID_KEY' | 'FAILED_DEVICE_MISMATCH' | 'FAILED_BANNED' | 'FAILED_EXPIRED' | 'FAILED_RATE_LIMIT' | 'SUSPICIOUS_ACTIVITY',
                failureReason: note,
                suspicionScore: 0,
                extensionVersion: payload.extensionVersion
            }
        });
    } catch (error) {
        logger.error('Failed to log validation', { error: error instanceof Error ? error.message : String(error) });
    }
}
