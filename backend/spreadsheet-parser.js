const XLSX = require('xlsx');

function spreadsheetToCsv(buffer, fileName = '') {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('The spreadsheet file is empty.');
  if (!/\.(xlsx|xls)$/i.test(String(fileName))) throw new Error('Only .xlsx and .xls files are supported for Excel import.');
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: false });
  const firstSheetName = workbook.SheetNames?.[0];
  if (!firstSheetName) throw new Error('The Excel workbook does not contain a worksheet.');
  const sheet = workbook.Sheets[firstSheetName];
  const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
  if (!csv.trim()) throw new Error('The first worksheet is empty.');
  return csv;
}

module.exports = { spreadsheetToCsv };
