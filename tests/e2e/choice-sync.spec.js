const { test, expect } = require('@playwright/test');

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('selecting an alternative updates summary, timeline, and map focus', async ({ page }) => {
  await page.goto('/');

  const submitButton = page.locator('#submit-btn');
  await expect(submitButton).toBeVisible();
  await expect(page.locator('input[name=\"arrivalTime\"]')).not.toHaveValue('');
  await expect(page.locator('input[name=\"departureTime\"]')).not.toHaveValue('');

  const trustCheckbox = page.getByRole('checkbox', {
    name: /i understand this tool gives guidance only/i,
  });
  await trustCheckbox.check();

  await submitButton.click();

  const candidateCards = page.locator('.candidate-list .candidate-item');
  await expect(candidateCards.first()).toBeVisible();
  expect(await candidateCards.count()).toBeGreaterThanOrEqual(2);

  const selectionInfo = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.candidate-list .candidate-item'));
    const activeIndex = cards.findIndex((card) => card.classList.contains('active'));
    const targetIndex = cards.findIndex((_, index) => index !== activeIndex);
    const targetCard = cards[targetIndex];
    const titleNode = targetCard?.querySelector('.candidate-title');

    return {
      activeIndex,
      targetIndex,
      targetName: titleNode ? titleNode.textContent.trim() : null,
    };
  });

  expect(selectionInfo.targetIndex).toBeGreaterThanOrEqual(0);
  expect(selectionInfo.targetName).toBeTruthy();

  const targetName = selectionInfo.targetName;
  await candidateCards.nth(selectionInfo.targetIndex).click();

  await expect(page.locator('.summary-card h2').first()).toContainText(targetName, {
    timeout: 45_000,
  });

  await page.getByRole('tab', { name: /^Timeline/ }).click();
  const timelinePanel = page.locator('.tab-panel.active .timeline');
  await expect(timelinePanel).toBeVisible();
  await expect(timelinePanel).toContainText(new RegExp(escapeRegExp(targetName), 'i'), {
    timeout: 45_000,
  });

  await page.getByRole('tab', { name: /^Map$/ }).click();
  const mapContainer = page.locator('.tab-panel.active .map-container').first();
  await expect(mapContainer).toBeVisible();
  await expect(mapContainer).toHaveAttribute(
    'data-focus-candidate',
    new RegExp(`^${escapeRegExp(targetName)}$`, 'i'),
    { timeout: 45_000 }
  );
});
