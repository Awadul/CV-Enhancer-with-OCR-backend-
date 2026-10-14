"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXPORT_TABLES = void 0;
exports.validShareToken = validShareToken;
exports.reviewSnapshot = reviewSnapshot;
exports.recentlySignedIn = recentlySignedIn;
exports.EXPORT_TABLES = ['user_profiles', 'saved_cvs', 'cv_versions', 'saved_jobs', 'applications',
    'question_bank_progress', 'resume_analytics', 'export_history', 'saved_bios', 'saved_cover_letters',
    'network_contacts', 'user_usage', 'ai_feature_usage', 'user_subscriptions', 'cv_shares'];
function validShareToken(value) {
    return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
// Explicit projection: do not leak newly added private fields through a public review.
function reviewSnapshot(cv) {
    const result = {};
    for (const key of ['first_name', 'last_name', 'title', 'summary']) {
        if (typeof cv[key] === 'string')
            result[key] = cv[key];
    }
    const fields = {
        experience: ['title', 'company', 'type', 'start_date', 'end_date', 'summary', 'description'],
        education: ['degree', 'field', 'institution', 'start_date', 'end_date'],
        projects: ['project_name', 'organization', 'start_date', 'end_date', 'description', 'summary', 'technologies'],
        skills: ['category', 'skills', 'level'], certifications: ['name', 'issuer', 'date'],
        languages_spoken: ['language', 'name', 'level'],
        internship_volunteering: ['involvement', 'organization', 'description', 'start_date', 'end_date'],
    };
    for (const [key, allowed] of Object.entries(fields)) {
        if (!Array.isArray(cv[key]))
            continue;
        result[key] = cv[key].map((item) => {
            if (key === 'languages_spoken' && typeof item === 'string')
                return item;
            if (!item || typeof item !== 'object' || Array.isArray(item))
                return {};
            return Object.fromEntries(allowed.filter(field => field in item).map(field => [field, item[field]]));
        });
    }
    result.contact = {};
    result.references = [];
    return result;
}
function recentlySignedIn(lastSignIn, now = Date.now()) {
    if (typeof lastSignIn !== 'string')
        return false;
    const age = now - Date.parse(lastSignIn);
    return Number.isFinite(age) && age >= 0 && age <= 10 * 60000;
}
