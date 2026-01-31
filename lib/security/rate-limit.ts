import { prisma } from '@/lib/prisma';

/**
 * FREE TIER Rate Limiting Strategy
 * Uses in-memory cache for hot path + Supabase for persistence
 * 
 * Trade-offs:
 * - Slower than Redis (~50ms vs ~5ms per check)
 * - Lost on cold starts (Vercel serverless)
 * - Good enough for MVP with <1000 DAU
 */

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

// In-memory cache (persists per serverless instance)
const rateLimitCache = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of rateLimitCache.entries()) {
            if (entry.resetAt < now) {
                rateLimitCache.delete(key);
            }
        }
    }, 5 * 60 * 1000);
}

export interface RateLimitConfig {
    limit: number;
    windowMs: number;
}

export const RATE_LIMITS = {
    // Per IP Address
    IP: { limit: 100, windowMs: 60 * 1000 }, // 100 req/min

    // Per License Key
    LICENSE: { limit: 30, windowMs: 60 * 1000 }, // 30 req/min

    // Per Login Attempt
    LOGIN: { limit: 5, windowMs: 15 * 60 * 1000 }, // 5 attempts/15min

    // Per API Endpoint
    ENDPOINT: { limit: 10000, windowMs: 60 * 1000 }, // 10k req/min

    // Device swap
    DEVICE_SWAP: { limit: 1, windowMs: 24 * 60 * 60 * 1000 }, // 1 req/day
} as const;

export interface RateLimitResult {
    success: boolean;
    limit: number;
    remaining: number;
    reset: Date;
}

export async function checkRateLimit(
    identifier: string,
    config: RateLimitConfig,
    prefix: string = 'rate'
): Promise<RateLimitResult> {
    const key = `${prefix}:${identifier}`;
    const now = Date.now();

    // Try in-memory cache first (fast path)
    let entry = rateLimitCache.get(key);

    // If not in cache or expired, check Supabase (fallback for cold starts)
    if (!entry || entry.resetAt < now) {
        const dbEntry = await getFromSupabase(key);

        if (dbEntry && dbEntry.resetAt > now) {
            entry = dbEntry;
            rateLimitCache.set(key, entry);
        } else {
            // Initialize new window
            entry = {
                count: 0,
                resetAt: now + config.windowMs
            };
            rateLimitCache.set(key, entry);
            await saveToSupabase(key, entry);
        }
    }

    // Increment counter
    entry.count++;

    const success = entry.count <= config.limit;
    const remaining = Math.max(0, config.limit - entry.count);
    const reset = new Date(entry.resetAt);

    // Update cache and DB (async, don't block)
    rateLimitCache.set(key, entry);
    saveToSupabase(key, entry).catch(err => {
        console.error('Failed to save rate limit to DB:', err);
    });

    return {
        success,
        limit: config.limit,
        remaining,
        reset
    };
}

/**
 * Supabase fallback for rate limit persistence
 */
async function getFromSupabase(key: string): Promise<RateLimitEntry | null> {
    try {
        const result = await prisma.rateLimit.findUnique({
            where: { key },
            select: { count: true, resetAt: true }
        });

        if (!result || result.resetAt.getTime() < Date.now()) {
            return null;
        }

        return {
            count: result.count,
            resetAt: result.resetAt.getTime()
        };
    } catch (error) {
        console.error('Failed to get rate limit from DB:', error);
        return null;
    }
}

async function saveToSupabase(key: string, entry: RateLimitEntry): Promise<void> {
    try {
        await prisma.rateLimit.upsert({
            where: { key },
            create: {
                key,
                count: entry.count,
                resetAt: new Date(entry.resetAt)
            },
            update: {
                count: entry.count,
                resetAt: new Date(entry.resetAt)
            }
        });
    } catch (error) {
        console.error('Failed to save rate limit to DB:', error);
    }
}

/**
 * Helper functions for common use cases
 */
export async function checkIpRateLimit(ip: string): Promise<RateLimitResult> {
    return checkRateLimit(ip, RATE_LIMITS.IP, 'ip');
}

export async function checkLicenseRateLimit(licenseKey: string): Promise<RateLimitResult> {
    return checkRateLimit(licenseKey, RATE_LIMITS.LICENSE, 'license');
}

export async function checkLoginRateLimit(email: string): Promise<RateLimitResult> {
    return checkRateLimit(email, RATE_LIMITS.LOGIN, 'login');
}

export async function checkDeviceSwapRateLimit(licenseKey: string): Promise<RateLimitResult> {
    return checkRateLimit(licenseKey, RATE_LIMITS.DEVICE_SWAP, 'swap');
}

/**
 * Get rate limit headers for response
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
    return {
        'X-RateLimit-Limit': result.limit.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': result.reset.toISOString()
    };
}
