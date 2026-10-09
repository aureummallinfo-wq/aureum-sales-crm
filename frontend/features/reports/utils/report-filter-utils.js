window.AureumReportFilterUtils = Object.freeze({ buildQuery: params => new URLSearchParams(Object.entries(params).filter(([, value]) => value)).toString() });
