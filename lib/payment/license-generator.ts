import { randomBytes, createHash } from 'crypto';

/**
 * Generate a unique, secure license key
 * Format: SH-XXXX-XXXX-XXXX-XXXX (20 chars + dashes)
 */
export function generateLicenseKey(): string {
    const bytes = randomBytes(12);
    const hex = bytes.toString('hex').toUpperCase();

    // Format: SH-XXXX-XXXX-XXXX-XXXX
    const parts = [
        'SH',
        hex.slice(0, 4),
        hex.slice(4, 8),
        hex.slice(8, 12),
        hex.slice(12, 16)
    ];

    return parts.join('-');
}

/**
 * Validate license key format
 */
export function isValidLicenseKeyFormat(key: string): boolean {
    const pattern = /^SH-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    return pattern.test(key);
}

/**
 * Calculate expiry date based on plan type
 */
export function calculateExpiryDate(planType: 'LIFETIME' | 'ANNUAL' | 'MONTHLY'): Date | null {
    const now = new Date();

    switch (planType) {
        case 'MONTHLY':
            return new Date(now.setMonth(now.getMonth() + 1));
        case 'ANNUAL':
            return new Date(now.setFullYear(now.getFullYear() + 1));
        case 'LIFETIME':
        default:
            return null; // No expiry for lifetime
    }
}

/**
 * Generate order ID for payment gateway
 */
export function generateOrderId(prefix: string = 'SH'): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(4).toString('hex');
    return `${prefix}-${timestamp}-${random}`.toUpperCase();
}

/**
 * Hash for verification purposes
 */
export function generateChecksum(data: string): string {
    return createHash('sha256').update(data).digest('hex');
}
