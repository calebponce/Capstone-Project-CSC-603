const { test, expect } = require('@playwright/test');

const basePayload = {
  airportCode: 'SFO',
  arrivalTime: '2026-05-11T08:00:00.000Z',
  departureTime: '2026-05-11T13:00:00.000Z',
  connectionType: 'domestic',
  interests: ['food'],
  riskProfile: 'balanced',
  strategyPack: 'standard',
  trustAcknowledged: true,
};

test('plan response always includes an ai metadata block', async ({ request }) => {
  const response = await request.post('/api/plan', { data: basePayload });
  expect(response.ok()).toBeTruthy();
  const data = await response.json();

  expect(data?.ai).toBeTruthy();
  expect(typeof data.ai.provider).toBe('string');
  expect(typeof data.ai.used).toBe('boolean');
  expect(Array.isArray(data.ai.travelerTips)).toBeTruthy();
});

test('ai path: with GEMINI_API_KEY the server returns a live LLM response', async ({ request }) => {
  test.skip(
    !process.env.GEMINI_API_KEY,
    'GEMINI_API_KEY not set in test environment; skipping live-AI assertion.'
  );

  const response = await request.post('/api/plan', { data: basePayload });
  expect(response.ok()).toBeTruthy();
  const data = await response.json();

  expect(data?.ai?.provider).toBe('gemini');
  expect(data?.ai?.used).toBe(true);
  expect(data?.ai?.error).toBeNull();
  expect(typeof data.ai.title).toBe('string');
  expect(data.ai.title.length).toBeGreaterThan(0);
  expect(Number.isFinite(data.ai.latencyMs)).toBeTruthy();
});

test('ai path: without a key the server falls back gracefully', async ({ request }) => {
  test.skip(
    Boolean(process.env.GEMINI_API_KEY),
    'GEMINI_API_KEY is set in test environment; skipping fallback assertion.'
  );

  const response = await request.post('/api/plan', { data: basePayload });
  expect(response.ok()).toBeTruthy();
  const data = await response.json();

  expect(data?.ai?.provider).toBe('fallback');
  expect(data?.ai?.used).toBe(false);
  expect(typeof data?.ai?.error).toBe('string');
});
