import { expect, test, type CDPSession, type Page } from '@playwright/test';

// Each test gets a fresh browser context, so a fresh world with no save and no offline report.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__grimm?.scene?.townBuilt === true);
  await page.locator('#speed button[data-speed="0"]').tap(); // hold the world still
});

// On a phone the map's buttons fold behind a menu button: open it first when needed.
async function mapButton(page: Page, id: string) {
  const b = page.locator(id);
  if (!(await b.isVisible())) await page.locator('#map-menu').tap();
  await b.tap();
}

// Where a world-map keep sits on screen.
async function keepPos(page: Page, index: number) {
  await page.waitForFunction(() => (window as any).__grimm.scene.game.scene.getScene('worldmap').built === true);
  return page.evaluate((i) => {
    const g = (window as any).__grimm.scene.game;
    const r = g.scene.getScene('worldmap').world.realms[i];
    const rect = g.canvas.getBoundingClientRect();
    const k = rect.width / g.scale.gameSize.width;
    return { id: r.id as number, x: rect.left + (r.x * 16 + 8) * k, y: rect.top + (r.y * 16 + 4) * k };
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

const picked = (page: Page) => page.locator('#realms .realm-card--picked');

test('the world map lists every neighbour, and a tapped keep is picked out', async ({ page }) => {
  await mapButton(page, '#worldmap');
  await expect(page.locator('#realms .realm-card')).toHaveCount(4);
  await expect(page.locator('#side-tabs')).toBeHidden();
  for (const i of [0, 1, 2, 3, 0]) {
    const pos = await keepPos(page, i);
    await page.touchscreen.tap(pos.x, pos.y);
    await expect(picked(page)).toHaveAttribute('data-realm', String(pos.id));
  }
  // Back to town: the tabs return and the list goes.
  await mapButton(page, '#worldmap');
  await expect(page.locator('#side-tabs')).toBeVisible();
  await expect(page.locator('#realms')).toBeHidden();
  await expect(page.locator('#feed')).toBeVisible();
});

test('tapping a realm card picks it', async ({ page }) => {
  await mapButton(page, '#worldmap');
  const second = page.locator('#realms .realm-card').nth(1);
  await second.locator('.realm-card__head').tap();
  await expect(second).toHaveClass(/realm-card--picked/);
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

// The map stays pinned while the page scrolls under it; taps on it must still land where they look.
test('taps on the map still land after the page has scrolled', async ({ page }) => {
  await fillPage(page);
  await page.evaluate(() => scrollTo(0, 250));
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await mapButton(page, '#worldmap');
  const pos = await keepPos(page, 2);
  await page.touchscreen.tap(pos.x, pos.y);
  await expect(picked(page)).toHaveAttribute('data-realm', String(pos.id));
  await mapButton(page, '#worldmap'); // back to town
  await page.waitForFunction(() => !(window as any).__grimm.scene.sys.isSleeping());
  await page.waitForTimeout(800); // let the townsfolk settle where they are drawn
  const npc = await npcPos(page);
  await page.touchscreen.tap(npc!.x, npc!.y);
  await expect(page.locator('#npc-card')).toBeVisible();
});

test('the miracles dialog shows its miracles even while time is stopped', async ({ page }) => {
  await page.locator('#miracle-open').tap();
  await expect(page.locator('#miracles .miracle')).toHaveCount(19);
});

test('keeps can be picked again and again while time is running', async ({ page }) => {
  await page.locator('#speed button[data-speed="1"]').tap();
  await mapButton(page, '#worldmap');
  for (let round = 0; round < 3; round++) {
    for (const i of [0, 3]) {
      const pos = await keepPos(page, i);
      await page.touchscreen.tap(pos.x, pos.y);
      await expect(picked(page)).toHaveAttribute('data-realm', String(pos.id));
      await page.waitForTimeout(1200); // let a couple of days pass, the list rebuilding under it
    }
  }
});

test('the map buttons fold behind the menu button and fold away again', async ({ page }) => {
  await expect(page.locator('#map-menu')).toBeVisible();
  await expect(page.locator('#worldmap')).toBeHidden();
  await page.locator('#map-menu').tap();
  await expect(page.locator('#worldmap')).toBeVisible();
  await expect(page.locator('#sound')).toBeVisible();
  await page.waitForTimeout(4500);
  await expect(page.locator('#worldmap')).toBeHidden();
});

test('day and night can be held at noon, and the choice is remembered', async ({ page }) => {
  const alpha = () => page.evaluate(() => (window as any).__grimm.scene.sky.alpha as number);
  await page.evaluate(() => {
    const sc = (window as any).__grimm.scene;
    sc.world.day = sc.clock = 8; // midnight, held: time is stopped
  });
  await page.waitForTimeout(200);
  expect(await alpha()).toBeGreaterThan(0.3);
  await mapButton(page, '#daynight');
  await page.waitForTimeout(200);
  expect(await alpha()).toBeLessThan(0.05);
  await page.reload();
  await page.waitForFunction(() => (window as any).__grimm?.scene?.townBuilt === true);
  await expect(page.locator('#daynight')).toHaveAttribute('aria-pressed', 'false');
});
