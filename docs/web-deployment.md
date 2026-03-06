# Web app: build and deployment

Your app is already set up for web (`app.json` has `web.output: "static"`). Use these steps to build and ship it.

---

## GitHub Pages (Option B – recommended, automated)

The repo includes a workflow that builds and deploys the web app to GitHub Pages on every push to `main`.

### 1. Repository secrets

The workflow uses **`SUPABASE_URL`** (you already have this) and **`SUPABASE_ANON_KEY`**.

- **SUPABASE_URL** – already in your repo secrets; no change needed.
- **SUPABASE_ANON_KEY** – add this if you don’t have it: **Settings → Secrets and variables → Actions → New repository secret.**  
  Use your Supabase **anon (public) key** from the Supabase dashboard (Project Settings → API → `anon` `public`). This is not the same as `SUPABASE_SERVICE_KEY` (the service role key must stay secret and is not used for the web app build).

### 2. Enable GitHub Pages from Actions

In the same repo: **Settings → Pages.**

Under **Build and deployment**:

- **Source:** choose **GitHub Actions** (not “Deploy from a branch”).

Save. You do not need to pick a branch or folder when using Actions.

### 3. Push to trigger the first deploy

Push your code to the `main` branch (or merge a PR into `main`). The workflow **Deploy web to GitHub Pages** will run: it installs deps, runs `npm run build:web`, and deploys the `dist` folder to Pages.

- **Workflow runs:** **Actions** tab → **Deploy web to GitHub Pages**.
- **Live site:** after the run succeeds, the URL is shown in the job summary and is usually:
  - `https://<your-username>.github.io/<repo-name>/`

### 4. Supabase redirect URL

In **Supabase Dashboard → Authentication → URL configuration**, add your GitHub Pages URL to **Redirect URLs**, e.g.:

- `https://<your-username>.github.io/<repo-name>/`

### 5. Custom domain (optional)

When you have a domain:

1. **Settings → Pages** → under **Custom domain**, enter your domain (e.g. `www.yoursite.com`) → **Save**.
2. At your domain registrar, add the **CNAME** or **A** records GitHub shows.
3. After the domain is verified, enable **Enforce HTTPS** in the same Pages settings.
4. Add the same URL(s) to **Supabase → Authentication → URL configuration → Redirect URLs**.

---

## 1. Build the static web app (local)

From the project root:

```bash
npm run build:web
```

Or:

```bash
npx expo export --platform web
```

This creates a **`dist`** folder with static HTML, JS, and assets. That folder is what you deploy.

## 2. Environment variables (Supabase)

The app uses **`EXPO_PUBLIC_SUPABASE_URL`** and **`EXPO_PUBLIC_SUPABASE_ANON_KEY`**. They are baked in at **build time** from your `.env` (or from the environment where you run the build).

- **Local build:** If your `.env` has these set, `npm run build:web` will use them.
- **Hosted build (e.g. Vercel/Netlify):** Set the same variables in the host’s “Environment variables” and use `npm run build:web` (or `npx expo export --platform web`) as the build command.

## 3. Hosting options

Deploy the **contents of the `dist`** folder to any static host.

| Host        | Build command           | Publish directory |
|------------|-------------------------|--------------------|
| Vercel     | `npm run build:web`     | `dist`             |
| Netlify    | `npm run build:web`     | `dist`             |
| GitHub Pages | `npm run build:web`   | `dist` (e.g. from `gh-pages` or Actions) |
| Any static host | Run build locally, upload `dist` | `dist` |

- **Vercel:** Connect repo → set root directory (project root) → Build: `npm run build:web` → Output: `dist`.
- **Netlify:** Same idea: Build command `npm run build:web`, Publish directory `dist`.
- **GitHub Pages:** Either push the `dist` folder to a branch (e.g. `gh-pages`) and set that as the Pages source, or use a GitHub Action that runs `npm run build:web` and publishes `dist`.

## 4. Test locally before deploying

```bash
npm run web
```

Then open the URL shown (e.g. http://localhost:8081). For a quick test of the **built** site, you can serve `dist` with a static server, e.g.:

```bash
npx serve dist
```

Then open the URL it prints (e.g. http://localhost:3000).

## 5. Auth and redirects (Supabase + web)

- In Supabase Dashboard → **Authentication → URL configuration**, add your **production web URL** (e.g. `https://your-app.vercel.app`) to **Redirect URLs** so sign-in and callbacks work.
- If you use a catch-all SPA fallback, point “404” to `index.html` (or your main route). With Expo static export you get real HTML per route, so many hosts work without extra config.

## Summary

1. Run **`npm run build:web`**.
2. Set **`EXPO_PUBLIC_SUPABASE_URL`** and **`EXPO_PUBLIC_SUPABASE_ANON_KEY`** where the build runs.
3. Deploy the **`dist`** folder to your chosen host.
4. Add the production site URL to Supabase **Redirect URLs**.
