const SHEET_NAME = 'Non Ferrous';
const HEADER = [
  'Fetched At UTC',
  'Source Date',
  'Metal',
  'Price Type',
  'Currency',
  'Cash Price',
  'Cash Bid',
  'Cash Offer',
  'Raw Cash Row',
  'Source URL',
];

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const expectedToken = PropertiesService.getScriptProperties().getProperty('WEBHOOK_TOKEN');

    if (!expectedToken) {
      return jsonResponse(500, {
        status: 'error',
        message: 'WEBHOOK_TOKEN script property is not configured.',
      });
    }

    if (payload.token !== expectedToken) {
      return jsonResponse(401, {
        status: 'error',
        message: 'Unauthorized.',
      });
    }

    if (!Array.isArray(payload.rows) || payload.rows.length === 0) {
      return jsonResponse(400, {
        status: 'error',
        message: 'Payload must include at least one row.',
      });
    }

    const sheet = getOrCreateSheet();
    ensureHeader(sheet);

    const values = payload.rows.map((row) => [
      row.fetchedAtUtc || '',
      row.sourceDate || '',
      row.metal || '',
      row.priceType || '',
      row.currency || '',
      row.cashPrice ?? '',
      row.cashBid ?? '',
      row.cashOffer ?? '',
      row.rawCashRow || '',
      row.sourceUrl || '',
    ]);

    sheet.getRange(sheet.getLastRow() + 1, 1, values.length, HEADER.length).setValues(values);

    return jsonResponse(200, {
      status: 'ok',
      appendedRows: values.length,
    });
  } catch (error) {
    return jsonResponse(500, {
      status: 'error',
      message: error.message,
    });
  }
}

function getOrCreateSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
}

function ensureHeader(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, HEADER.length);
  const currentHeader = headerRange.getValues()[0];
  const headerMatches = HEADER.every((label, index) => currentHeader[index] === label);

  if (!headerMatches) {
    headerRange.setValues([HEADER]);
    sheet.setFrozenRows(1);
  }
}

function jsonResponse(statusCode, payload) {
  return ContentService.createTextOutput(JSON.stringify({ statusCode, ...payload })).setMimeType(
    ContentService.MimeType.JSON,
  );
}
