# Cloudflare Dashboard setup (before the first push)

This project deploys as a **Cloudflare Worker with Static Assets**. The Worker serves the built app, but every profile, scan, pay figure, and saved history record stays in the browser. There are no Worker bindings, databases, analytics SDKs, or server-side form submissions.

## 1. Connect the existing GitHub repository

1. Sign in to Cloudflare and open **Workers & Pages**.
2. Choose **Create application** (or **Create**) → **Import a repository**.
3. Connect GitHub if needed and select the repository that backs `origin` for this project.
4. Select **Workers** when Cloudflare asks whether to create a Worker or Pages project.
5. Set the production branch to **`main`**.

## 2. Build configuration

Use these values in the build configuration screen:

| Setting | Value |
| --- | --- |
| Project name | `the-take` |
| Root directory | `/` (or leave blank) |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Non-production branch deploy command | leave the Cloudflare default |

Add this build environment variable only if Cloudflare does not already use a compatible Node release:

| Variable | Value |
| --- | --- |
| `NODE_VERSION` | `22.16.0` |

Do **not** create D1, KV, R2, Durable Object, environment-secret, or service bindings. The checked-in `wrangler.jsonc` already points Static Assets at `dist/` and enables SPA fallback.

Do not enter a Pages output directory. `wrangler deploy` reads the asset directory from `wrangler.jsonc`.

## 3. Privacy settings

- Leave Cloudflare Web Analytics disabled unless you intentionally want aggregate visitor telemetry.
- Do not add session replay, tag-manager, or analytics scripts.
- The OCR worker, WebAssembly core, and English recognition data are self-hosted in the deployment; screenshots are processed in the browser and are not uploaded.
- Cloudflare still handles ordinary HTTP requests for the site files at the network edge, but the app never places names, pay figures, history, or screenshots in those requests.

## 4. First deployment and domain

After the Dashboard project is connected and the pending code is pushed to `main`, Cloudflare should run the build automatically.

Once that build succeeds:

1. Open the Worker in **Workers & Pages**.
2. Open **Settings** → **Domains & Routes**.
3. Choose **Add** → **Custom Domain**.
4. Select the Cloudflare-managed zone and enter the final hostname.
5. Test the generated `*.workers.dev` URL and the custom domain before installing the PWA.

Use one final canonical hostname before real onboarding. Browser storage is origin-scoped, so a profile saved on `workers.dev` will not automatically appear on the later custom domain.

## 5. Post-deploy checks

- Complete onboarding, close the PWA, reopen it, and confirm onboarding stays dismissed.
- Confirm the saved name appears above the hero description and in the compact navbar.
- Enter `$1,300` in service sales and verify earned service commission is `$610` before tips or retail.
- Open Projected Earnings and confirm its background blur remains continuous.
- Upload a sample screenshot and confirm OCR works without third-party network requests.
- In iOS Safari, add the final custom-domain URL to the Home Screen and verify the app title and floating navbar.

