# Ark website: the ChatGPT version

A separate build of the Ark site, edited with ChatGPT, kept here so it can be compared with
the main version (branch `claude/ark-site-v1`). It is not merged with it.

**What this is:** the built site exactly as deployed at
`https://ark-tech-sovereignty.starryfinch16.chatgpt.site` on 10 November 2026, captured file by
file. It is compiled output (HTML, JavaScript chunks, fonts, images), not source code. The
source behind it was not available.

## Run it

Any static file server works. From this branch:

```bash
npx serve site            # or: python3 -m http.server --directory site 8080
```

Open `/`, `/fr/` or `/ar/`. The one-file editions are at `/edition/en/`, `/edition/fr/` and `/edition/ar/`.

On a host that reads Netlify / Cloudflare Pages style headers, `site/_headers` applies the same
Content-Security-Policy and privacy headers as the deployed copy.

## What's in it

- `site/index.html`, `site/fr/`, `site/ar/`: the three languages
- `site/edition/`: the one-file editions
- `site/_astro/`: JavaScript chunks (three.js, the stage and scenes) and IBM Plex fonts, all subsets
- `site/media/`: cover images used by the cinema ribbon
- `site/sw.js`, `favicon.svg`, `apple-touch-icon.png`, `robots.txt`, `_headers`

## Known gaps, as deployed

- Four cover images whose file names contain parentheses (`interstellar_(film).webp`,
  `discovery_(daft_punk_album).webp`, `dune_(novel).webp`, `timbuktu_(2014_film).webp`) fail on the
  live site itself with a redirect loop, so they are missing here too; those tiles show blank.
- `/og.png` (the share image) returns 404 on the live site.
- A Cloudflare bot-check script the host injects (`/cdn-cgi/...`) was left out: it belongs to the
  host, not the site.

## Notes on content

- The cinema ribbon uses real covers of copyrighted films, albums and books (Spirited Away,
  Abbey Road, The Dark Side of the Moon, Random Access Memories, The Grand Budapest Hotel,
  The Little Prince, The Hobbit, Nineteen Eighty-Four), downloaded from Wikipedia. Many are
  non-free images that Wikipedia uses under fair use, which does not extend to a company website
  or to redistribution here. They are included at the owner's request, as deployed; review before
  any public launch.
- This version predates the later changes on `claude/ark-site-v1`: liquid-glass headlines and
  panels, the "Build your own setup" section, section 02 in letters, the الرقمنة timeline title,
  and the blue pixel mosaics.
