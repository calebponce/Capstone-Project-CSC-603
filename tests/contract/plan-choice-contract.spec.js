const { test, expect } = require('@playwright/test');

function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\u2019/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

test('preferred POI stays selected and schedule/map are aligned', async ({ request }) => {
  const preferredPoiName = 'Test Choice';
  const payload = {
    airportCode: 'SFO',
    arrivalTime: '2026-05-11T08:00:00.000Z',
    departureTime: '2026-05-11T13:00:00.000Z',
    connectionType: 'domestic',
    interests: ['food', 'shopping'],
    riskProfile: 'balanced',
    strategyPack: 'standard',
    trustAcknowledged: true,
    preferredPoiName,
    preferredPoi: {
      name: preferredPoiName,
      lat: 37.616,
      lon: -122.386,
      category: 'restaurant',
    },
  };

  const response = await request.post('/api/plan', { data: payload });
  expect(response.ok()).toBeTruthy();

  const data = await response.json();

  expect(data?.selection?.selectedBy).toBe('user-preference');
  expect(data?.selection?.preferredMatchFound).toBeTruthy();
  expect(normalizeName(data?.map?.selectedPoi?.name)).toBe(normalizeName(preferredPoiName));
  expect(data?.request?.preferredPoiName).toBe(preferredPoiName);
  expect(Array.isArray(data?.schedule)).toBeTruthy();
  expect(data.schedule.length).toBeGreaterThan(0);

  const timelineText = data.schedule
    .map((entry) => `${entry.label || ''} ${entry.location || ''}`)
    .join(' ')
    .toLowerCase();
  expect(timelineText).toContain('test choice');

  const selectedInCandidates = (data?.map?.candidates || []).find(
    (candidate) => normalizeName(candidate.name) === normalizeName(preferredPoiName)
  );
  expect(selectedInCandidates).toBeTruthy();
});
