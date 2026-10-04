# BYT — Build Your Tomorrow website

Marketing landing page + privacy pages for the BYT mobile app.

## Preview locally

```bash
npx serve website
# open http://localhost:3000
```

## Deploy to GitHub Pages

The marketing site is hosted at:

**https://eshaantrmukku-del.github.io/byt-website/**

Privacy & account deletion (same site):

- **https://eshaantrmukku-del.github.io/byt-website/privacy/**
- **https://eshaantrmukku-del.github.io/byt-website/delete-account/**

### Redeploy marketing site

```bash
# From repo root — copies website/ to a temp dir and pushes to byt-website
./website/deploy.sh
```

Or manually:

```bash
gh auth login   # if needed
gh repo create byt-website --public --source=. --push  # first time only
```

### Optional custom domain

`website/CNAME` is optional. When a custom domain (e.g. buildyoutomorrowcoaching.com) is purchased and DNS is pointed at GitHub Pages, copy that CNAME into the deploy bundle and configure DNS:

- **A records** (apex/root `@`): `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
- **Optional www**: CNAME `www` → `eshaantrmukku-del.github.io`

Until DNS is connected, use the GitHub Pages URLs above as the primary links.
