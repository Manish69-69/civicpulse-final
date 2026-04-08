# CivicPulse – Deployment Guide

## Demo Accounts
| Role    | Email              | Password  |
|---------|--------------------|-----------|
| Citizen | citizen@demo.com   | demo123   |
| Admin   | admin@demo.com     | admin123  |

Citizen portal: `/`  
Admin portal: `/admin.html`

---

## Railway Deployment (Recommended)

### Step 1 – Push to GitHub
1. Create a new repo on GitHub (e.g. `civicpulse`)
2. Unzip this folder, then:
   ```bash
   cd civicpulse
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/civicpulse.git
   git push -u origin main
   ```

### Step 2 – Create Railway Project
1. Go to https://railway.app → **New Project** → **Deploy from GitHub repo**
2. Select your `civicpulse` repository
3. Railway will auto-detect it's a Node.js app

### Step 3 – Add a Volume (for database persistence)
1. In your Railway project, click **+ New** → **Volume**
2. Mount path: `/data`
3. Click the civicpulse service → **Variables** tab

### Step 4 – Set Environment Variables
In the **Variables** tab, add ONLY these two variables:

| Variable     | Value                        |
|--------------|------------------------------|
| JWT_SECRET   | any-long-random-string-here  |
| RAILWAY_VOLUME_MOUNT_PATH | /data          |

> ⚠️ **DO NOT** manually add a `PORT` variable — Railway sets this automatically.
> If you previously added PORT, **delete it now**.

### Step 5 – Deploy
1. Railway will auto-deploy when you push to GitHub
2. Wait ~2 minutes for the build to complete
3. Click the generated `.railway.app` URL to access your app

### Step 6 – Verify
- Visit `https://your-app.up.railway.app` → citizen login should work
- Visit `https://your-app.up.railway.app/admin.html` → admin panel

---

## Common Issues & Fixes

### "This site can't be reached" / DNS error
**Cause:** The app was not listening on `process.env.PORT` or was bound to `localhost` instead of `0.0.0.0`  
**Fix:** This version already fixes both. Make sure you did NOT manually set a PORT variable in Railway.

### "Error creating build plan with Railpack"  
**Cause:** Older versions used Railpack which failed  
**Fix:** This version includes `railway.json` that forces Nixpacks builder

### "Service is offline" after successful build  
**Cause:** App crashed on startup (usually missing env var or wrong PORT)  
**Fix:** Check Deploy Logs in Railway. Ensure JWT_SECRET is set.

### Database resets on every deploy  
**Cause:** No volume attached  
**Fix:** Follow Step 3 to add a Volume mounted at `/data`

---

## Vercel Deployment (Frontend only – NOT recommended for this app)
This app has a Node.js backend with SQLite which doesn't run on Vercel's serverless platform.
**Use Railway for the full app.**

If you must use Vercel for a demo, Railway is still needed for the backend.

---

## Local Development
```bash
cd civicpulse
npm install
node index.js
# Open http://localhost:4000
```
