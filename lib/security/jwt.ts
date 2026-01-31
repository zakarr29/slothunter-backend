import * as jose from 'jose';

const JWT_SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || 'fallback-secret-for-development'
);

const JWT_ISSUER = 'slothunter';
const JWT_AUDIENCE = 'slothunter-extension';

export interface JWTPayload {
    licenseId: string;
    userId: string;
    email?: string;
    iat?: number;
    exp?: number;
}

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}

/**
 * Sign a JWT access token
 */
export async function signAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): Promise<string> {
    const jwt = await new jose.SignJWT(payload as jose.JWTPayload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setIssuer(JWT_ISSUER)
        .setAudience(JWT_AUDIENCE)
        .setExpirationTime('1h')
        .sign(JWT_SECRET);

    return jwt;
}

/**
 * Sign a JWT refresh token (longer expiry)
 */
export async function signRefreshToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): Promise<string> {
    const jwt = await new jose.SignJWT({ ...payload, type: 'refresh' } as jose.JWTPayload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setIssuer(JWT_ISSUER)
        .setAudience(JWT_AUDIENCE)
        .setExpirationTime('7d')
        .sign(JWT_SECRET);

    return jwt;
}

/**
 * Generate both access and refresh tokens
 */
export async function generateTokenPair(payload: Omit<JWTPayload, 'iat' | 'exp'>): Promise<TokenPair> {
    const [accessToken, refreshToken] = await Promise.all([
        signAccessToken(payload),
        signRefreshToken(payload)
    ]);

    return {
        accessToken,
        refreshToken,
        expiresIn: 3600 // 1 hour in seconds
    };
}

/**
 * Verify and decode a JWT token
 */
export async function verifyJWT(token: string): Promise<JWTPayload | null> {
    try {
        const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE
        });

        return {
            licenseId: payload.licenseId as string,
            userId: payload.userId as string,
            email: payload.email as string | undefined,
            iat: payload.iat,
            exp: payload.exp
        };
    } catch {
        return null;
    }
}

/**
 * Extract bearer token from Authorization header
 */
export function extractBearerToken(authHeader: string | null): string | null {
    if (!authHeader?.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.substring(7);
}
