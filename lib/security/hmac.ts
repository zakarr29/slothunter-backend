import { createHmac, timingSafeEqual } from 'crypto';

/**
 * HMAC-SHA256 signature for secure communication
 * between Chrome Extension and Backend
 */

export interface SignedRequest {
    payload: unknown;
    timestamp: number;
    signature: string;
}

export function signRequest(
    payload: unknown,
    apiSecret: string
): SignedRequest {
    const timestamp = Date.now();

    const message = JSON.stringify({
        payload,
        timestamp
    });

    const signature = createHmac('sha256', apiSecret)
        .update(message)
        .digest('hex');

    return {
        payload,
        timestamp,
        signature
    };
}

export function verifyRequest(
    request: SignedRequest,
    apiSecret: string,
    maxAge: number = 60000 // 60 seconds
): boolean {
    // Check timestamp freshness (prevent replay attacks)
    const age = Date.now() - request.timestamp;
    if (age > maxAge || age < 0) {
        return false;
    }

    // Verify signature
    const message = JSON.stringify({
        payload: request.payload,
        timestamp: request.timestamp
    });

    const expectedSignature = createHmac('sha256', apiSecret)
        .update(message)
        .digest('hex');

    // Timing-safe comparison
    try {
        return timingSafeEqual(
            Buffer.from(request.signature, 'hex'),
            Buffer.from(expectedSignature, 'hex')
        );
    } catch {
        return false;
    }
}

/**
 * Middleware helper to extract and verify signed request
 */
export function parseSignedRequest(
    body: unknown
): SignedRequest | null {
    if (
        typeof body !== 'object' ||
        body === null ||
        !('payload' in body) ||
        !('timestamp' in body) ||
        !('signature' in body)
    ) {
        return null;
    }

    const { payload, timestamp, signature } = body as Record<string, unknown>;

    if (typeof timestamp !== 'number' || typeof signature !== 'string') {
        return null;
    }

    return { payload, timestamp, signature };
}
