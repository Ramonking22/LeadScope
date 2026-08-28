# LeadScope

Bulk email extraction for Dimetech Agency.

Paste URLs or text, extract emails and domains, filter results, and export CSV or JSON. Scans persist to your account.

## Try it

Hosted demo: ask Dimeram for the live URL, or open the static files locally for the UI only.

## Accounts

Create an account in the sidebar (email + password, 8+ characters). Results save per user.

Google sign-in is planned. It needs a Google Cloud OAuth client ID/secret for LeadScope users.

## Scanner

- URL fetches run on the server so CORS cannot block them
- Private/localhost URLs are blocked
- Asset-looking addresses (`image.png` as email), `noreply@`, and common noise domains are filtered
- Free plan stores up to 80 emails

## Local UI

```bash
python3 -m http.server 5173
```

The static UI expects the API on the same origin (`/api/register`, `/api/login`, `/api/scan`, `/api/scans`).
