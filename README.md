# LME cash price automation

This repository records daily LME cash prices for:

- LME Nickel
- LME Copper
- LME Aluminium

The automation uses Playwright to log in to [lme.com](https://www.lme.com/), read the cash-price row on each non-ferrous metal page, and append the results to a Google Sheet through a Google Apps Script web app.

## Schedule

The GitHub Actions workflow runs every day at **02:30 UTC**:

```yaml
cron: '30 2 * * *'
```

You can also run it manually from the **Actions** tab with `workflow_dispatch`.

## GitHub Secrets

Yes, the LME credentials and Google Sheet web app values should be stored in GitHub repository secrets, not in source code.

The workflow supports either one combined secret named `DETAILS` or separate secrets. If you already added everything under `DETAILS`, make sure the value uses one of these formats.

JSON format:

```json
{
  "LME_USERNAME": "your-lme-login",
  "LME_PASSWORD": "your-lme-password",
  "GOOGLE_SHEETS_WEBAPP_URL": "https://script.google.com/macros/s/.../exec",
  "GOOGLE_SHEETS_WEBAPP_TOKEN": "same-token-as-apps-script",
  "LME_LOGIN_URL": "https://www.lme.com/"
}
```

Or `KEY=VALUE` lines:

```text
LME_USERNAME=your-lme-login
LME_PASSWORD=your-lme-password
GOOGLE_SHEETS_WEBAPP_URL=https://script.google.com/macros/s/.../exec
GOOGLE_SHEETS_WEBAPP_TOKEN=same-token-as-apps-script
LME_LOGIN_URL=https://www.lme.com/
```

If you named the token `WEBHOOK_TOKEN` inside `DETAILS`, that also works.

`LME_LOGIN_URL` is optional. Use it only if your LME account has a specific login page URL.

Alternatively, create separate repository secrets under **Settings -> Secrets and variables -> Actions -> New repository secret**:

| Secret | Required | Description |
| --- | --- | --- |
| `LME_USERNAME` | Yes | LME login username or email. |
| `LME_PASSWORD` | Yes | LME login password. |
| `LME_LOGIN_URL` | Optional | Exact LME login URL if the default homepage account link is not enough. |
| `GOOGLE_SHEETS_WEBAPP_URL` | Yes | Deployed Google Apps Script web app URL. |
| `GOOGLE_SHEETS_WEBAPP_TOKEN` | Yes | Shared token used to protect the web app endpoint. |

## Google Sheet web app setup

1. Create or open the Google Sheet that should receive the prices.
2. Go to **Extensions -> Apps Script**.
3. Paste the contents of [`scripts/google-apps-script/Code.gs`](scripts/google-apps-script/Code.gs).
4. In Apps Script, go to **Project Settings -> Script properties** and add:
   - Property: `WEBHOOK_TOKEN`
   - Value: a long random value
5. Deploy with **Deploy -> New deployment -> Web app**.
6. Set:
   - Execute as: **Me**
   - Who has access: **Anyone with the link**
7. Copy the deployment URL into either `GOOGLE_SHEETS_WEBAPP_URL` or the matching field inside the combined `DETAILS` secret.
8. Put the same random token into either `GOOGLE_SHEETS_WEBAPP_TOKEN` or the matching field inside the combined `DETAILS` secret.

The Apps Script creates or updates a sheet tab named **Non Ferrous** and appends one row per metal on every run.

## Local validation

Install dependencies:

```bash
npm ci
```

Check script syntax:

```bash
npm run check
```

Run the fetcher locally:

```bash
LME_USERNAME='your-login' \
LME_PASSWORD='your-password' \
GOOGLE_SHEETS_WEBAPP_URL='https://script.google.com/macros/s/...' \
GOOGLE_SHEETS_WEBAPP_TOKEN='same-token-as-apps-script' \
npm run fetch:lme
```

If the LME login page is different for your account, add:

```bash
LME_LOGIN_URL='https://exact-login-url'
```

## Recorded columns

The Google Sheet tab receives:

- Fetched At UTC
- Source Date
- Metal
- Price Type
- Currency
- Cash Price
- Cash Bid
- Cash Offer
- Raw Cash Row
- Source URL

When both bid and offer are present, `Cash Price` is recorded as the midpoint. The original extracted row is kept in `Raw Cash Row` for auditability.
