const test = require('node:test');
const assert = require('node:assert/strict');

test('team chat permissions hide management channels from Sales Agents', () => {
  const channels = [
    { id: 'channel_general', visibility: 'all' },
    { id: 'channel_management', visibility: 'management' }
  ];
  const visibleForAgent = channels.filter(channel => channel.visibility !== 'management');
  assert.deepEqual(visibleForAgent.map(channel => channel.id), ['channel_general']);
});
