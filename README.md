# LeadScope

Bulk email extraction for Dimetech Agency.

Paste URLs or text, extract emails and domains, filter results, and export CSV or JSON.

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 5173
```

URL scans work best behind a small proxy (`POST /api/fetch`) so CORS does not block them. Without a proxy, the app falls back to a public read-only preview.

## Features

- Scan URLs or pasted text
- Deduped email + domain results
- Search and date filters
- CSV / JSON export and copy
- Optional Supabase sync and Flutterwave upgrade link (keys stay in the browser)

Starter files from February 2026, completed as a working demo.
