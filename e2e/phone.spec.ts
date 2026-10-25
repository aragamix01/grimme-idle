import { expect, test, type CDPSession, type Page } from '@playwright/test';

// Each test gets a fresh browser context, so a fresh world with no save and no offline report.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__grimm?.scene?.townBuilt === true);
  await page.locator('#speed button[data-speed="0"]').tap(); // hold the world still
});

// Where a world-map keep sits on screen.
async function keepPos(page: Page, index: number) {
  await page.waitForFunction(() => (window as any).__grimm.scene.game.scene.getScene('worldmap').built === true);
  return page.evaluate((i) => {
    const g = (window as any).__grimm.scene.game;
    const r = g.scene.getScene('worldmap').world.realms[i];
    const rect = g.canvas.getBoundingClientRect();
    const k = rect.width / g.scale.gameSize.width;
    return { x: rect.left + (r.x * 16 + 8) * k, y: rect.top + (r.y * 16 + 4) * k };
  }, index);
}

// A finger drag from x, y by dy (negative drags up, scrolling content down), as raw touch events.
async function swipe(cdp: CDPSession, x: number, y: number, dy: number) {
  const steps = 12;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (dy * i) / steps }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await new Promise((r) => setTimeout(r, 300));
}

// Touch scrolling is driven through Chrome's DevTools protocol, which WebKit lacks.
const chromeOnly = (browserName: string) => test.skip(browserName !== 'chromium', 'touch drags need Chrome DevTools');

// Let the chronicle fill so the page is taller than the screen, then hold still again.
async function fillPage(page: Page) {
  await page.locator('#speed button[data-speed="3"]').tap();
  await page.waitForFunction(() => document.documentElement.scrollHeight > innerHeight + 200, null, { timeout: 30_000 });
  await page.locator('#speed button[data-speed="0"]').tap();
}

test('a neighbour can be opened, closed and opened again', async ({ page }) => {
  await page.locator('#worldmap').tap();
  for (const i of [0, 1, 2, 3]) {
    const pos = await keepPos(page, i);
    await page.touchscreen.tap(pos.x, pos.y);
    await expect(page.locator('#realm-card')).toBeVisible();
    await page.locator('#realm-card .npc__bar-close').tap();
    await expect(page.locator('#realm-card')).toBeHidden();
    // The same keep again: it must still respond.
    await page.touchscreen.tap(pos.x, pos.y);
    await expect(page.locator('#realm-card')).toBeVisible();
    await page.locator('#realm-card .npc__bar-close').tap();
    await expect(page.locator('#realm-card')).toBeHidden();
  }
});

// A townsperson standing well inside the visible map.
async function npcPos(page: Page) {
  return page.evaluate(() => {
    const sc = (window as any).__grimm.scene;
    const rect = sc.game.canvas.getBoundingClientRect();
    for (const n of sc.world.npcs) {
      const p = n.alive && n.age >= 16 ? sc.npcScreenPos(n.id) : null;
      if (p && p.x > rect.left + 30 && p.x < rect.right - 30 && p.y > rect.top + 30 && p.y < rect.bottom - 30) return { id: n.id, x: p.x, y: p.y + 8 };
    }
    return null;
  });
}

test('a townsperson can be opened, closed and opened again', async ({ page }) => {
  const pos = await npcPos(page);
  expect(pos).not.toBeNull();
  await page.touchscreen.tap(pos!.x, pos!.y);
  await expect(page.locator('#npc-card')).toBeVisible();
  await page.locator('#npc-card .npc__bar-close').tap();
  await expect(page.locator('#npc-card')).toBeHidden();
  await page.touchscreen.tap(pos!.x, pos!.y);
  await expect(page.locator('#npc-card')).toBeVisible();
});

test('scrolling the townsperson sheet never scrolls the page beneath', async ({ page, browserName }) => {
  chromeOnly(browserName);
  await fillPage(page);
  const pos = await npcPos(page);
  await page.touchscreen.tap(pos!.x, pos!.y);
  const card = page.locator('#npc-card');
  await expect(card).toBeVisible();
  const box = (await card.boundingBox())!;
  const before = await page.evaluate(() => scrollY);
  const cdp = await page.context().newCDPSession(page);
  await swipe(cdp, box.x + box.width / 2, box.y + box.height * 0.7, -250);
  expect(await card.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => scrollY)).toBe(before);
  // Keep swiping past the end of the sheet: the page must stay put.
  for (let i = 0; i < 3; i++) await swipe(cdp, box.x + box.width / 2, box.y + box.height * 0.7, -600);
  expect(await page.evaluate(() => scrollY)).toBe(before);
  // And back up past the top.
  for (let i = 0; i < 3; i++) await swipe(cdp, box.x + box.width / 2, box.y + box.height * 0.3, 600);
  expect(await page.evaluate(() => scrollY)).toBe(before);
});

test('scrolling an open dialog never scrolls the page beneath', async ({ page, browserName }) => {
  chromeOnly(browserName);
  await fillPage(page);
  await page.locator('#miracle-open').tap();
  const dialog = page.locator('#miracles');
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  const before = await page.evaluate(() => scrollY);
  const cdp = await page.context().newCDPSession(page);
  for (let i = 0; i < 4; i++) await swipe(cdp, box.x + box.width / 2, box.y + box.height * 0.7, -600);
  expect(await dialog.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => scrollY)).toBe(before);
});

test('the realm sheet scrolls itself, not the page', async ({ page, browserName }) => {
  chromeOnly(browserName);
  await fillPage(page);
  await page.locator('#worldmap').tap();
  const pos = await keepPos(page, 0);
  await page.touchscreen.tap(pos.x, pos.y);
  const card = page.locator('#realm-card');
  await expect(card).toBeVisible();
  const box = (await card.boundingBox())!;
  const before = await page.evaluate(() => scrollY);
  const cdp = await page.context().newCDPSession(page);
  for (let i = 0; i < 3; i++) await swipe(cdp, box.x + box.width / 2, box.y + box.height * 0.6, -600);
  expect(await page.evaluate(() => scrollY)).toBe(before);
});

// The map stays pinned while the page scrolls under it; taps on it must still land where they look.
test('taps on the map still land after the page has scrolled', async ({ page }) => {
  await fillPage(page);
  await page.evaluate(() => scrollTo(0, 250));
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await page.locator('#worldmap').tap();
  const pos = await keepPos(page, 2);
  await page.touchscreen.tap(pos.x, pos.y);
  await expect(page.locator('#realm-card')).toBeVisible();
  await page.locator('#realm-card .npc__bar-close').tap();
  await page.locator('#worldmap').tap(); // back to town
  await page.waitForFunction(() => !(window as any).__grimm.scene.sys.isSleeping());
  await page.waitForTimeout(800); // let the townsfolk settle where they are drawn
  const npc = await npcPos(page);
  await page.touchscreen.tap(npc!.x, npc!.y);
  await expect(page.locator('#npc-card')).toBeVisible();
});

test('the miracles dialog shows its miracles even while time is stopped', async ({ page }) => {
  await page.locator('#miracle-open').tap();
  await expect(page.locator('#miracles .miracle')).toHaveCount(9);
});

test('a neighbour can be reopened while time is running', async ({ page }) => {
  await page.locator('#speed button[data-speed="1"]').tap();
  await page.locator('#worldmap').tap();
  for (let round = 0; round < 3; round++) {
    for (const i of [0, 3]) {
      const pos = await keepPos(page, i);
      await page.touchscreen.tap(pos.x, pos.y);
      await expect(page.locator('#realm-card')).toBeVisible();
      await page.waitForTimeout(1200); // let a couple of days pass with the card open
      await page.locator('#realm-card .npc__bar-close').tap();
      await expect(page.locator('#realm-card')).toBeHidden();
    }
  }
});

test('a neighbour reopens after the page scrolled while its card was open', async ({ page, browserName }) => {
  await fillPage(page);
  await page.locator('#worldmap').tap();
  const pos = await keepPos(page, 1);
  await page.touchscreen.tap(pos.x, pos.y);
  await expect(page.locator('#realm-card')).toBeVisible();
  if (browserName === 'chromium') {
    const box = (await page.locator('#realm-card').boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const before = await page.evaluate(() => scrollY);
    for (let i = 0; i < 2; i++) await swipe(cdp, box.x + box.width / 2, box.y + box.height * 0.6, -400);
    expect(await page.evaluate(() => scrollY)).toBe(before); // the page beneath didn't move
    await page.waitForTimeout(1000); // a sheet still gliding swallows a tap, as on any phone
  } else await page.evaluate(() => scrollTo(0, 250));
  await page.locator('#realm-card .npc__bar-close').tap();
  await expect(page.locator('#realm-card')).toBeHidden();
  const again = await keepPos(page, 1);
  await page.touchscreen.tap(again.x, again.y);
  await expect(page.locator('#realm-card')).toBeVisible();
});
