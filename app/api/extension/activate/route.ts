import { NextRequest, NextResponse } from 'next/server';
import { checkIpRateLimit, getRateLimitHeaders } from '@/lib/security/rate-limit';
import { getClientIp } from '@/lib/security/device-binding';
import { signAccessToken, signRefreshToken } from '@/lib/security/jwt';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const ActivateSchema = z.object({
    licenseKey: z.string().min(10),
    browserFingerprint: z.string().min(5),
    hardwareFingerprint: z.string().optional()
});

/**
 * Extension-friendly license activation (no HMAC required)
 * Used by Chrome Extension popup
 */
export async function POST(req: NextRequest) {
    const ip = getClientIp(req.headers);

    try {
        // 1. Rate limiting
        const rateLimit = await checkIpRateLimit(ip);
        if (!rateLimit.success) {
            return NextResponse.json(
                { success: false, error: 'Too many requests. Please try again later.' },
                { status: 429, headers: getRateLimitHeaders(rateLimit) }
            );
        }

        // 2. Parse body
        const body = await req.json();
        const parsed = ActivateSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { success: false, error: 'Invalid request. Please check license key format.' },
                { status: 400 }
            );
        }

        const { licenseKey, browserFingerprint, hardwareFingerprint } = parsed.data;

        // 3. Find license
        const license = await prisma.license.findUnique({
            where: { key: licenseKey },
            include: { user: { select: { id: true, email: true, name: true } } }
        });

        if (!license) {
            return NextResponse.json(
                { success: false, error: 'License not found. Please check your license key.' },
                { status: 404 }
            );
        }

        // 4. Check license status
        if (license.isBanned) {
            return NextResponse.json(
                { success: false, error: 'This license has been banned.' },
                { status: 403 }
            );
        }

        if (license.status === 'EXPIRED') {
            return NextResponse.json(
                { success: false, error: 'This license has expired.' },
                { status: 403 }
            );
        }

        // Check expiry date
        if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
            await prisma.license.update({
                where: { id: license.id },
                data: { status: 'EXPIRED' }
            });
            return NextResponse.json(
                { success: false, error: 'This license has expired.' },
                { status: 403 }
            );
        }

        // 5. Check device limit (simple check)
        const deviceCount = await prisma.validationLog.groupBy({
            by: ['browserFingerprint'],
            where: { licenseId: license.id }
        });

        const maxDevices = license.planType === 'LIFETIME' ? 3 : license.planType === 'ANNUAL' ? 2 : 1;
        const isNewDevice = !deviceCount.some(d => d.browserFingerprint === browserFingerprint);

        if (isNewDevice && deviceCount.length >= maxDevices) {
            return NextResponse.json(
                { success: false, error: `Device limit reached (${maxDevices} devices). Please deactivate another device first.` },
                { status: 403 }
            );
        }

        // 6. Bind device if first activation
        if (license.status === 'INACTIVE') {
            await prisma.license.update({
                where: { id: license.id },
                data: {
                    status: 'ACTIVE',
                    browserFingerprint,
                    hardwareFingerprint: hardwareFingerprint || null
                }
            });
        }

        // 7. Log validation
        await prisma.validationLog.create({
            data: {
                licenseId: license.id,
                browserFingerprint,
                hardwareFingerprint: hardwareFingerprint || 'N/A',
                ipAddress: ip,
                userAgent: req.headers.get('user-agent') || 'Chrome Extension',
                result: 'SUCCESS',
                extensionVersion: '1.0.0'
            }
        });

        // 8. Generate tokens
        const accessToken = await signAccessToken({
            licenseId: license.id,
            userId: license.userId
        });

        const refreshToken = await signRefreshToken({
            licenseId: license.id,
            userId: license.userId
        });

        // 9. Return success
        return NextResponse.json({
            success: true,
            data: {
                accessToken,
                refreshToken,
                planType: license.planType,
                expiresAt: license.expiresAt?.toISOString() || null,
                user: {
                    email: license.user.email,
                    name: license.user.name
                }
            }
        });

    } catch (error) {
        console.error('Extension activation error:', error);
        return NextResponse.json(
            { success: false, error: 'Server error. Please try again.' },
            { status: 500 }
        );
    }
}
