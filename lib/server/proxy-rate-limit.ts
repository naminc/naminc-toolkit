import { createHmac } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { HttpProxyError } from "@/lib/server/http-proxy-security";

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

export interface ProxyRateLimiter {
  limit(identifier: string): Promise<RateLimitResult>;
}

const RATE_LIMIT = 20;
const WINDOW_MS = 60_000;

export class MemoryProxyRateLimiter implements ProxyRateLimiter {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async limit(identifier: string): Promise<RateLimitResult> {
    const currentTime = this.now();
    const existing = this.entries.get(identifier);
    const entry = !existing || existing.resetAt <= currentTime
      ? { count: 0, resetAt: currentTime + WINDOW_MS }
      : existing;
    entry.count += 1;
    this.entries.set(identifier, entry);
    return {
      allowed: entry.count <= RATE_LIMIT,
      limit: RATE_LIMIT,
      remaining: Math.max(0, RATE_LIMIT - entry.count),
      resetAt: entry.resetAt,
    };
  }
}

class UpstashProxyRateLimiter implements ProxyRateLimiter {
  private readonly limiter: Ratelimit;

  constructor(url: string, token: string) {
    this.limiter = new Ratelimit({
      redis: new Redis({ url, token }),
      limiter: Ratelimit.slidingWindow(RATE_LIMIT, "60 s"),
      prefix: "naminc:http-proxy",
      analytics: false,
      timeout: 2_000,
    });
  }

  async limit(identifier: string): Promise<RateLimitResult> {
    let result;
    try {
      result = await this.limiter.limit(identifier);
    } catch {
      throw new HttpProxyError("RATE_LIMIT_UNAVAILABLE", 503, "Proxy mode is temporarily unavailable.");
    }
    if (result.reason === "timeout") {
      throw new HttpProxyError("RATE_LIMIT_UNAVAILABLE", 503, "Proxy mode is temporarily unavailable.");
    }
    return { allowed: result.success, limit: result.limit, remaining: result.remaining, resetAt: result.reset };
  }
}

let productionLimiter: ProxyRateLimiter | undefined;
let developmentLimiter: ProxyRateLimiter | undefined;

export function createDefaultProxyRateLimiter(): ProxyRateLimiter {
  if (process.env.NODE_ENV !== "production") {
    developmentLimiter ??= new MemoryProxyRateLimiter();
    return developmentLimiter;
  }
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new HttpProxyError("RATE_LIMIT_UNAVAILABLE", 503, "Proxy mode is not configured for this deployment.");
  }
  productionLimiter ??= new UpstashProxyRateLimiter(url, token);
  return productionLimiter;
}

export function hashClientIp(ip: string, salt = process.env.PROXY_RATE_LIMIT_SALT): string {
  if (!salt) {
    if (process.env.NODE_ENV === "production") {
      throw new HttpProxyError("RATE_LIMIT_UNAVAILABLE", 503, "Proxy mode is not configured for this deployment.");
    }
    salt = "naminc-local-development-only";
  }
  return createHmac("sha256", salt).update(ip).digest("hex");
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}
