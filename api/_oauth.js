// Shared settings for the blog editor's GitHub login (/api/auth -> GitHub -> /api/callback).
// Vercel env vars: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET (from the GitHub OAuth app),
// optional ALLOWED_GITHUB_USERS (comma-separated logins; defaults to the repo owner).
export const SITE_ORIGIN = 'https://www.bellnhammer.com';
export const CALLBACK_URL = SITE_ORIGIN + '/api/callback';
export const STATE_COOKIE = 'bh_oauth_state';

export function allowedUsers() {
    return (process.env.ALLOWED_GITHUB_USERS || 'BellnHammer').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

export function readCookie(req, name) {
    const hit = (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith(name + '='));
    return hit ? decodeURIComponent(hit.slice(name.length + 1)) : '';
}

export function noStore(res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Referrer-Policy', 'no-referrer');
}
