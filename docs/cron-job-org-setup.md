# cron-job.org setup for GitHub Actions

Use cron-job.org to trigger your three GitHub workflows on a precise schedule. Your scripts stay in this repo; cron-job.org only sends a POST request to GitHub’s API to start each workflow.

---

## 1. GitHub Personal Access Token (PAT)

1. GitHub → **Settings** (your profile) → **Developer settings** → **Personal access tokens** → **Tokens (classic)**.
2. **Generate new token (classic)**.
3. **Note:** e.g. `cron-job.org`.
4. **Expiration:** 90 days or no expiration (you can rotate later).
5. **Scopes:** tick **repo** and **workflow** (workflow is required to trigger workflow_dispatch; without it you may get 403).
6. **Generate token** and copy it once (you won’t see it again). You’ll use it as the `Bearer` token in cron-job.org.

---

## 2. Replace these in the URLs below

- **OWNER** = your GitHub username or org (e.g. `craig` or `myorg`).
- **REPO** = this repo name (e.g. `CheltenhamTopTipster`).
- **BRANCH** = default branch, usually `main` or `master`.

Example: if your repo is `https://github.com/craig/CheltenhamTopTipster` and default branch is `main`, then:
- OWNER = `craig`
- REPO = `CheltenhamTopTipster`
- BRANCH = `main`

---

## 3. Create three cron jobs on cron-job.org

For **each** job you will:

- Use the **COMMON** tab for Title, URL, and Schedule.
- Use the **ADVANCED** tab to set **Request method** to POST, add **Headers**, and set **Request body**.

---

### Job 1: Update race results (every 10 minutes)

**COMMON tab**

- **Title:** `Update race results`
- **URL:**  
  `https://api.github.com/repos/OWNER/REPO/actions/workflows/WORKFLOW_ID/dispatches`  
  Replace OWNER, REPO, and **WORKFLOW_ID**. Use the **numeric workflow ID** (see “Troubleshooting” below) or try the filename: `update-race-results.yml`.
- **Enable job:** On.
- **Execution schedule:** Choose **“Every 10 minutes”** from the dropdown (or **Custom** and enter `*/10 12-19 * * *` so it runs every 10 min between 12:00 and 19:59 UTC).
- **Schedule timezone:** Set to **UTC** so 12–19 UTC is correct (or adjust the crontab if you prefer Europe/Dublin).

**ADVANCED tab**

- **Request method:** **POST**.
- **Request headers** (add each header):
  - `Authorization` = `Bearer YOUR_GITHUB_PAT`
  - `Accept` = `application/vnd.github+json`
  - `X-GitHub-Api-Version` = `2022-11-28`
  - `Content-Type` = `application/json`
- **Request body:**  
  `{"ref":"BRANCH"}`  
  (Replace BRANCH with `main` or `master`.)

Then **CREATE** (or **Save**).

---

### Job 2: Pull races (twice daily)

**COMMON tab**

- **Title:** `Pull races`
- **URL:**  
  `https://api.github.com/repos/OWNER/REPO/actions/workflows/WORKFLOW_ID/dispatches`  
  Use the numeric workflow ID for “Pull races” (see “Troubleshooting” below) or `pull-races.yml`.
- **Enable job:** On.
- **Execution schedule:** **Custom** crontab: `0 17,18 * * *` (runs at 17:00 and 18:00 UTC = 5pm and 6pm UK GMT / 6pm and 7pm BST).

**ADVANCED tab**

- **Request method:** **POST**.
- **Request headers:** Same as Job 1 (Authorization, Accept, X-GitHub-Api-Version, Content-Type).
- **Request body:** `{"ref":"BRANCH"}` (e.g. `{"ref":"main"}`).

Then **CREATE** (or **Save**).

---

### Job 3: Remove old races (daily)

**COMMON tab**

- **Title:** `Remove old races`
- **URL:**  
  `https://api.github.com/repos/OWNER/REPO/actions/workflows/WORKFLOW_ID/dispatches`  
  Use the numeric workflow ID for “Remove old races” (see “Troubleshooting” below) or `remove-old-races.yml`.
- **Enable job:** On.
- **Execution schedule:** **Every day at 18:00** (or **Custom** `0 18 * * *` for 18:00 UTC daily).

**ADVANCED tab**

- **Request method:** **POST**.
- **Request headers:** Same as Job 1.
- **Request body:** `{"ref":"BRANCH"}`.

Then **CREATE** (or **Save**).

---

## 4. Summary

| cron-job.org title   | Workflow file            | Schedule (UTC)              |
|----------------------|--------------------------|-----------------------------|
| Update race results  | update-race-results.yml  | Every 10 min, 12:00–19:59   |
| Pull races           | pull-races.yml           | 17:00 and 18:00 daily       |
| Remove old races     | remove-old-races.yml     | 18:00 daily                 |

- **COMMON:** Title, URL (GitHub API dispatch URL), Schedule.
- **ADVANCED:** Method = POST, Headers (Authorization with your PAT, Accept, X-GitHub-Api-Version, Content-Type), Body = `{"ref":"main"}` (or your branch).

Use **TEST RUN** on one job to confirm the workflow appears in the GitHub Actions tab.

---

## 5. Troubleshooting (404 / 403)

If the dispatch URL returns **404** or **403**, do the following.

### Use the numeric workflow ID (recommended)

GitHub sometimes returns 404 when the URL uses the workflow **filename**. Use the **numeric ID** instead:

1. In a browser or with curl, call (with your PAT in the header):
   ```
   GET https://api.github.com/repos/CQuinn93/CheltenhamTopTipster/actions/workflows
   ```
   Headers: `Authorization: Bearer YOUR_PAT`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`.

2. In the JSON response, find each workflow by name and note its **`id`** (number), e.g.:
   - "Update race results" → `id: 12345678`
   - "Pull races" → `id: 12345679`
   - "Remove old races" → `id: 12345680`

3. In cron-job.org, set the URL to:
   `https://api.github.com/repos/CQuinn93/CheltenhamTopTipster/actions/workflows/12345678/dispatches`  
   (use the correct `id` for each job).

### PAT scopes

- Use a **classic** Personal Access Token with **repo** and **workflow** scopes. Without **workflow**, GitHub often returns 403 when triggering workflows.
- If you use a **fine-grained** token, give it **Actions and workflows: Read and write** (or equivalent) for this repo.

### Other checks

- **Workflow enabled:** Repo → **Actions** → select the workflow → ensure it is not disabled.
- **Default branch:** The workflow file must exist on the default branch (e.g. `main`). The request body must use that branch: `{"ref":"main"}` (or `master`).
- **Body:** Must be valid JSON, e.g. `{"ref":"main"}` with no extra spaces or characters.
