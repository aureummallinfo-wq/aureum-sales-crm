(function (root) {
  const values = Object.freeze(['New', 'Contacted', 'Qualified', 'Hot', 'Warm', 'Cold', 'Follow-up', 'Visit Scheduled', 'Visit Completed', 'Meeting Scheduled', 'Negotiation', 'Booking', 'Closed Won', 'Closed Lost', 'No Response', 'Not Interested', 'Invalid']);
  const legacy = Object.freeze({ Active: 'New', Interested: 'Hot', 'Booking Interested': 'Booking', 'Follow-up Needed': 'Follow-up' });
  const colors = Object.freeze({ New: '#8d7658', Contacted: '#6d8c9b', Qualified: '#6d8c9b', Hot: '#b36b55', Warm: '#b6904f', Cold: '#9e9a92', 'Follow-up': '#b6904f', 'Visit Scheduled': '#6d8c9b', 'Visit Completed': '#5d9670', 'Meeting Scheduled': '#6d8c9b', Negotiation: '#8a6c9c', Booking: '#5d9670', 'Closed Won': '#5d9670', 'Closed Lost': '#a84c45', 'No Response': '#9e9a92', 'Not Interested': '#9e9a92', Invalid: '#a84c45' });
  function normalize(value, fallback = 'New') {
    const text = String(value || '').trim();
    return values.find(item => item.toLowerCase() === text.toLowerCase()) || legacy[text] || fallback;
  }
  function isValid(value) { return values.includes(value); }
  function withStatus(tags, selected) {
    const choices = Array.isArray(selected) ? selected : [selected];
    return [...new Set([...(Array.isArray(tags) ? tags : []).filter(tag => !values.includes(tag)), ...choices.filter(isValid)])];
  }
  const api = Object.freeze({ values, legacy, colors, normalize, isValid, withStatus });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AureumCRMStatusTags = api;
}(typeof window === 'object' ? window : globalThis));
