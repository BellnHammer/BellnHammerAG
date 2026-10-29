// Step 1 of the editor login: send the owner to GitHub with a one-time state value tied to this browser.
import crypto from 'node:crypto';
import { CALLBACK_URL, STATE_COOKIE, noStore } from './_oauth.js';

export default function handler(req, res) {
    noStore(res);
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
        res.status(500).send('Login is not configured yet: GITHUB_CLIENT_ID is missing in Vercel.');
        return;
    }
    const state = crypto.randomBytes(24).toString('hex');
    res.setHeader('Set-Cookie', `${STATE_COOKIE}=${state}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', CALLBACK_URL);
    url.searchParams.set('scope', 'public_repo read:user');
    url.searchParams.set('state', state);
    url.searchParams.set('allow_signup', 'false');
    res.redirect(302, url.toString());
}
