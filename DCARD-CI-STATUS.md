# Dcard scraper — CI status & path forward

**TL;DR:** Dcard is parked in CI cron. PTT works fine. To resurrect Dcard you
need a residential proxy URL in `scraper/proxies.txt`. Patchright stealth
must NOT be used through any proxy (see "What we proved" below).

---

## Current state (2026-05-11)

- **Cron `Scrape Memes` workflow:** runs PTT only every 4h.
- **Default `platforms` input:** `ptt`. Override via `workflow_dispatch` if
  you have a residential proxy wired up.
- **`scraper/scrapers/dcard.py`:** unchanged from pre-investigation state
  (uses patchright, no proxy bypass tricks).
- **Local dev:** unaffected — running scraper from a non-GH-IP machine
  resolves Dcard fine and patchright handles CF.

## The original problem

GH Actions runners get `ERR_NAME_NOT_RESOLVED` for `www.dcard.tw`. Dcard
geo-blocks GH IP ranges at the authoritative DNS layer (NXDOMAIN, not just
HTTP-level rejection). PTT is not affected; it uses `aiohttp` which goes
through libc.

## Resolution path that actually works

1. Buy a residential proxy with HTTP CONNECT support (Bright Data, IPRoyal,
   Webshare entry tier ~$5/mo).
2. In CI, write its URL to `scraper/proxies.txt`:
   `echo "http://user:pass@host:port" > scraper/proxies.txt`.
3. Add `dcard` back to the workflow `platforms` default.
4. Done. Dcard scrape resumes; CF accepts the residential IP normally.

DO NOT try to make patchright work through any proxy — see attempt 5–8 below.

## What we proved (and what didn't work) — 8 attempts on 2026-05-11

Commits all sit between `4766d20` (last clean state) and `ddb3bd3` (last
plain-playwright attempt). All reverted in the same chore commit that
created this file.

| # | Commit | Approach | Outcome |
|---|---|---|---|
| 1 | `eb43617` | Override `/etc/resolv.conf` to 1.1.1.1 | libc OK; Chromium AsyncDns ignores it |
| 2 | `df4cffd` | `--disable-features=AsyncDns` + `--host-resolver-rules` Chromium flags | Patchright stealth fork strips/ignores them |
| 3 | `7903f6a` | Pin `104.19.x.y www.dcard.tw` in `/etc/hosts` | NSS on runner skipped our IPv4 entry; getent returned only DNS AAAA |
| 4 | `9b5571b` | tinyproxy on 127.0.0.1:8888, Chromium `--proxy-server=…` | DNS resolved (curl probe got CF 403); Chromium got `ERR_TUNNEL_CONNECTION_FAILED` |
| 5 | `5991e3b` | Bump tinyproxy log to expose the rejection | Found smoking gun: patchright sends a magic hostname `patchright-init-script-inject.internal` through the proxy; tinyproxy NXDOMAINs it and tears down the navigation |
| 6 | `f12770e` | Add proxy bypass for `*.internal,localhost,127.0.0.1,::1` | Chromium silently bypassed everything (zero CONNECT in tinyproxy log) |
| 7 | `2dd5696` | Narrow bypass to exact `patchright-init-script-inject.internal` | Same — Chromium still bypassed everything |
| 8 | `ddb3bd3` | Drop patchright for dcard, use plain playwright through tinyproxy | Tunnels established to dcard ✓; CF returned **HTTP 403** to non-stealth Chromium ✗ |

## Key technical facts (don't relearn these)

- **Chromium's built-in `AsyncDns`** ignores `/etc/resolv.conf` overrides AND
  the `--host-resolver-rules` launch flag when launched via patchright.
  Chromium *does* read `/etc/hosts` in some configs, but not reliably under
  the patchright fork.
- **NSS on `ubuntu-latest`** for an entry we appended to `/etc/hosts` did not
  show up via `getent hosts` either — `nsswitch.conf` has `[NOTFOUND=return]`
  semantics that interact badly with our case. Pre-baked entries (like the
  PTT one) work; ours did not.
- **tinyproxy** is the right tool to take DNS off Chromium's hands: it does
  libc DNS, then HTTP CONNECT-tunnels TLS. CF saw real Chromium TLS
  fingerprint just fine when curl probed via it.
- **Patchright's `patchright-init-script-inject.internal`** is the load-bearing
  blocker. It's an in-process magic hostname patchright uses to hook init
  script injection. With ANY proxy in the path, that magic also goes through
  the proxy and fails. There is no Playwright `proxy.bypass` value we could
  find that exempts it without also bypassing the real target.
- **Plain playwright (no patchright)** + tinyproxy = clean transport, but CF
  WAF detects non-stealth Chromium immediately and returns 403.
- **`scraper/proxies.txt` is in `.gitignore`** — write it in CI, never
  commit it.

## When to revisit

- After buying a residential proxy.
- If patchright ships a config option to relocate the magic hostname.
- If we move the scraper off GH Actions (e.g. self-hosted runner with
  residential IP, or a tiny VPS in TW).
