# TWmeme Chrome Extension — Privacy Policy

Last updated: 2026-05-11

This Chrome extension lets you type `:meme <關鍵字>` inside chat boxes (LINE, Threads, Instagram) to insert a meme from the public TWmeme catalog. It is built and maintained as an open-source side project (https://github.com/u9511112/twmeme).

## What this extension collects

**Nothing personally identifiable.** Specifically:

- It does **not** read or store the rest of your chat input — only the trailing `:meme <query>` pattern, used solely to trigger a meme search.
- It does **not** transmit your chat content, browsing history, identity, location, or any cookies anywhere.
- It does **not** use analytics SDKs, tracking pixels, or A/B testing.

## What network requests it makes

The only outbound requests are to:

- `https://ep-dawn-voice-ao8hd53u-pooler.c-2.ap-southeast-1.aws.neon.tech/sql` — to query the public TWmeme meme catalog (PostgreSQL over HTTPS).
- `https://pub-26dcc45acd9349968b1ee689f0113ee1.r2.dev/memes/*` — to load meme images (Cloudflare R2 public bucket).

These are the same endpoints `https://twmeme.vercel.app/` uses. The connection is read-only by Postgres-level GRANT permissions (the `web_anon` role can SELECT public memes and INSERT anonymous search logs only; it cannot read logs back, cannot modify the catalog).

## What gets logged on the server side

When you complete a search (the overlay actually returns results), the extension inserts a row into TWmeme's `search_queries` table containing:

- The query text you typed after `:meme`
- Whether results were returned (true/false)
- The result count

No IP address, user agent, account identifier, or cookie is sent or stored alongside this row. Logs are used solely to improve catalog coverage (which queries return no results → which memes to add next).

If you'd rather not log queries at all, disable the extension. There is no separate opt-out toggle in v0.0.x.

## What gets stored locally (Chrome Storage)

Starting in W3, the extension may store your last 8 picked memes in `chrome.storage.local` to provide a "recent" carousel. This data:

- Lives only inside Chrome on your device.
- Is never transmitted off your machine.
- Can be cleared at any time by removing the extension or via `chrome://extensions` → TWmeme → "Storage".

## Open source

Source code: https://github.com/u9511112/twmeme/tree/master/extension

You can audit every line. If you find a privacy issue, open a GitHub issue and the author will respond.

## Contact

Questions about this policy: u9511112@gmail.com or via GitHub issues.

## Changes to this policy

If material changes happen (new endpoints, new data collected), this file will be updated and the extension version will bump. The current version is recorded in the published Chrome Web Store listing.
