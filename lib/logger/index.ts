import { prisma } from '@/lib/prisma';

/**
 * FREE TIER LOGGING STRATEGY
 * 
 * Uses:
 * - Console logs (visible in Vercel logs)
 * - Supabase table for error tracking
 * - No paid services (replaces Sentry/pino)
 */

interface LogEntry {
    level: 'info' | 'warn' | 'error';
    message: string;
    context?: Record<string, unknown>;
    timestamp: Date;
}

class Logger {
    private redactFields = [
        'licenseKey',
        'apiKey',
        'password',
        'token',
        'accessToken',
        'refreshToken',
        'signature',
        'secret'
    ];

    private redact(obj: unknown): unknown {
        if (!obj || typeof obj !== 'object') return obj;

        const redacted = { ...obj as Record<string, unknown> };

        for (const field of this.redactFields) {
            if (field in redacted) {
                redacted[field] = '[REDACTED]';
            }
        }

        for (const key in redacted) {
            if (typeof redacted[key] === 'object' && redacted[key] !== null) {
                redacted[key] = this.redact(redacted[key]);
            }
        }

        return redacted;
    }

    info(message: string, context?: Record<string, unknown>) {
        const entry: LogEntry = {
            level: 'info',
            message,
            context: this.redact(context) as Record<string, unknown> | undefined,
            timestamp: new Date()
        };

        console.log(JSON.stringify(entry));
    }

    warn(message: string, context?: Record<string, unknown>) {
        const entry: LogEntry = {
            level: 'warn',
            message,
            context: this.redact(context) as Record<string, unknown> | undefined,
            timestamp: new Date()
        };

        console.warn(JSON.stringify(entry));
    }

    error(message: string, context?: Record<string, unknown>) {
        const entry: LogEntry = {
            level: 'error',
            message,
            context: this.redact(context) as Record<string, unknown> | undefined,
            timestamp: new Date()
        };

        console.error(JSON.stringify(entry));

        this.saveErrorToDb(entry).catch(dbError => {
            console.error('Failed to save error to DB:', dbError);
        });
    }

    private async saveErrorToDb(entry: LogEntry) {
        if (entry.level !== 'error') return;

        try {
            await prisma.errorLog.create({
                data: {
                    level: entry.level,
                    message: entry.message,
                    context: entry.context as object || {},
                    createdAt: entry.timestamp
                }
            });
        } catch {
            // Silent fail
        }
    }
}

export const logger = new Logger();
