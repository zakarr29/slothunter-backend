import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, parseSignedRequest } from '@/lib/security/hmac';
import { checkDeviceSwapRateLimit, getRateLimitHeaders } from '@/lib/security/rate-limit';
import { requestDeviceSwap, getClientIp } from '@/lib/security/device-binding';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

interface DeviceSwapPayload {
    licenseKey: string;
    newBrowserFingerprint: string;
    newHardwareFingerprint?: string;
    reason?: string;
}

/**
 * Request a device swap for a license
 * Limited to 1 request per day
 */
export async function POST(req: NextRequest) {
    const ip = getClientIp(req.headers);

    try {
        // 1. Parse and verify request
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

        const payload = signedRequest.payload as DeviceSwapPayload;

        if (!payload.licenseKey || !payload.newBrowserFingerprint) {
            return NextResponse.json(
                { success: false, error: { code: 'INVALID_PAYLOAD', message: 'Missing license key or new fingerprint' } },
                { status: 400 }
            );
        }

        // 2. Rate limit check (1 per day)
        const rateLimit = await checkDeviceSwapRateLimit(payload.licenseKey);
        if (!rateLimit.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'DEVICE_SWAP_RATE_LIMIT',
                        message: 'Device swap can only be requested once per day',
                        retryAfter: Math.ceil((rateLimit.reset.getTime() - Date.now()) / 1000)
                    }
                },
                { status: 429, headers: getRateLimitHeaders(rateLimit) }
            );
        }

        // 3. Fetch license
        const license = await prisma.license.findUnique({
            where: { key: payload.licenseKey },
            select: { id: true, status: true, isBanned: true }
        });

        if (!license) {
            return NextResponse.json(
                { success: false, error: { code: 'INVALID_LICENSE', message: 'License not found' } },
                { status: 404 }
            );
        }

        if (license.isBanned || license.status !== 'ACTIVE') {
            return NextResponse.json(
                { success: false, error: { code: 'LICENSE_INACTIVE', message: 'License is not active' } },
                { status: 403 }
            );
        }

        // 4. Process device swap
        const result = await requestDeviceSwap(
            license.id,
            {
                browserFingerprint: payload.newBrowserFingerprint,
                hardwareFingerprint: payload.newHardwareFingerprint
            },
            ip,
            payload.reason
        );

        if (!result.success) {
            return NextResponse.json(
                { success: false, error: { code: 'SWAP_FAILED', message: result.error } },
                { status: 400 }
            );
        }

        logger.info('Device swap completed', {
            licenseId: license.id,
            swapLogId: result.swapLogId
        });

        return NextResponse.json({
            success: true,
            data: { swapLogId: result.swapLogId }
        });

    } catch (error) {
        logger.error('Device swap error', {
            error: error instanceof Error ? error.message : String(error),
            ip
        });
        return NextResponse.json(
            { success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
            { status: 500 }
        );
    }
}
