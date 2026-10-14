"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingPolicyError = void 0;
exports.billingUser = billingUser;
exports.billingOrigin = billingOrigin;
exports.checkoutPolicy = checkoutPolicy;
class BillingPolicyError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
exports.BillingPolicyError = BillingPolicyError;
function billingUser(req) {
    if (!req.userId)
        throw new BillingPolicyError(401, 'Sign in to manage billing.');
    if (req.body?.userId && req.body.userId !== req.userId)
        throw new BillingPolicyError(403, 'You can only manage your own billing.');
    return req.userId;
}
function billingOrigin(env = process.env) {
    const configured = env.FRONTEND_ORIGIN || 'https://www.mynext9to5.com';
    let url;
    try {
        url = new URL(configured);
    }
    catch {
        throw new BillingPolicyError(503, 'Billing origin is not configured correctly.');
    }
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
        (url.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
        throw new BillingPolicyError(503, 'Billing origin is not configured correctly.');
    }
    return url.origin;
}
function checkoutPolicy(body, env = process.env) {
    const allowedPrices = new Set([
        ...(env.STRIPE_ALLOWED_PRICE_IDS || '').split(','),
        ...['STRIPE_PRO_MONTHLY_PRICE_ID', 'STRIPE_PRO_ANNUAL_PRICE_ID', 'STRIPE_PREMIUM_MONTHLY_PRICE_ID', 'STRIPE_PREMIUM_ANNUAL_PRICE_ID'].map(key => env[key] || ''),
    ].map(value => value.trim()).filter(Boolean));
    if (!allowedPrices.size)
        throw new BillingPolicyError(503, 'Billing prices are not configured.');
    if (typeof body.priceId !== 'string' || !allowedPrices.has(body.priceId))
        throw new BillingPolicyError(400, 'Unsupported subscription price.');
    const origins = new Set([billingOrigin(env), 'https://mynext9to5.com', 'https://www.mynext9to5.com']);
    if (env.NODE_ENV !== 'production') {
        origins.add('http://localhost:3001');
        origins.add('http://localhost:5173');
    }
    const validateUrl = (value) => {
        let url;
        try {
            if (typeof value !== 'string')
                throw new Error();
            url = new URL(value);
        }
        catch {
            throw new BillingPolicyError(400, 'A valid billing return URL is required.');
        }
        if (url.username || url.password || !origins.has(url.origin))
            throw new BillingPolicyError(400, 'Unsupported billing return destination.');
        return url.href;
    };
    return { priceId: body.priceId, successUrl: validateUrl(body.successUrl), cancelUrl: validateUrl(body.cancelUrl) };
}
