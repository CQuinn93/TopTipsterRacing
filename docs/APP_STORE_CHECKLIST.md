# App Store (Apple) submission checklist

Use this to avoid rejections and get approved in time for next week.

---

## ✅ Likely already OK

| Item | Status | Notes |
|------|--------|------|
| **Encryption** | ✅ | `ITSAppUsesNonExemptEncryption: false` in app.json (HTTPS only is exempt). |
| **Sign out** | ✅ | Account screen has Sign out with confirmation. |
| **App completeness** | ✅ | No placeholder content; real flows (login, competitions, selections, results). |
| **Account creation** | ✅ | Email/password sign up; no third-party social login, so Sign in with Apple not required. |

---

## ⚠️ Must have (often rejected without these)

### 1. Account deletion (Guideline 5.1.1)

- **Rule:** Apps that allow account creation must let users **delete their account from within the app**.
- **Status:** ✅ Implemented: Account screen has “Delete account” that removes the user’s data and auth account (see below).
- **In App Store Connect:** Optional but useful: in App Review notes, mention “Account deletion: Account → Delete account”.

**Deploy the Edge Function (required for delete to work):**

1. Install Supabase CLI if needed: `npm i -g supabase`
2. Log in: `supabase login`
3. Link project (if not already): `supabase link --project-ref <your-project-ref>`
4. Set the secret: `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>`
5. Deploy: `supabase functions deploy delete-account`

The app calls `POST <SUPABASE_URL>/functions/v1/delete-account` with the user’s JWT; the function deletes all user data and the auth user.

### 2. Privacy policy

- **Rule:** If you collect personal data (email, username, selections), you need a **privacy policy** and usually a URL.
- **Status:** ✅ A ready-to-use policy is in **`docs/privacy-policy.html`**. You only need to **host it** and set the URL in App Store Connect (and optionally link from the app).

**Host the page for free (no server needed):**

Yes, you need a public URL. Easiest free option is **GitHub Pages**:

1. **Use this repo (if it’s on GitHub)**  
   - The file **`docs/privacy-policy.html`** is already in the repo.  
   - On GitHub: go to your repo → **Settings** → **Pages**.  
   - Under “Build and deployment”, set **Source** to “Deploy from a branch”.  
   - Branch: **main** (or default), folder: **/docs**. Save.  
   - After a minute or two, the site will be live at:  
     **`https://<YOUR_GITHUB_USERNAME>.github.io/<REPO_NAME>/privacy-policy.html`**  
     (e.g. `https://craig.github.io/CheltenhamTopTipster/privacy-policy.html`).

2. **Or use a separate repo for a short URL**  
   - Create a new repo (e.g. `toptipster-privacy`).  
   - Upload **`docs/privacy-policy.html`** as **`index.html`** in the root.  
   - Enable Pages from the main branch (Settings → Pages → source = main, root).  
   - Your policy URL will be: **`https://<USERNAME>.github.io/toptipster-privacy/`**.

3. **Other free options**  
   - **Netlify** or **Vercel**: drag-and-drop the HTML file; they give you a free URL.  
   - **Supabase Storage**: create a public bucket, upload the HTML, use the file URL.

Then in **App Store Connect** → your app → set **Privacy Policy URL** to that address. Optionally add a “Privacy policy” link in the app (e.g. on the Account or sign-up screen) that opens the same URL.

### 3. Data collection declaration (App Store Connect)

- **Rule:** You must declare data collection in App Store Connect.
- **What to do:** In App Store Connect → Your app → **App Privacy**, answer the questionnaire:
  - **Contact info:** Email address (for account).
  - **User content:** e.g. “Other User Content” if you describe selections as user-generated.
  - **Identifiers:** User ID (if you declare it).
  - Use “Data not linked to identity” / “Data linked to identity” as appropriate; say you use data for app functionality and account management.

---

## 📋 Before you submit

- [ ] **Build:** Use a release build (e.g. `eas build --platform ios`), not a dev build.
- [ ] **Test:** Install the build from TestFlight and test sign up, sign out, **delete account**, and main flows.
- [ ] **App Review notes:** In App Store Connect, add a short note with:
  - Test account (email + password) if login is required.
  - Any special steps (e.g. “Use access code X to join a competition”).
  - One line: “Account deletion is available in Account → Delete account.”
- [ ] **Screenshots:** Required for each device size you support (e.g. 6.7", 6.5", 5.5").
- [ ] **Metadata:** Description, keywords, category, age rating (likely 4+ if no gambling real money).

---

## ⏱ Timeline

- **Review:** Most apps are reviewed in **under 24 hours**.
- **Rejections:** Common causes are 2.1 (incomplete/crashes), 5.1.1 (account deletion), and missing privacy policy. Covering the items above greatly reduces risk.

---

## Summary

1. **Account deletion** – Implemented in the app (Account → Delete account).
2. **Privacy policy** – Add a policy page and set its URL in App Store Connect; link to it in the app.
3. **App Privacy** – Fill in the data collection declaration in App Store Connect.
4. **TestFlight** – Test the build and provide a test account in App Review notes.

If you do these, the app has a good chance of passing review in time for next week.
