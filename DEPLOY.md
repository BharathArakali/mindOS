# mindOS_ — GitHub Pages Deployment

## Step 1 — Create a GitHub repository

1. Go to https://github.com/new
2. Repository name: `mindOS`
3. Set to **Public**
4. Do NOT add README, .gitignore, or license
5. Click **Create repository**

## Step 2 — Push your files

Open a terminal in your `mindOS` folder and run:

```bash
git init
git add .
git commit -m "Initial release — mindOS_"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/mindOS.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

## Step 3 — Enable GitHub Pages

1. Go to your repo on GitHub
2. Click **Settings** tab
3. Sidebar → **Pages**
4. Source: **Deploy from a branch**
5. Branch: `main` / `/ (root)`
6. Click **Save**

GitHub will show your live URL in ~60 seconds:
`https://YOUR_USERNAME.github.io/mindOS/`

## Step 4 — Test PWA install

1. Open the live URL in Chrome or Edge on your phone
2. You should see an **"Add to Home Screen"** prompt
3. Or tap the browser menu → "Install app"

## Step 5 — Run Lighthouse audit

1. Open Chrome DevTools (F12) on your live URL
2. Click **Lighthouse** tab
3. Categories: check **Progressive Web App**
4. Click **Analyze page load**
5. Target: PWA score ≥ 90

## Updating after changes

```bash
git add .
git commit -m "Update: describe what changed"
git push
```

GitHub Pages auto-deploys within ~30 seconds of each push.

## Important notes

- The service worker caches all files after first load
- After deploying updates, bump the version string in `service-worker.js`:
  `const CACHE = 'mindos-v2';` → increment each time
- EmailJS OTP emails will work from the live URL
- Notifications require HTTPS — they won't work on `http://localhost`
  but WILL work on the `github.io` URL
