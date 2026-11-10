# Ark — website

The website for Ark. Its motto is **tech sovereignty**. It tells one story in eight scenes:

1. you pay for technology you never really own;
2. Ark puts the hardware in your house;
3. your home keeps working without the cloud;
4. you control it from your phone, in your language;
5. your films, music and books live at home too;
6. the house does what *you* want;
7. and the page itself proves it practises what it says.

It's a static site in **English, French and Arabic** (right to left). It sends **no cookies, no trackers and no requests to other companies**.

Status: first full build, on branch `claude/ark-site-v1`, draft pull request #1. Not deployed yet. See [Before going live](#before-going-live).

---

## Quick start

Needs Node 22.23.4 or newer (Astro 7.4's minimum).

```bash
npm install
npm run dev          # local development server
npm run build        # static site in dist/ (also runs scripts/postbuild.mjs)
npm run preview      # serve dist/ locally
npm test             # unit tests (node:test, no extra packages)
node tests/e2e/run.mjs   # browser tests against dist/ (needs Playwright + Chromium installed)
```

The output in `dist/` is plain static files and can go on any static host.

---

## Before going live

- [ ] **Contact details:** set `email` and/or `whatsapp` in `src/site.ts`. Until then, the contact section says "Contact details are coming soon".
- [ ] **Domain:** replace `https://ark.example` in `astro.config.mjs`. It's used for canonical links, language alternates and the share-image URL.
- [ ] **Share image:** add `public/og.png` (1200 × 630). A screenshot of the hero works.
- [ ] **Timeline sources:** open the four links in *Elsewhere* once in a browser; they were confirmed through search results, not read directly.
- [ ] **Native-speaker review** of the French and Arabic copy in `src/i18n.ts`.
- [ ] **Real devices:** everything was checked in headless Chromium with software rendering. Test on an iPhone (Safari), an Android phone and a laptop before launch.
- [ ] **Hosting headers:** `public/_headers` carries a strict Content-Security-Policy and privacy headers in Netlify / Cloudflare Pages format. On another host, set the same headers there.
- [ ] **Optional textures:** the free Studio Hosqo packs can be added; see [Assets and licences](#assets-and-licences).

---

## The story, scene by scene

Each chapter is a `<section>` in `src/components/Page.astro`. Its text lives in `src/i18n.ts`, and its 3D scene in `src/scripts/gl/`. All text is real HTML, so it is readable, selectable and translatable. The 3D sits behind it on one canvas.

| Chapter | What the visitor sees | Built in |
|---|---|---|
| **Hero** | *Nothing rented. Everything yours*. By day: a pale sky, the Ark mark and its rippling outline drawn in blue ink letters (the letters of *sovereignty*), and the headline in deep-blue liquid glass. Scrolling flies the camera through the mark's window. | `gl/hero.ts` |
| **01 Going digital** (الرقمنة) | *A country going digital, on tools made for somewhere else*. One argument in three beats. **The country:** in 2018 the only submarine cable was cut and Mauritania went offline; the answer was to build (the 2022 national agenda, records online through Houwiyeti in 2025, 800+ procedures on one platform in 2026). **The home:** *the country is building its own; at home, digital life is still rented from far away* (photos on Google Drive, films from Netflix and music from Spotify billed in dollars, an Alexa that speaks Gulf Arabic, not Hassaniya). **The answer:** *progress should reach the light switch, too. Ark is made here, and it runs in your house*. Each fact has an object; the ones that hang from a cloud abroad pour away like sand as they scroll past. | `gl/rented.ts` |
| **02 Yours** | Grains of sand gather into the small machine Ark runs on (sand becomes silicon), then the machine opens into four labelled parts. Drawn in letters, with extra letter exposure for the dark metal. | `gl/device.ts` |
| **03 Offline** | A courtyard house at night under clouds, with blue threads running from its roof mast up into the cloud. *Turn the lights on* (a simulated trip to a server abroad, labelled as simulated), *then cut the cloud and try again*. The threads fall, the clouds clear to stars and a moon, and the house answers instantly. That time is **measured** on the visitor's device. | `gl/night.ts`, `gl/house.ts`, `scripts/main.ts` |
| **04 Control** | The same house seen from above with its roof off, beside a working Ark Home phone mock. It has rooms, AC with temperature, a gate that **asks before opening**, scenes, a live courtyard camera drawn in letters, and its own EN / FR / ع switch. Tapping a room in the 3D house works too. The first time the chapter comes into view, "Arrive home" runs by itself, unless the visitor has already used the phone or the cloud demo. | `gl/night.ts`, Page phone markup, `scripts/main.ts` |
| **05 Cinema** | *Your home cinema. Offline*. A ribbon of generated covers (films, albums, books with invented titles in Latin and Arabic script) flowing along a dune-shaped curve, with Sharkfin, Sharkwave and Sharkink. | `gl/cinema.ts` |
| **06 Your setup** | Morning again. *Build your own setup, tailored to you*. Choose a place (Home, Apartment building, Office, Store): the list shows what Ark does there, and the place itself stands beside it, drawn in letters. Choosing another pours the old one away and the new one takes its place. Plain radio buttons and CSS `:has()`, so the list works without JavaScript. | `gl/places.ts`, Page markup, `site.css` |
| **Start** | *Start with your place*: three offers (Ark Home, Cinema, Installation) and contact. | Page markup |

**The arc.** The page is one day. It opens in daylight (the country, the argument, the machine), night falls as you reach the house (*Cut the cloud* recalls 2018: the cable is cut again, on purpose, and the house keeps working), stays dark for the phone and the cinema, and morning returns for *Build your own setup*. The hero's promise, *nothing rented*, is what chapter 01 sets up (everything at home is rented from abroad) and what chapters 02 to 05 answer one by one.

### Text mode
A **Text mode** switch in the header turns off the 3D and shows the whole story as a calm document, light on mobile data. It is also what visitors without JavaScript or WebGL get, and it is chosen automatically when the browser asks to save data. The interactive parts (cloud demo, phone, setup picker) are plain HTML and still work in text mode.

---

## How the 3D works

- **One canvas, one renderer.** `gl/stage.ts` owns a single full-screen WebGL canvas behind the page.
  - **Chapter selection:** it works out which chapter sits at the middle of the screen and how far through it you are (0 to 1), then renders only that chapter's scene. It fades through black at chapter edges.
  - **Lazy loading:** scenes load only as you approach them; the next one is prefetched.
- **Glyph renderer (`gl/glyphs.ts`).** Two GPU passes:
  1. One pass reads the rendered scene **once per character cell**, measures brightness in six regions of the cell (2 × 3), and picks the letter whose shape matches best. Matching on shape keeps edges crisp. The idea comes from Alec Jacobson's *ascii3d*, re-implemented here for the GPU; no code was copied.
  2. The second pass draws that letter from an atlas, tinted with the scene's own colour.

  The letters are the page's word: *sovereignty* in English, *souveraineté* in French, and *السيادة التقنية* in Arabic. In Arabic the scenes are literally drawn in Arabic letters.
- **Day and night** (`gl/stage.ts`, `site.css`). One number, `--night`, runs from 0 (day) to 1 (night). Chapters marked `data-sky="night"` (the two house chapters and the cinema) pull it to 1; it passes through 0.5 exactly at a chapter seam, where the scenes have faded out anyway. The stage writes it to the shaders and to the page, where every colour token is a `color-mix()` of its day and night value. Ink flips from dark to light quickly around dusk, so text never sits grey on grey. The header's theme button pins night everywhere (remembered per browser). The phone mock is always a night object. Browsers without `color-mix` get the night palette throughout.
- **Three passes** (`gl/glyphs.ts`).
  1. *Cells:* one texel per character cell picks the letter whose shape matches the scene there.
  2. *Base:* the page's paper and everything on it. By day the paper is a pale sky and the scene is blue ink letters; by night the paper is black and letters (or the real 3D image, tone-mapped) give light. Mosaics and the text-side dimming live here. It renders to a mip-mapped target.
  3. *Glass:* liquid glass over the base, then out to the screen. Because the base is a texture with mip levels, glass can read it sharp (refraction) or blurred (frost) for the price of a texture lookup. This replaced a single pass that recomputed letters for every glass sample, and made the night-house chapter about 70% faster in the software renderer used for testing.
- **Liquid glass.** Optics adapted from LiquidGlass's fragment shader (bevel height field, two-surface refraction, dispersion, Fresnel, highlights, inner rim, shadow).
  - **Headlines:** `h1`, `h2`, the closing line and the timeline figures are drawn into a mask whenever something moves (each word with its own scroll-driven opacity and blur, so the focus pull still plays). By day they are stained glass: deep ink blue that shows the sky and letters behind it, darker. By night they are clear glass with a little white for clarity. Figures are blue glass in both. The page keeps the real words (transparent) for selection, search and screen readers.
  - **Panels:** elements marked `data-glass` (the floating header, buttons, the setup choices, the cloud-demo controls) are frosted glass with a soft shadow, white by day and smoky by night; blue ones are blue glass. They swell a little on hover and give when pressed.
  - **Light:** the highlight on all glass leans toward the pointer.
  - **Seams:** where one chapter meets the next, a band of fluted glass (vertical rounded bars that refract what's behind them) crosses the screen. The model follows the FlutedGlass effect in the shaders library, rewritten in GLSL.
- **The glass ripples (hero).** One shader on a plane behind the mark. The mark's silhouette is the union of two convex blocks; taking the mitred distance to each block (the furthest of its edge lines) and the nearer of the two gives offsets that keep the steps and the chamfer sharp at every size. Bands of that distance flow outward over time, with a slow liquid wobble. Each band is shaded as a rounded glass tube: Fresnel rims, a highlight from the top left, and dispersion (red, green and blue see the tube slightly wider or narrower, so its edges fringe). Letters need more light than eyes, so the ribbons are wide and bright and the outer ones fade early, keeping the headline side readable. Each chapter can set its own letter exposure (`gain`); the hero uses 2.2.
- **Readable letters.** Besides the page's word, the atlas has strokes (`- | / \\ _ : = #`), so edges and outlines are drawn as lines and silhouettes read as shapes. Very dim cells stay empty for a quieter background. Cells are 8 × 14 px (10 × 16 in Arabic).
- **A little blue.** Letters lean slightly toward Apple blue in a slow drift across the screen, and about one in sixteen is fully blue.
- **Pixel mosaics.** A few small clusters of square tiles in four blues (baby blue `#89cff0`, cyan `#64d2ff`, Apple blue `#2997ff`, deep blue `#0071e3`) sit in the background. They drift slowly, twinkle, and scroll at half the page's speed. They appear only where the scene is dark, so they never cover objects or letters, and mostly on the scene's side of the screen, away from the words. They're kept sparse on purpose: a couple of clusters per screen.
- **Crumbling.** The "pour away" effect shifts each column of character cells downward at its own speed and scrambles the letters as they fall. It costs almost nothing.
- **Phone camera feed.** The courtyard is rendered from a second camera into a tiny target and run through the same glyph pass. It refreshes every 150 ms, only while the phone is on screen, and is drawn into the phone's canvas from the same atlas.
- **Comfort and speed:**
  - resolution adapts to the frame rate;
  - nothing is drawn while no chapter needs a scene, and browsers pause the loop in hidden tabs;
  - device pixel ratio is capped;
  - `prefers-reduced-motion` freezes scene time and turns off the text focus effect.
- **Fallbacks:** no WebGL 2, or an error while starting the stage, switches to text mode instead of breaking.

---

## The house model

The house is modelled in code (`gl/house.ts`) as a Sahel courtyard house:
- **Walls and roof:** thick plaster walls with softly bevelled edges, a back block of living room, bedroom and kitchen facing a tiled courtyard, and a roof terrace whose parapets have **stepped crenellations**, as in the old Adrar towns.
- **Openings:** recessed windows with frames, sills and open wooden shutters; doors with frames; a lamp over each door.
- **Outside:** an outside stair to the terrace, a stair house, a water tank on legs, solar panels, an AC unit with a fan that spins when the AC is on, and a mast with a dish (the cloud threads start here).
- **Courtyard and interiors:** courtyard walls with crenellations, a two-leaf barred steel gate that swings open, a pedestrian door, a date palm, planters, and a shade sail over floor seating with cushions and a striped rug. Inside: low seating along the walls with cushions and a rug, a TV, a bed and wardrobe, kitchen counters and a fridge.
- **Generated textures:** the tile and rug patterns are drawn in code, nothing downloaded. They use terracotta, cream, indigo and red, in the spirit of hand-painted walls rather than copying any motif.
- **Light:** moonlight casts shadows. Each room has its own warm light; its windows glow when the room's light is on and spill light onto the courtyard.
- **Efficiency:** static parts are merged into one mesh per material, so the many small pieces (crenellations, stair steps, palm fronds) draw as a few meshes. Moving or tappable parts stay separate: gate leaves, fan, window glass per room, the roof layer that hides in the top-down view, and one floor per room for tapping.

**Why not `ARK.glb`** (the model the Ark Home app renders): it is an office interior exported from Sweet Home 3D, with office chairs, toilets, cabinets and stairs. It contains a third-party "MamaGreen" logo, and it would publish a real floor plan on a public site.

---

## Design

The direction came from the owner's requests: a cool, edgy site, not literally a gallery; Apple-blue accent; text that comes from blurred to sharp as you scroll; no "AI-looking" cards; Mauritanian identity subtle, never on the nose. It also follows the **unslop** review rules.

- **Colour:** two palettes from one ramp, blended by time of day.
  - **Day:** sky `#b0daff` easing to paper `#f6faff`, ink `#0e2439`, secondary `#41566b`, muted `#5c7084`, hairlines at 12% ink. **Night:** background `#000`, text `#f5f5f7`, secondary `#a1a1a6`, muted `#86868b`, hairlines at 10% white. The day sky is a tone shift inside one hue, kept to the scene; chrome stays neutral.
  - **One accent:** Apple blue. As ink it is `#0068d6` by day (5.3:1 on the paper) and `#2997ff` by night; filled buttons are `#0071e3` with white text in both.
  - Blue is used rarely: primary buttons, chapter numbers, the big fact years, selection, glass buttons and timeline figures, markers, a subtle drift in the letters, the status light on the device, and the network threads.
  - Warm amber exists only as **light inside the 3D** (lit windows), never in the interface.
- **Type:** IBM Plex Sans, IBM Plex Sans Arabic and IBM Plex Mono, self-hosted.
  - Huge editorial headlines (up to 124 px, tight tracking in Latin; Arabic keeps normal spacing and taller lines).
  - Weights 400/500, sentence case, and no final period on headlines (a unit test enforces this).
- **No cards.** Text sits directly on the scene. Legibility comes from thinning the letters and dimming the image on the text side (inside the compositor, under the glass) and a soft halo behind copy, not boxes.
- **Focus pull.** Headline words, then paragraphs, come into focus as they scroll in and soften as they leave.
  - Pure CSS scroll timelines: no JavaScript cost.
  - Browsers without scroll timelines get a one-time version driven by an IntersectionObserver.
  - Off for reduced motion and in text mode.
- **Layout:** the scene owns one half of the screen and the text the other, mirrored for Arabic. On phones the scene sits above and the text low on the screen.
  - A quiet chapter rail on the edge shows where you are and hides over the hero.
- **Motion:** one easing curve (`cubic-bezier(0.22, 1, 0.36, 1)`); only colour, opacity, transform and filter animate.
- **Mauritania, subtly:** nothing is labelled.
  - **Rings:** the concentric rings of the Eye of the Sahara (Richat Structure), echoed by the glass ripples around the mark in the hero.
  - **Sand to silicon:** sand becoming the hardware.
  - **Stars:** the cleared sky over the house; Saharan caravans steered by the stars.
  - **The house:** Adrar-style crenellations, the date palm, and courtyard living with floor seating.
  - **Arabic:** a first-class voice, down to the letters the scenes are drawn in.
  - **Footer:** the coordinates of the Richat rings as a quiet easter egg, `21.12° N · 11.40° W`.
- **The mark** was rebuilt from the app icon: two identical chamfered L shapes, each the other turned 180°, locking around a 2:1 window. The polygons live once in `src/mark.ts` and feed the SVG logo, the 3D chrome mark, the favicon, the touch icon and the text-mode drawing (the mark written in its own word).

---

## Privacy, offline, security

- **No third parties.** No CDNs, no Google Fonts, no analytics, no cookies. Fonts, scripts and everything else are served from the site itself. The hero's counter shows this live.
- **Offline copy, only on request.** "Keep this site on this device" (a footer link) registers `public/sw.js`, which downloads the site file list written at build time by `scripts/postbuild.mjs` (44 files at the last build). It then serves from the device first and refreshes in the background. A second press removes it all.
- **One-file edition.** `/edition/en/`, `/edition/fr/` and `/edition/ar/` are complete, self-contained HTML files: inline CSS, system fonts, no scripts, no requests. They download as `ark-en.html` and so on.
- **Headers** (`public/_headers`):
  - Content-Security-Policy restricted to the site's own origin, with no inline scripts (Astro is set to emit scripts as files);
  - `Referrer-Policy: no-referrer`;
  - `nosniff`;
  - a restrictive Permissions-Policy;
  - COOP.
- **External links** (fact sources) open with `noreferrer noopener`.
- **Names kept off the site.** The build fails if the output ever contains "Jellyfin" or "Home Assistant" (`scripts/postbuild.mjs`, also checked by a unit test).

---

## Languages

- **Copy:** all words live in `src/i18n.ts`, in English, French and Arabic. Change copy there; the pages pick it up. A unit test fails if any language is missing a key or has an empty string.
- **Routes:** `/` (English), `/fr/`, `/ar/`. Arabic pages get `dir="rtl"` and the layout uses logical CSS properties, so everything mirrors, including the 3D composition, the rail and the phone.
- **Phone mock:** it has its own language switch to show the app in all three languages and both directions without leaving the page.
- **Mixed text:** numbers and mixed-direction values that must stay left to right (like "364 KB") are marked so.

---

## Content and claims

The eight sourced facts in *Going digital* (two bridge lines between them carry no claim and no source):
- **2018:** the only submarine cable linking Mauritania to the internet (ACE) was cut near Nouakchott; the country was offline for almost 48 hours. [Fortune](https://fortune.com/2018/04/09/mauritania-cable-break-internet), citing Dyn's measurements.
- **2022:** Mauritania adopted its *Agenda national de transformation numérique 2022–2025*. [UN-ESCWA's national plans repository](https://andp.unescwa.org/plans/1516).
- **2025:** since March 2025, criminal records can be requested online through Houwiyeti, the national identity app, which already handles civil-status documents. [We Are Tech](https://www.wearetech.africa/en/fils-uk/news/public-management/mauritania-digitizes-criminal-record-access-launches-online-service), relaying the Ministry of Digital Transformation.
- **2026:** more than 800 administrative procedures gathered on one online platform. [Managers.tn, 21 Feb 2026](https://managers.tn/2026/02/21/mauritanie-plus-de-800-demarches-administratives-desormais-centralisees-et-numerisees/).
- **15 GB:** Google Drive is free up to 15 GB, then a monthly subscription. [Google One plans](https://one.google.com/about/plans). Whether Google One is sold in Mauritania could not be confirmed, so the copy doesn't claim a local price.
- **$7.99:** Netflix's standard plan in Mauritania, in US dollars. [World Price Index](https://worldpriceindex.org/subscriptions/netflix), which collects Netflix's own regional pricing pages (observed June 2026). **Check this one from Mauritania:** Netflix shows prices by the visitor's location, so it can't be confirmed from here, and other lookups returned different figures (the ChatGPT version says US$2.99 to US$9.99).
- **$3.29:** Spotify Premium Individual on Spotify's own Mauritania page, in US dollars. [Spotify](https://www.spotify.com/mr-en/premium/).
- **2021:** Alexa learned Arabic in the Gulf dialect, launched for Saudi Arabia and the UAE; Hassaniya is not among its languages. [Amazon Science](https://www.amazon.science/latest-news/how-alexa-learned-arabic).

GDP and bank-account statistics were drafted and then removed at the owner's request; the chapter is about digitalization (الرقمنة), not economics.

How they were checked: this environment couldn't open those pages directly (its network blocks them), so each fact was confirmed through search results quoting them, several independent ones where available. **Open each link once before launch.** One idea was dropped: "speech recognition doesn't cover Mauritania" turned out to be false, because Google's speech service lists Arabic (Mauritania). Government internet shutdowns were deliberately left out as politically sensitive for a Mauritanian company.

Brands are not named on the page; the facts are described generically and linked.

**Other rules followed:**
- No claims that couldn't be checked (no "no subscription", no device counts).
- The cloud latency is labelled *simulated*; the local one is *measured*.
- The media apps are introduced as *Sharkfin*, *Sharkwave* and *Sharkink*, the names on the owner's home screen.
- Film, album and book covers are generated, with invented titles: no real posters, no rights issues.

---

## Assets and licences

| Asset | What it is | How it's used |
|---|---|---|
| **ascii3d** (Alec Jacobson) | C++ tool that ray-traces meshes into ASCII in a terminal. **No licence file.** | Its idea (matching glyph shapes) was re-implemented on the GPU; no code copied. The owner reports the author supports the project. Ask him for written permission or a licence file before launch. Credited in the footer. |
| **unslop** (Damir Sokolovsky) | An AI design-review skill, CC BY 4.0 | Used as the design rulebook: one accent, no cards or glows, sentence case, no trailing periods, 4px grid, one easing curve. Credited in the footer. |
| **ponytail** (Dietrich Gebert) | MIT "write less code" rules for agents | Used as the engineering rulebook: native scrolling and controls, no animation or smooth-scroll libraries, one stylesheet, reuse of three.js add-ons, tests for non-trivial logic. Credited in the footer. |
| **LiquidGlass** (@ybouane) | MIT library that renders glass panels over HTML by screenshotting the page into its own WebGL context | **Its optics are used, its runtime isn't.** The glass maths (bevel, refraction, dispersion, Fresnel, highlights, rim) was ported into the site's own composite shader, so it refracts the live 3D scene with no page capture, no second WebGL context and no extra download. Notice in `THIRD_PARTY_NOTICES.md`; credited in the footer. The repo states "MIT" without a copyright name, so the notice names the author by handle. |
| **shaders** (Shader Effects Inc.) | MIT library of 200+ WebGPU effects | **Used as a model, not bundled.** It targets WebGPU, so shipping it would need a second rendering path. Its `FlutedGlass` effect (repeating rounded bars that refract, with a highlight per bar) was rewritten in GLSL for the chapter seams. Notice in `THIRD_PARTY_NOTICES.md`; credited in the footer. |
| **The ChatGPT version** (branch `claude/chatgpt-version`) | The owner's own edit of an earlier build | **Adopted:** the light sky look (now the story's daytime, with night kept for the house and cinema), the dark toggle, the Houwiyeti fact, and the line *progress should reach the light switch, too*. **Not adopted:** the service cards, real film and album covers, uppercase labels and bold weights, and hedging copy. Its Netflix price and Google One claim could not be confirmed, so the page keeps the cautious wording. |
| **designeer.xyz** | Curated directory of design-engineering resources | Inspiration only. It answered 403 Forbidden even with its host allowed, so nothing was read or taken from it. |
| **Studio Hosqo** (Gumroad) | Free packs: 40 gradient maps, 20 glass-distortion textures, a displacement map, a MacBook mockup. Paid (US$5 each): Gradient Maps Vol. 1/2, Mixed Texture Pack, Mockup Pack 1. | **Not added yet.** Free Gumroad products still need a checkout with your email, which wasn't done on your behalf. Only Mockup Pack 1 states commercial use. To add them, download the packs and export what's needed as PNGs (the glass and displacement packs are Photoshop files), for example the gradients as small PNG strips. Natural uses are colour grading per scene, the glass refraction and the crumble. |
| **reactdrop.dev** | Couldn't be reached | Dropped at the owner's request. |
| IBM Plex fonts | SIL Open Font License | Self-hosted through `@fontsource`. |
| three.js | MIT | The 3D engine and its add-ons (RoundedBoxGeometry, MeshSurfaceSampler, RoomEnvironment, BufferGeometryUtils). |

---

## Project structure

```
astro.config.mjs        site URL (placeholder), CSS inlined, scripts kept as files
THIRD_PARTY_NOTICES.md  licence notice for the LiquidGlass optics
public/
  _headers              CSP and privacy headers (Netlify / Cloudflare Pages format)
  sw.js                 offline copy, installed only on request
  favicon.svg, apple-touch-icon.png, robots.txt
scripts/postbuild.mjs   writes the offline file list; fails on banned names
src/
  i18n.ts               every word, in en / fr / ar
  site.ts               contact details, footer coordinates
  mark.ts               the Ark mark's geometry (single source of truth)
  components/
    Page.astro          the whole page for one language
    Words.astro         headlines split into words for the focus pull
    Mark.astro          SVG logo
  pages/
    index.astro, fr/, ar/      the three languages
    edition/[lang].astro       the one-file editions
  styles/site.css       the only stylesheet: tokens, layout, modes, motion
  scripts/
    main.ts             mode switch, focus-pull fallback, rail, cloud demo, phone, offline copy
    home.ts             the demo house state shared by 3D and interface
    ledger.ts, ledger-core.ts   the hero's live count of requests to other companies
    gl/
      stage.ts          renderer, chapters, glass panels and headline mask, seams, markers, camera feed, adaptive resolution
      glyphs.ts, glyph-math.ts  the GPU glyph renderer and the liquid-glass compositor
      hero.ts, rented.ts, device.ts, night.ts, cinema.ts, places.ts   the scenes
      house.ts          the courtyard house
      util.ts, types.ts
tests/
  unit/logic.test.mjs   mark, ledger, glyph maths
  unit/copy.test.mjs    translations complete, no empty strings, no banned names, no headline periods, built output clean
  e2e/run.mjs           browser checks against the build
```

About 4,000 lines of source in total.

---

## Tests and checks

- **Unit tests** (`npm test`): 8 tests, **all passing** at the last run.
  - The mark's halves are exact 180° turns, with an open window and cut corners.
  - The text-mode mark is written in its word.
  - The ledger counts other companies and only Ark's bytes, ignoring `data:` URLs.
  - The glyph shape vectors pick the right letter for darkness, edges and brightness.
  - All three languages have every key, with no empty strings, no banned names and no headline periods.
  - The built site is clean.
- **Build check:** `npm run build` fails on banned names.
- **Browser tests** (`node tests/e2e/run.mjs`): written to check
  - each language for console errors, zero third-party requests and correct `lang`/`dir`;
  - the cloud demo (simulated, then measured);
  - the gate asking before it opens;
  - text mode hiding the stage;
  - nothing installed before the visitor asks, then the offline copy opening with the network off;
  - no-JS rendering, and the one-file edition having no scripts or external files;
  - the lens being gone, headlines painted as glass while the words stay in the page, and the setup picker switching places.

  **All 31 checks passed** on the last run. In this headless browser the GPU is emulated in software (under one frame a second in the night-house chapters), so the runner scrolls instantly and gives clicks up to two minutes to see steady frames; one earlier run still timed out on a wait. The runner owns its preview server (`--ignore-lock`, its own process group).
- **Visual review:** every chapter was screenshotted in headless Chromium at desktop (1440 × 900), phone (390 × 844) and in Arabic, and reviewed after each change. Those runs showed no console errors and **no third-party requests**.

---

## Sizes (last build)

| File | Size |
|---|---|
| HTML per language (CSS inlined) | ~57 KB (en), ~59 KB (ar) |
| Main script (interface, demos, ledger) | ~14 KB |
| 3D stage incl. three.js (loaded after first paint) | ~595 KB raw, ~150 KB gzipped |
| Scenes, each loaded when reached | hero 2 KB, rented 3 KB, cinema 4.5 KB, device 7.5 KB, night + house 19 KB |
| One-file edition | ~8.5 KB |

In the test browser, the page had downloaded roughly 320–360 KB from Ark by the time a visitor reached the end (measured before this round's changes). Real numbers depend on the host's compression.

---

## How it was built: decisions and fixes, in order

1. **Concept, before any code.**
   - The owner's assets were researched.
   - Sources were gathered on bricked devices, revocable "purchases", local-first software, the Open Home Foundation's principles, digital sovereignty, Chinguetti's family libraries, the Richat Structure, Oualata's painted houses and Saharan star navigation.
   - Award winners were studied (Igloo Inc, Site of the Year 2024; abeto's *Messenger*).
   - A first "gallery in six rooms" concept was revised into this eight-scene story after the owner asked for something edgier, subtle on Mauritania, and Jellyfin / Home Assistant never mentioned.
2. **Environment.** To read designeer.xyz, the Studio Hosqo store and reactdrop.dev, a personal cloud environment named `arkhome-swift` was created, adding only those hosts to its network allowlist. The Gumroad store could then be read; the other two could not.
3. **First build.**
   - Astro static site, copy in three languages, the logo rebuilt from the icon.
   - Text mode as the default layout, so no-JS visitors get a document, and the cinematic layout only when scripting is on.
   - The GPU glyph renderer, five scenes, the phone mock, the rule poster, the ledger.
4. **Bugs found in the first screenshots and fixed:**
   - The lens's default position was projected before the camera matrices existed. The division by zero produced NaN, which also cancelled the glyph mix. The stage now updates camera matrices before projecting and ignores non-finite values.
   - Glyph indices were written as `(index + 0.5) / 255` into an 8-bit texture, which can round to the next letter. They are now stored exactly as `index / 255` and rounded on read.
   - The glyph atlas measured coverage from the alpha of white-on-transparent text, which loses anti-aliasing. It now uses white on black and reads the red channel, and atlas sampling is clamped so letters don't bleed into neighbours.
   - Fact spacing broke on a CSS specificity clash, the cloud in *Rented* read as a second object (now dimmed to a ghost), and bright surfaces collapsed to one dense letter (a gain control now spreads the alphabet).
5. **The owner's feedback round:** "no AI-looking cards, text from blurred to clear, Apple blue, cooler, a better house."
   - Cards were removed.
   - The scroll-driven focus pull and Apple blue were added, with bigger editorial type, the chapter rail and blue numerals.
   - The boxy house was replaced by the modelled courtyard house with moon shadows.
   - The night was relit and reframed, so the camera sees over the courtyard wall to the facade.
   - "Arrive home" now plays itself on first view of *Control*.
6. **Second review fixes:**
   - chrome inside the lens toned down (it was blown out);
   - the rail hidden over the hero and reduced to the current chapter;
   - "364 KB" stopped flipping to "KB 364" in Arabic;
   - a soft text shadow added for copy over the lit house on phones.
7. **Finishing:**
   - opt-in offline copy, one-file editions, security headers, icons from the mark geometry;
   - unit tests, the build check, the browser test;
   - committed as `59fed5d` and pushed once the Claude GitHub App had access;
   - draft pull request #1.
8. **Second feedback round:** "the square should be smaller and liquid glass; holding it should expand it and turn everything 3D, pressing again turns it back; the timeline should talk about Mauritania's digitalization and Western services not made for Mauritanian users."
   - The lens became a smaller liquid-glass piece with hold-to-flood and press-to-return.
   - The timeline was rewritten around Mauritania, in three languages, with new objects.
   - The browser test was fixed and extended, and passes in full for the first time.
9. **Third feedback round:** "remove the square; headlines in liquid glass, a bit white for clarity; more liquid glass elements and subtle glass transitions; subtle blue in the letters; more readable shapes; the timeline about Mauritania's digitalization and foreign services from Google Drive to Netflix, Spotify and Alexa; replace 06 and 07 with *build your own setup*", then "no GDP; section 02 in letters".
   - The lens and hold-to-flood were removed.
   - Headlines, the header, buttons and choices became liquid glass; chapter seams pass as a faint glass rod.
   - Stroke glyphs, smaller cells and a quieter background make shapes read; a subtle blue drift runs through the letters.
   - The timeline now covers 2018 to 2026 and the four services, with eight objects; no GDP or bank statistics.
   - Sections 06 (rule builder) and 07 (proof) became *Build your own setup*; the offline copy and one-file edition moved to quiet footer links.
   - Section 02 is drawn in letters.
10. **Pixel mosaics:** "pixel mosaics in shades of blue, baby blue, cyan and Apple blue for background elements, but not a lot". A first pass covered too much and sat behind the words, so the second has fewer, smaller clusters on the scene side only.
11. **Fourth round:** "look into the ChatGPT work and the previous work, create and improve; if the narrative doesn't make sense, make it make sense; use the tools from the repositories".
   - **Story:** chapter 01 became one argument (the country builds its own; the home still rents; Ark answers), in chronological order with two bridge lines; *Cut the cloud* now recalls 2018; the page became one day, with night for the house and cinema.
   - **Look:** ChatGPT's light sky merged with the glass: day and night palettes blended by the story, stained-glass headlines by day, frosted panels with shadows, a theme button.
   - **Glass:** rebuilt as three passes, with real frost from mip levels, pointer-following light and fluted-glass seams; about 70% faster in the test renderer.
   - **Setup:** the chosen place now stands beside the list, drawn in letters, and pours away when another is chosen.
   - **From the repos:** LiquidGlass optics (extended with shadow and frost), the shaders library's FlutedGlass model, unslop's rules (sentence case, two weights, one accent, quiet chrome, no hue gradients on chrome, "let a few cells change slowly" from its glyph notes) and ponytail's (native controls, one stylesheet, one easing).
   - **Fixed on the way:** glass headlines were misplaced on phones (the text mask's texture kept its first size when resolution adapted); mosaics no longer land on a real 3D image.
   - Found on the way: clearing a multisampled render target doesn't update its texture, so sections without a scene showed a stale cinema frame (now an empty render); and the page's scrim had been dimming the glass (now inside the compositor).

12. **Fifth round:** "study the ChatGPT version, I'm very fond of it; learn from both". What it does better, and what was taken from it:
   - **Solid, bold headlines.** By day, headlines are weight 700, crisp dark ink drawn by the page itself. Liquid glass takes over only at night, where it reads well on dark. (The earlier day glass was soft and weaker.)
   - **A vivid sky at the top only**, easing to clean white paper below; night is deep navy `#061322`, not black.
   - **The four services as one group**: *Today: Global services. Local compromises*, four cards (Google Drive, Netflix, Spotify, Alexa) you can scan at once, while their objects take turns beside them.
   - **Details:** uppercase chapter labels, a header that steps aside while reading down and returns on the way up, a labelled Dark button, the current language as a pill, a footer on its own surface, and real titles in the cinema (on generated covers; no artwork is copied).
   - **Kept from this version:** night for the house and cinema, the setup scene, the story order, sourced figures only.
   - These choices override some of the unslop rules used earlier (no cards, sentence-case labels, weights up to 600): the owner's preference wins.
---

## Known limitations and next steps

- **Not yet tested on real phones or in Safari.**
  - All checks so far ran in headless Chromium with software rendering, which is slower than real GPUs.
  - Check frame rate, the camera-feed readback, and the scroll-driven focus pull: Safari 26 supports scroll timelines; older Safari gets the fallback.
- **Accessibility:** structure, focus styles, reduced motion, text mode and labelled controls are in place; glass headlines keep their real words in the page. A full audit (screen reader pass, keyboard path through the phone mock and setup picker, contrast of glass text over busy scenes) is still to do.
- **Speed on real devices:** still unmeasured on real hardware. In the software renderer used here, the night-house chapter runs at about 1.4 frames a second (2.3 before any glass, 0.85 with the first glass, 1.4 after the three-pass rebuild); a software renderer overstates the cost, and the adaptive resolution lowers the render size when frames are slow. Check on a mid-range phone.
- **Before launch:** contact details, domain, share image and native review (see [Before going live](#before-going-live)).
- **Optional:** add the Studio Hosqo free packs; add a WebGPU layer with the `shaders` library; a Mauritanian artist collaboration for the house patterns; real photography or footage if wanted later.

---

## Credits

- **Type:** IBM Plex Sans, IBM Plex Sans Arabic and IBM Plex Mono, SIL Open Font License
- **3D:** three.js, MIT
- **Glyph rendering** after ascii3d by Alec Jacobson, with his support
- **Liquid glass** after LiquidGlass by @ybouane, MIT
- **Fluted glass seams** after the shaders library by Shader Effects Inc., MIT
- **Design review:** unslop by Damir Sokolovsky, CC BY 4.0
- **Engineering approach:** ponytail by Dietrich Gebert, MIT
