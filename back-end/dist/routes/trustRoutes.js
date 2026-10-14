"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTrustRouter = createTrustRouter;
const express_1 = require("express");
const supabase_js_1 = require("@supabase/supabase-js");
const crypto_1 = require("crypto");
const stripe_1 = __importDefault(require("stripe"));
const aiAccess_1 = require("../middleware/aiAccess");
const rateLimiter_1 = require("../middleware/rateLimiter");
const trustPolicy_1 = require("../utils/trustPolicy");
let client;
const getDatabase = () => {
    if (!client) {
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
            throw new Error('Database unavailable');
        client = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    }
    return client;
};
function createTrustRouter(database = getDatabase) {
    const router = (0, express_1.Router)();
    router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    const reviewLimit = (0, rateLimiter_1.rateLimiter)({ limit: 120, windowMs: 60000, message: 'Too many review requests. Try again shortly.' });
    const commentLimit = (0, rateLimiter_1.rateLimiter)({ limit: 10, windowMs: 60000, message: 'Too many comments. Try again shortly.' });
    async function activeShare(token) {
        if (!(0, trustPolicy_1.validShareToken)(token))
            return null;
        const { data, error } = await database().from('cv_shares').select('*')
            .eq('share_token', token).eq('is_active', true).gt('expires_at', new Date().toISOString()).maybeSingle();
        if (error)
            throw error;
        return data?.review_snapshot ? data : null;
    }
    router.post('/reviews/create', (0, rateLimiter_1.rateLimiter)({ limit: 30, windowMs: 3600000, message: 'Too many new review links. Try again later.' }), aiAccess_1.requireUser, async (req, res) => {
        try {
            const { cvId, allowComments } = req.body;
            if (typeof cvId !== 'string' || !/^[a-f0-9-]{36}$/i.test(cvId) || typeof allowComments !== 'boolean') {
                return res.status(400).json({ message: 'Choose a saved CV and comment preference.' });
            }
            const { data: cv, error } = await database().from('saved_cvs').select('id,name,cv_data,theme_id')
                .eq('id', cvId).eq('user_id', req.userId).maybeSingle();
            if (error)
                throw error;
            if (!cv)
                return res.status(404).json({ message: 'Saved CV not found.' });
            const { data, error: insertError } = await database().from('cv_shares').insert({
                user_id: req.userId, cv_id: cv.id, cv_name: cv.name, share_token: (0, crypto_1.randomBytes)(32).toString('hex'),
                allow_comments: allowComments, expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
                review_snapshot: { cv_data: (0, trustPolicy_1.reviewSnapshot)(cv.cv_data), theme_id: cv.theme_id,
                    options: { includePersonalInfo: true, includePrivateInfo: false, selectedBrand: 'commit' } },
            }).select().single();
            if (insertError)
                throw insertError;
            return res.status(201).json(data);
        }
        catch {
            return res.status(503).json({ message: 'Unable to create a review link. Try again later.' });
        }
    });
    router.post('/reviews/read', reviewLimit, async (req, res) => {
        try {
            const share = await activeShare(req.body.token);
            if (!share)
                return res.status(404).json({ message: 'This review link is invalid, expired or revoked.' });
            const { data: comments, error } = await database().from('cv_comments').select('*')
                .eq('share_id', share.id).order('created_at', { ascending: true }).limit(500);
            if (error)
                throw error;
            // Owner identity is not needed by anonymous reviewers.
            return res.json({ share: { id: share.id, cv_name: share.cv_name, allow_comments: share.allow_comments,
                    is_active: true, expires_at: share.expires_at }, cv: share.review_snapshot, comments });
        }
        catch {
            return res.status(503).json({ message: 'Review access is temporarily unavailable.' });
        }
    });
    router.post('/reviews/comment', commentLimit, async (req, res) => {
        try {
            const { token, reviewerName, section, content, parentId } = req.body;
            const sections = ['personalInfo', 'summary', 'experience', 'education', 'skills', 'projects', 'certifications', 'languages_spoken', ''];
            if (typeof reviewerName !== 'string' || !reviewerName.trim() || reviewerName.length > 80 ||
                typeof content !== 'string' || !content.trim() || content.length > 2000 || !sections.includes(section) ||
                (parentId != null && (typeof parentId !== 'string' || !/^[a-f0-9-]{36}$/i.test(parentId)))) {
                return res.status(400).json({ message: 'Enter a name (up to 80 characters) and comment (up to 2000 characters).' });
            }
            const share = await activeShare(token);
            if (!share)
                return res.status(404).json({ message: 'Review link unavailable.' });
            if (!share.allow_comments)
                return res.status(403).json({ message: 'Comments are disabled for this link.' });
            // The SQL function rechecks expiry/revocation and parent ownership under a lock,
            // and caps total comments across processes as well as the IP deterrent above.
            const { data, error } = await database().rpc('add_review_comment', {
                p_token: token, p_name: reviewerName.trim(), p_section: section,
                p_content: content.trim(), p_parent: parentId || null,
            });
            if (error)
                return res.status(400).json({ message: 'Unable to post: the link may have changed or reached its comment limit.' });
            return res.status(201).json(data);
        }
        catch {
            return res.status(503).json({ message: 'Comments are temporarily unavailable.' });
        }
    });
    router.post('/support/requests', (0, rateLimiter_1.rateLimiter)({ limit: 5, windowMs: 3600000, message: 'Too many support requests. Try again in an hour.' }), async (req, res) => {
        const { email, subject, message } = req.body;
        if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
            typeof subject !== 'string' || !subject.trim() || subject.length > 120 ||
            typeof message !== 'string' || !message.trim() || message.length > 4000) {
            return res.status(400).json({ message: 'Enter a valid email, subject (120 characters max) and message (4000 characters max).' });
        }
        try {
            const { data, error } = await database().from('support_requests')
                .insert({ email: email.trim().toLowerCase(), subject: subject.trim(), message: message.trim() }).select('id').single();
            if (error)
                throw error;
            return res.status(201).json({ reference: data.id });
        }
        catch {
            return res.status(503).json({ message: 'Your request was not saved. Please try again later.' });
        }
    });
    router.get('/account/export', aiAccess_1.requireUser, async (req, res) => {
        try {
            const tables = {};
            for (const table of trustPolicy_1.EXPORT_TABLES) {
                tables[table] = [];
                for (let offset = 0;; offset += 500) {
                    const { data, error } = await database().from(table).select('*')
                        .eq(table === 'user_profiles' ? 'id' : 'user_id', req.userId).range(offset, offset + 499);
                    if (error)
                        throw error;
                    tables[table].push(...(data || []));
                    if (!data || data.length < 500)
                        break;
                }
            }
            const shareIds = tables.cv_shares.map(share => share.id);
            tables.cv_comments = [];
            for (const id of shareIds) {
                const { data, error } = await database().from('cv_comments').select('*').eq('share_id', id).limit(500);
                if (error)
                    throw error;
                tables.cv_comments.push(...(data || []));
            }
            return res.json({ exported_at: new Date().toISOString(), email: req.userEmail, tables });
        }
        catch {
            return res.status(503).json({ message: 'Unable to export your data. No partial export was returned.' });
        }
    });
    router.delete('/account', aiAccess_1.requireUser, async (req, res) => {
        if (req.body.confirmation !== 'DELETE')
            return res.status(400).json({ message: 'Type DELETE to confirm permanent account deletion.' });
        try {
            const token = req.headers.authorization.replace(/^Bearer\s+/i, '');
            const { data: auth, error: authError } = await database().auth.getUser(token);
            if (authError || !auth.user || !(0, trustPolicy_1.recentlySignedIn)(auth.user.last_sign_in_at)) {
                return res.status(403).json({ message: 'Sign out and sign in again, then delete your account within ten minutes.' });
            }
            const { data: billing, error } = await database().from('user_subscriptions')
                .select('stripe_customer_id,stripe_subscription_id').eq('user_id', req.userId).maybeSingle();
            if (error)
                throw error;
            if (billing?.stripe_subscription_id && !billing.stripe_customer_id) {
                return res.status(503).json({ message: 'Your billing record needs reconciliation. Contact support before deleting your account.' });
            }
            if (billing?.stripe_customer_id) {
                if (!process.env.STRIPE_SECRET_KEY)
                    return res.status(503).json({ message: 'Billing verification is unavailable. Contact support before deleting your account.' });
                const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
                // Verify Stripe directly rather than trusting an expired local record.
                for await (const subscription of stripe.subscriptions.list({ customer: billing.stripe_customer_id, status: 'all', limit: 100 })) {
                    if (!['canceled', 'incomplete_expired'].includes(subscription.status)) {
                        return res.status(409).json({ message: 'Cancel your subscription in billing first. Deleting an account does not cancel payments.' });
                    }
                }
            }
            const { data: ready, error: readinessError } = await database().rpc('account_deletion_ready');
            if (readinessError || ready !== true)
                throw new Error('Deletion migration missing');
            // Remove support requests submitted from this verified account email before deleting identity.
            if (auth.user.email_confirmed_at && req.userEmail) {
                const { error: supportError } = await database().from('support_requests').delete().eq('email', req.userEmail.toLowerCase());
                if (supportError)
                    throw supportError;
            }
            const { error: deletionError } = await database().auth.admin.deleteUser(req.userId);
            if (deletionError)
                throw deletionError;
            return res.json({ deleted: true });
        }
        catch {
            return res.status(503).json({ message: 'Account deletion could not be completed. Contact support; do not assume your account was deleted.' });
        }
    });
    return router;
}
exports.default = createTrustRouter();
