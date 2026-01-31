import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';

export interface DeviceFingerprint {
    browserFingerprint: string;
    hardwareFingerprint?: string;
}

export interface DeviceBindingResult {
    isValid: boolean;
    isFirstActivation: boolean;
    canSwap: boolean;
    swapsRemaining: number;
    boundDevice?: string;
    errorCode?: 'DEVICE_MISMATCH' | 'MAX_ACTIVATIONS_REACHED';
}

/**
 * Check if device fingerprint matches the bound device
 */
export async function checkDeviceBinding(
    licenseId: string,
    fingerprint: DeviceFingerprint
): Promise<DeviceBindingResult> {
    const license = await prisma.license.findUnique({
        where: { id: licenseId },
        select: {
            browserFingerprint: true,
            hardwareFingerprint: true,
            deviceName: true,
            activationCount: true,
            maxActivations: true
        }
    });

    if (!license) {
        return {
            isValid: false,
            isFirstActivation: false,
            canSwap: false,
            swapsRemaining: 0,
            errorCode: undefined
        };
    }

    // First-time activation
    if (!license.browserFingerprint) {
        return {
            isValid: true,
            isFirstActivation: true,
            canSwap: false,
            swapsRemaining: license.maxActivations - license.activationCount
        };
    }

    // Check fingerprint match
    if (license.browserFingerprint === fingerprint.browserFingerprint) {
        return {
            isValid: true,
            isFirstActivation: false,
            canSwap: false,
            swapsRemaining: license.maxActivations - license.activationCount,
            boundDevice: license.deviceName || undefined
        };
    }

    // Device mismatch
    const canSwap = license.activationCount < license.maxActivations;

    return {
        isValid: false,
        isFirstActivation: false,
        canSwap,
        swapsRemaining: Math.max(0, license.maxActivations - license.activationCount),
        boundDevice: license.deviceName || undefined,
        errorCode: canSwap ? 'DEVICE_MISMATCH' : 'MAX_ACTIVATIONS_REACHED'
    };
}

/**
 * Bind a device to a license (first activation or swap)
 */
export async function bindDevice(
    licenseId: string,
    fingerprint: DeviceFingerprint,
    deviceName?: string,
    ip?: string
): Promise<boolean> {
    try {
        await prisma.license.update({
            where: { id: licenseId },
            data: {
                browserFingerprint: fingerprint.browserFingerprint,
                hardwareFingerprint: fingerprint.hardwareFingerprint,
                deviceName: deviceName || 'Unknown Device',
                status: 'ACTIVE',
                activationCount: { increment: 1 },
                lastValidatedAt: new Date(),
                lastValidatedIp: ip
            }
        });
        return true;
    } catch (error) {
        console.error('Failed to bind device:', error);
        return false;
    }
}

/**
 * Request a device swap
 */
export async function requestDeviceSwap(
    licenseId: string,
    newFingerprint: DeviceFingerprint,
    ip: string,
    reason?: string
): Promise<{ success: boolean; swapLogId?: string; error?: string }> {
    // Get current license
    const license = await prisma.license.findUnique({
        where: { id: licenseId },
        select: {
            browserFingerprint: true,
            activationCount: true,
            maxActivations: true
        }
    });

    if (!license) {
        return { success: false, error: 'License not found' };
    }

    if (!license.browserFingerprint) {
        return { success: false, error: 'No device bound to this license' };
    }

    if (license.activationCount >= license.maxActivations) {
        return { success: false, error: 'Maximum device swaps reached' };
    }

    // Create swap log
    const swapLog = await prisma.deviceSwapLog.create({
        data: {
            licenseId,
            oldBrowserFingerprint: license.browserFingerprint,
            newBrowserFingerprint: newFingerprint.browserFingerprint,
            ipAddress: ip,
            reason,
            approved: true // Auto-approve for now (can add manual approval later)
        }
    });

    // Update license with new device
    await prisma.license.update({
        where: { id: licenseId },
        data: {
            browserFingerprint: newFingerprint.browserFingerprint,
            hardwareFingerprint: newFingerprint.hardwareFingerprint,
            activationCount: { increment: 1 },
            lastValidatedAt: new Date(),
            lastValidatedIp: ip
        }
    });

    return { success: true, swapLogId: swapLog.id };
}

/**
 * Hash IP address for privacy
 */
export function hashIpAddress(ip: string): string {
    return createHash('sha256').update(ip).digest('hex');
}

/**
 * Get client IP from request headers
 */
export function getClientIp(headers: Headers): string {
    return (
        headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        headers.get('x-real-ip') ||
        'unknown'
    );
}
