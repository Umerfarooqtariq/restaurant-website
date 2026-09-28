# Restaurant website

Public restaurant website and a private admin page. Visitors read the menu, gallery, about, and contact pages, then place an order by phone or WhatsApp. There is no cart, checkout, or online payment. The owner updates dishes, photos, hours, and contact details from `/admin` without editing code.

Contact details are entered in admin. This repository does not contain a phone number, street address, map pin, admin username, password, or session secret.

## Features

Public site

- Home, Menu, About, Gallery, and Contact
- Hero with the restaurant name, a short introduction, View Menu, and Order Now
- Category shortcuts and featured dishes
- Menu with category filters, more than one price option per dish, featured dishes, and unavailable dishes
- Order Now opens a call link and a WhatsApp message. A dish page can include that dish in the message
- Mobile bar with Call and WhatsApp, and a desktop Order Now button
- Gallery masonry with a lightbox (previous, next, close, and keyboard)
- Contact page with hours, directions, and a map only when a real Google Maps embed is saved
- Footer with links, contact, and hours
- Page titles, meta description, Open Graph, canonical URL, sitemap, and Restaurant structured data
- Layout that respects reduced motion

Admin

- Sign-in at `/admin/login`, then the dashboard at `/admin`
- Server-side protection for `/admin`. The admin link is not in the public navigation
- HttpOnly session cookie, signed with `SESSION_SECRET`, expiring after 8 hours
- Password stored only as a bcrypt hash. The password is never sent to the browser or saved in the repository
- Rate limit on failed sign-ins, logout, and checks that block cross-site writes
- Edit restaurant details, about text, hours, contact, map, social links, menu, gallery, logo, and hero image
- Add, edit, delete, and reorder categories and dishes. Deleting a category asks for confirmation when it still has dishes
- Flexible prices, featured flag, and available flag
- Upload, replace, and delete JPG, PNG, and WebP images, with a size limit and a file-type check. SVG files are rejected
- Forms show save, cancel, loading, success, and error states

## Technologies

- [Astro 4](https://astro.build/) for the public pages, built as static HTML
- React 18 for the menu filter, gallery lightbox, and admin screens
- TypeScript and Zod for validation
- Netlify for hosting, Functions for the admin API, and an edge function that guards `/admin`
- JSON files in `data/` instead of a database
- bcryptjs for the password hash
- GitHub Contents API so a production save becomes a normal git commit

## Project structure

```text
data/                      restaurant, menu, gallery, and settings JSON
public/images/             logo, hero, menu, and gallery images
src/pages/                 Home, Menu, About, Gallery, Contact, admin
src/admin/                 Admin screens
src/components/            Header, footer, hero, menu, gallery
shared/                    Validation, sessions, phone and price formatting
netlify/functions/         Admin API and file or GitHub storage
netlify/edge-functions/    Blocks /admin without a valid session
tests/                     Content, session, and API checks
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Public site only, at `http://localhost:4321`. Saves do not work |
| `npm run dev:cms` | Site plus admin API, at `http://localhost:8888` |
| `npm run build` | Static build in `dist/` |
| `npm run preview` | Preview the build |
| `npm test` | Run the content, session, and API tests |
| `npm run hash-password -- "a-long-password"` | Print a bcrypt hash. Use at least 10 characters |

## Local setup

```bash
npm install
copy .env.example .env
npm run hash-password -- "a-long-password"
npm run dev:cms
```

Put the hash in `ADMIN_PASSWORD_HASH` inside `.env`. Open `http://localhost:8888/admin/login`.

On this computer, `netlify dev` writes `data/*.json` and `public/images/`. The browser never writes those files.

## Environment variables

Set these in `.env` for local admin, and in Netlify for a deployed site. Do not prefix them with `PUBLIC_`. Do not commit `.env`.

| Name | Purpose |
| --- | --- |
| `SITE_URL` | Public site URL used for canonical links and the sitemap |
| `ADMIN_USERNAME` | Sign-in name |
| `ADMIN_PASSWORD_HASH` | bcrypt hash from `npm run hash-password` |
| `SESSION_SECRET` | Signs the session cookie. Use at least 8 characters; longer is safer |
| `GIT_PROVIDER_TOKEN` | GitHub token with contents read and write on this repository |
| `GIT_REPOSITORY` | `owner/repository` |
| `GIT_BRANCH` | Branch Netlify builds, usually `main` |
| `PERSISTENCE` | Optional. Set to `github` to test GitHub saves from `netlify dev` |

Leave `PERSISTENCE` unset locally so saves stay on this computer.

## Deploy on Netlify

1. Import this repository in Netlify.
2. Build command: `npm run build`. Publish directory: `dist`. Node 20.
3. Add the environment variables above, including a GitHub token that can write to this repository.
4. Redeploy, then sign in at `https://YOUR-SITE/admin/login`.

A save in production commits the JSON or image. Netlify rebuilds from that commit, and the public pages update after the build, usually within about a minute. Without the GitHub token, the live admin can read content but cannot save.

## Data files

| File | Contents |
| --- | --- |
| `data/restaurant.json` | Name, tagline, address, phone, WhatsApp, hours, map, logo, hero, about |
| `data/menu.json` | Categories, dishes, prices, featured, and available |
| `data/gallery.json` | Gallery photos, titles, and alt text |
| `data/settings.json` | Open or closed, currency, SEO, WhatsApp message text |
| `public/images/` | Image files. JSON stores the path, not the file itself |

Empty fields and values ending in `_HERE` are hidden on the public site. A missing price is shown as "Price to be added", not as zero.

## What stays out of git

- `.env` (username, password hash, session secret, GitHub token)
- Phone number, WhatsApp number, street address, and map coordinates
- Menu-card images that print a phone number or street address
- `node_modules/`, `dist/`, and `.netlify/`

Add the real contact details from the admin contact page after deploy, or keep them only in your local `data/restaurant.json` and do not commit that change.

## Undo a production edit

Admin saves are git commits whose messages start with `CMS:`. Revert that commit and push. Netlify rebuilds the previous content.
