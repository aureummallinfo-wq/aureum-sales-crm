(function (root) {
  const values = Object.freeze(['New', 'Contacted', 'Hot', 'Cold', 'Follow-up', 'Visit Scheduled', 'Visit Completed', 'Negotiation', 'Closed Won', 'No Response', 'Not Interested', 'Invalid']);
  const legacy = Object.freeze({ Active: 'New', Qualified: 'Contacted', Warm: 'Contacted', Interested: 'Hot', 'Booking Interested': 'Hot', 'Meeting Scheduled': 'Visit Scheduled', Booking: 'Negotiation', 'Closed Lost': 'Not Interested', 'Follow-up Needed': 'Follow-up' });
  const colors = Object.freeze({ New: '#8d7658', Contacted: '#6d8c9b', Hot: '#b36b55', Cold: '#9e9a92', 'Follow-up': '#b6904f', 'Visit Scheduled': '#6d8c9b', 'Visit Completed': '#6d8c9b', Negotiation: '#8a6c9c', 'Closed Won': '#5d9670', 'No Response': '#9e9a92', 'Not Interested': '#9e9a92', Invalid: '#a84c45' });
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
