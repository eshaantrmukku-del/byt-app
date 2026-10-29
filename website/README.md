# BYT — Build Your Tomorrow website

Marketing page, privacy policy and account-deletion page for the BYT app. Plain static
files, no build step.

Live at **https://eshaantrmukku-del.github.io/byt-website/**

- Privacy policy: https://eshaantrmukku-del.github.io/byt-website/privacy/
- Account deletion: https://eshaantrmukku-del.github.io/byt-website/delete-account/

## Preview locally

```bash
npx serve website
# open http://localhost:3000
```

## Deploy

```bash
./website/deploy.sh
```

Pushes `website/` to the `byt-website` repo and serves it with GitHub Pages.

## Moving to your own domain

1. Buy the domain from any registrar (Cloudflare, Namecheap, Google Domains' successor Squarespace, etc.).
2. Point the site at it:

   ```bash
   ./website/set-domain.sh yourdomain.com
   ```

   This rewrites every absolute link (sharing tags, sitemap, 404 page, the app's privacy and
   deletion links) and creates `website/CNAME`.
3. Deploy with `./website/deploy.sh`. It prints the DNS records to add at your registrar
   (four `A` records for the root and a `CNAME` for `www`).
4. Once DNS has updated (minutes to a few hours), run `./website/deploy.sh` again to switch on HTTPS.
5. Update the privacy policy URL in the Play Console. The old GitHub address keeps working, because
   GitHub redirects it to the new domain.

The app's links change in the next app release; until then the redirect covers them.
