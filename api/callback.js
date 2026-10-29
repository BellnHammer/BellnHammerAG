// Step 2 of the editor login: check the state, swap GitHub's code for a token, make sure the account is
// on the allow-list, then hand the token to the editor window (same origin only) and close the popup.
import crypto from 'node:crypto';
import { SITE_ORIGIN, CALLBACK_URL, STATE_COOKIE, allowedUsers, readCookie, noStore } from './_oauth.js';

function reply(res, status, payload) {
    const message = `authorization:github:${status}:${JSON.stringify(payload)}`;
    // Decap handshake: the popup announces itself, the editor answers, then the popup sends the result.
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Set-Cookie', `${STATE_COOKIE}=; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
    res.status(200).send(`<!doctype html><html><head><meta name="robots" content="noindex"><title>Signing in…</title></head>
<body style="font-family:sans-serif;background:#0a0a0a;color:#e8e4df;padding:40px">${status === 'success' ? 'Signed in. You can close this window.' : 'Sign-in failed: ' + String(payload.message).replace(/[<>&]/g, '')}
<script>
(function () {
  var origin = ${JSON.stringify(SITE_ORIGIN)}, message = ${JSON.stringify(message)};
  if (!window.opener) return;
  window.addEventListener('message', function onMsg(e) {
    if (e.origin !== origin) return;
    window.removeEventListener('message', onMsg);
    window.opener.postMessage(message, origin);
    setTimeout(function () { window.close(); }, 400);
  });
  window.opener.postMessage('authorizing:github', origin);
})();
</script></body></html>`);
}

const fail = (res, message) => reply(res, 'error', { message });

export default async function handler(req, res) {
    noStore(res);
    const { code, state, error } = req.query || {};
    if (error) return fail(res, 'GitHub sign-in was cancelled.');

    const expected = readCookie(req, STATE_COOKIE);
    const ok = typeof state === 'string' && expected && state.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expected));
    if (!ok || typeof code !== 'string') return fail(res, 'Sign-in expired or was not started here. Please try again.');

    const clientId = process.env.GITHUB_CLIENT_ID, clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) return fail(res, 'Login is not configured on the server.');

    try {
        const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: CALLBACK_URL }),
        });
        const tokenJson = await tokenRes.json();
        if (!tokenJson.access_token) return fail(res, 'GitHub did not return a token.');

        const userRes = await fetch('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${tokenJson.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'bellnhammer-blog-editor' },
        });
        const user = await userRes.json();
        if (!user.login || !allowedUsers().includes(user.login.toLowerCase())) {
            // Revoke the token we just received so it can't be reused.
            await fetch(`https://api.github.com/applications/${clientId}/token`, {
                method: 'DELETE',
                headers: { Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'), Accept: 'application/vnd.github+json', 'User-Agent': 'bellnhammer-blog-editor' },
                body: JSON.stringify({ access_token: tokenJson.access_token }),
            }).catch(() => {});
            return fail(res, 'This GitHub account is not allowed to edit the blog.');
        }
        return reply(res, 'success', { token: tokenJson.access_token, provider: 'github' });
    } catch (e) {
        return fail(res, 'Could not reach GitHub. Please try again.');
    }
}
