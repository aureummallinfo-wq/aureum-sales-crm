window.AureumChatMessageUtils = Object.freeze({
  formatTime: value => new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
  formatDate: value => new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
  isSameDay: (first, second) => new Date(first).toDateString() === new Date(second).toDateString(),
  normalizeMessage: message => ({ ...message, body: message.body ?? message.message_text ?? '', createdAt: message.createdAt ?? message.created_at })
});
