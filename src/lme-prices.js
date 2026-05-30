import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const METALS = [
  {
    metal: 'LME Nickel',
    url: 'https://www.lme.com/en/Metals/Non-ferrous/LME-Nickel',
  },
  {
    metal: 'LME Copper',
    url: 'https://www.lme.com/en/Metals/Non-ferrous/LME-Copper',
  },
  {
    metal: 'LME Aluminium',
    url: 'https://www.lme.com/en/Metals/Non-ferrous/LME-Aluminium',
  },
];

const REQUIRED_ENV = [
  'LME_USERNAME',
  'LME_PASSWORD',
  'GOOGLE_SHEETS_WEBAPP_URL',
  'GOOGLE_SHEETS_WEBAPP_TOKEN',
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getConfig() {
  for (const name of REQUIRED_ENV) {
    requireEnv(name);
  }

  return {
    lmeUsername: process.env.LME_USERNAME,
    lmePassword: process.env.LME_PASSWORD,
    lmeLoginUrl: process.env.LME_LOGIN_URL || 'https://www.lme.com/',
    googleSheetsWebappUrl: process.env.GOOGLE_SHEETS_WEBAPP_URL,
    googleSheetsWebappToken: process.env.GOOGLE_SHEETS_WEBAPP_TOKEN,
    headless: process.env.LME_HEADLESS !== 'false',
    debugArtifactsDir: process.env.DEBUG_ARTIFACT_DIR || 'debug-artifacts',
  };
}

async function firstVisible(page, selectors, timeoutMs = 2_000) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: 'visible', timeout: timeoutMs });
      return locator;
    } catch {
      // Try the next selector. LME markup can differ between account flows.
    }
  }

  return null;
}

async function acceptCookies(page) {
  const cookieButton = await firstVisible(
    page,
    [
      'button:has-text("Accept all")',
      'button:has-text("Accept All")',
      'button:has-text("Accept cookies")',
      'button:has-text("Allow all")',
      'button:has-text("I accept")',
    ],
    1_000,
  );

  if (cookieButton) {
    await cookieButton.click();
    await page.waitForTimeout(500);
  }
}

async function openLogin(page, loginUrl) {
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
  await acceptCookies(page);

  const hasPassword = await firstVisible(page, ['input[type="password"]'], 1_000);
  if (hasPassword) {
    return;
  }

  const loginLink = await firstVisible(
    page,
    [
      'a:has-text("Login")',
      'a:has-text("Log in")',
      'a:has-text("Sign in")',
      'a:has-text("Account")',
      'button:has-text("Login")',
      'button:has-text("Log in")',
      'button:has-text("Sign in")',
      'button:has-text("Account")',
    ],
    3_000,
  );

  if (!loginLink) {
    throw new Error(
      'Could not find the LME login entry point. Set LME_LOGIN_URL to the exact login page URL.',
    );
  }

  await loginLink.click();
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await acceptCookies(page);
}

async function loginToLme(page, config) {
  await openLogin(page, config.lmeLoginUrl);

  const usernameInput = await firstVisible(page, [
    'input[type="email"]',
    'input[name*="email" i]',
    'input[id*="email" i]',
    'input[name*="user" i]',
    'input[id*="user" i]',
    'input[name*="login" i]',
    'input[id*="login" i]',
  ]);
  if (!usernameInput) {
    throw new Error('Could not find the LME username/email field.');
  }

  await usernameInput.fill(config.lmeUsername);

  const passwordInput = await firstVisible(page, ['input[type="password"]']);
  if (!passwordInput) {
    throw new Error('Could not find the LME password field.');
  }

  await passwordInput.fill(config.lmePassword);

  const submitButton = await firstVisible(page, [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Login")',
    'button:has-text("Log in")',
    'button:has-text("Sign in")',
    'button:has-text("Submit")',
  ]);
  if (!submitButton) {
    throw new Error('Could not find the LME login submit button.');
  }

  await submitButton.click();
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(1_000);

  const loginError = await firstVisible(
    page,
    [
      'text=/invalid|incorrect|failed|locked|unauthori[sz]ed/i',
      '[role="alert"]',
      '.error',
      '.validation-summary-errors',
    ],
    2_000,
  );
  if (loginError) {
    const errorText = (await loginError.textContent())?.trim();
    throw new Error(`LME login appears to have failed: ${errorText || 'unknown error'}`);
  }
}

function toNumber(value) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/,/g, '').trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    return null;
  }

  return Number(normalized);
}

function extractNumbers(text) {
  return [...text.matchAll(/-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?/g)]
    .map((match) => toNumber(match[0]))
    .filter((value) => value !== null);
}

function pickCashValues(cells) {
  const joined = cells.join(' ');
  const numbers = extractNumbers(joined);

  if (numbers.length === 0) {
    return null;
  }

  const cashBid = numbers[0] ?? null;
  const cashOffer = numbers[1] ?? null;
  const cashPrice =
    cashBid !== null && cashOffer !== null ? Number(((cashBid + cashOffer) / 2).toFixed(4)) : cashBid;

  return {
    cashPrice,
    cashBid,
    cashOffer,
  };
}

async function extractCashPrice(page, metal) {
  const extracted = await page.evaluate(() => {
    const normalize = (value) => value.replace(/\s+/g, ' ').trim();
    const bodyText = document.body?.innerText || '';
    const sourceDateMatch = bodyText.match(/Data valid for\s+([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4})/i);
    const tableCandidates = [];

    for (const table of document.querySelectorAll('table')) {
      const tableText = normalize(table.innerText || '');
      const rows = [...table.querySelectorAll('tr')].map((row) =>
        [...row.querySelectorAll('th,td')].map((cell) => normalize(cell.textContent || '')),
      );

      for (const row of rows) {
        const rowText = row.join(' ');
        if (/\bcash\b/i.test(rowText) && /\d/.test(rowText)) {
          tableCandidates.push({
            cells: row,
            tableText,
            sourceDate: sourceDateMatch?.[1] || '',
          });
        }
      }
    }

    if (tableCandidates.length > 0) {
      return tableCandidates[0];
    }

    const cashLine = bodyText
      .split('\n')
      .map((line) => normalize(line))
      .find((line) => /\bcash\b/i.test(line) && /\d/.test(line));

    return cashLine
      ? {
          cells: [cashLine],
          tableText: cashLine,
          sourceDate: sourceDateMatch?.[1] || '',
        }
      : null;
  });

  if (!extracted) {
    throw new Error(`Could not find a cash-price row for ${metal.metal}.`);
  }

  const cashValues = pickCashValues(extracted.cells);
  if (!cashValues) {
    throw new Error(`Found a cash row for ${metal.metal}, but no numeric price values were present.`);
  }

  return {
    fetchedAtUtc: new Date().toISOString(),
    sourceDate: extracted.sourceDate,
    metal: metal.metal,
    priceType: 'Cash',
    currency: 'USD',
    cashPrice: cashValues.cashPrice,
    cashBid: cashValues.cashBid,
    cashOffer: cashValues.cashOffer,
    rawCashRow: extracted.cells.join(' | '),
    sourceUrl: metal.url,
  };
}

async function fetchMetalRows(page) {
  const rows = [];

  for (const metal of METALS) {
    await page.goto(metal.url, { waitUntil: 'domcontentloaded' });
    await acceptCookies(page);
    await page.waitForLoadState('networkidle').catch(() => undefined);

    const row = await extractCashPrice(page, metal);
    console.log(`${metal.metal}: ${row.cashPrice} ${row.currency}`);
    rows.push(row);
  }

  return rows;
}

async function postRowsToSheet(config, rows) {
  const response = await fetch(config.googleSheetsWebappUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      token: config.googleSheetsWebappToken,
      rows,
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Google Sheets web app returned ${response.status}: ${responseText}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new Error(`Google Sheets web app returned non-JSON response: ${responseText}`);
  }

  if (parsed.status !== 'ok') {
    throw new Error(`Google Sheets web app rejected rows: ${responseText}`);
  }

  console.log(`Posted ${rows.length} row(s) to Google Sheets.`);
}

async function saveDebugArtifacts(page, debugArtifactsDir, error) {
  await fs.mkdir(debugArtifactsDir, { recursive: true });
  const safeTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = path.join(debugArtifactsDir, `lme-error-${safeTimestamp}.png`);
  const htmlPath = path.join(debugArtifactsDir, `lme-error-${safeTimestamp}.html`);

  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
  await fs.writeFile(htmlPath, await page.content()).catch(() => undefined);
  console.error(error);
  console.error(`Saved debug artifacts to ${debugArtifactsDir}`);
}

async function main() {
  const config = getConfig();
  const browser = await chromium.launch({ headless: config.headless });
  const page = await browser.newPage();

  try {
    await loginToLme(page, config);
    const rows = await fetchMetalRows(page);
    await postRowsToSheet(config, rows);
  } catch (error) {
    await saveDebugArtifacts(page, config.debugArtifactsDir, error);
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
