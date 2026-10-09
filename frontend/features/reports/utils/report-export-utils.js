window.AureumReportExportUtils = Object.freeze({
  csvCell: value => { const text = String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; },
  buildCsv: (headers, rows) => [headers, ...rows].map(row => row.map(value => window.AureumReportExportUtils.csvCell(value)).join(',')).join('\n'),
  fileName: reportType => `aureum-${reportType || 'agent_report'}.csv`
});
