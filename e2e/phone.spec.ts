import { expect, test, type CDPSession, type Page } from '@playwright/test';

// Each test gets a fresh browser context, so a fresh world with no save and no offline report.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__grimm?.scene?.townBuilt === true);
  await page.locator('#speed button[data-speed="0"]').tap(); // hold the world still
});

const card = (page: Page) => page.locator('#npc-card');
const picked = (page: Page) => page.locator('#realms .realm-card--picked');
const section = (page: Page, name: string) => page.locator(`#nav [data-section="${name}"]`).tap();
const sub = (page: Page, key: string) => page.locator(`#sub-tabs [data-sub="${key}"]`).tap();

// A menu item behind the map's menu button.
async function mapTool(page: Page, id: string) {
  await page.locator('#map-menu').tap();
  await expect(page.locator('#map-tools')).toBeVisible();
  await page.locator(id).tap();
  await expect(page.locator('#map-tools')).toBeHidden(); // a pick folds the menu away
}

// A townsperson standing well inside the visible map (or the zoomed close-up of it).
async function npcPos(page: Page, skip?: number) {
  return page.evaluate((skip) => {
    const sc = (window as any).__grimm.scene;
    const c = sc.game.canvas.getBoundingClientRect();
    const m = document.getElementById('map')!.getBoundingClientRect(); // on phones the map shows a strip of the canvas
    const rect = { left: Math.max(c.left, m.left), right: Math.min(c.right, m.right), top: Math.max(c.top, m.top), bottom: Math.min(c.bottom, m.bottom) };
    for (const n of sc.world.npcs) {
      if (n.id === skip) continue;
      const p = n.alive && n.age >= 16 ? sc.npcScreenPos(n.id) : null;
      if (p && p.x > rect.left + 30 && p.x < rect.right - 30 && p.y > rect.top + 30 && p.y < rect.bottom - 30) return { id: n.id as number, x: p.x, y: p.y + 8 };
    }
    return null;
  }, skip);
}

// Tap someone on the town map: their card opens, showing them. While time runs they may step
// aside between finding them and the tap landing, so then any townsperson's card will do.
async function tapNpc(page: Page, skip?: number, exact = true) {
  await page.waitForFunction(() => !(window as any).__grimm.scene.sys.isSleeping());
  // Let the townsfolk finish the step they were drawn taking (a busy machine stretches it).
  let pos = await npcPos(page, skip);
  for (let i = 0; i < 20 && pos; i++) {
    await page.waitForTimeout(150);
    const again = await page.evaluate((id) => (window as any).__grimm.scene.npcScreenPos(id), pos.id);
    if (again && Math.abs(again.x - pos.x) < 0.5 && Math.abs(again.y + 8 - pos.y) < 0.5) break;
    pos = await npcPos(page, skip);
  }
  expect(pos).not.toBeNull();
  await page.touchscreen.tap(pos!.x, pos!.y);
  await expect(card(page)).toBeVisible();
  if (exact) await expect(card(page).locator('.npc__name')).toHaveText(await page.evaluate((id) => (window as any).__grimm.scene.world.npcs.find((n: any) => n.id === id).name, pos!.id));
  return pos!.id;
}

// Half height closes from the card's own cross; the whole card from the cross on its bar.
async function closeCard(page: Page) {
  const full = await card(page).evaluate((el) => el.classList.contains('npc--full'));
  await card(page).locator(full ? '.npc__bar-close' : '.npc__head .npc__close').tap();
  await expect(card(page)).toBeHidden();
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

// The keeps the (cropped) world map shows, by index.
async function shownKeeps(page: Page): Promise<number[]> {
  await page.waitForFunction(() => (window as any).__grimm.scene.game.scene.getScene('worldmap').built === true);
  const box = (await page.locator('#map').boundingBox())!;
  const out: number[] = [];
  for (let i = 0; i < 4; i++) {
    const p = await keepPos(page, i);
    const underButtons = p.y < box.y + 52 && p.x > box.x + box.width - 56; // the menu button
    if (p.y > box.y + 14 && p.y < box.y + box.height - 34 && p.x > box.x + 10 && p.x < box.x + box.width - 10 && !underButtons) out.push(i);
  }
  expect(out.length).toBeGreaterThan(1);
  return out;
}

async function tapKeep(page: Page, index: number) {
  const pos = await keepPos(page, index);
  await page.touchscreen.tap(pos.x, pos.y);
  await expect(picked(page)).toHaveAttribute('data-realm', String(pos.id));
}

// A land well away from every keep, on dry ground, and where it sits on screen.
async function landPos(page: Page) {
  await page.waitForFunction(() => (window as any).__grimm.scene.game.scene.getScene('worldmap').built === true);
  return page.evaluate(() => {
    const g = (window as any).__grimm.scene.game;
    const wm = g.scene.getScene('worldmap');
    const w = wm.world;
    const rect = g.canvas.getBoundingClientRect();
    const k = rect.width / g.scale.gameSize.width;
    const box = document.getElementById('map')!.getBoundingClientRect();
    for (const r of w.regions) {
      if (r.seat || w.realms.some((m: any) => Math.hypot(m.x - r.x, m.y - r.y) < 4)) continue;
      const sy = rect.top + (r.y * 16 + 8) * k;
      if (sy < box.top + 20 || sy > box.bottom - 30) continue; // out of the cropped strip, or under the chips
      if (wm.ground[r.y * 40 + r.x] === 'water') continue;
      return { id: r.id as number, name: r.name as string, x: rect.left + (r.x * 16 + 8) * k, y: rect.top + (r.y * 16 + 8) * k };
    }
    return null;
  });
}

// A finger drag from x, y by dx, dy, as raw touch events.
async function swipe(cdp: CDPSession, x: number, y: number, dx: number, dy: number) {
  const steps = 12;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / steps, y: y + (dy * i) / steps }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await new Promise((r) => setTimeout(r, 300));
}

// Touch drags are driven through Chrome's DevTools protocol, which WebKit lacks.
const chromeOnly = (browserName: string) => test.skip(browserName !== 'chromium', 'touch drags need Chrome DevTools');

const camera = (page: Page) => page.evaluate(() => {
  const c = (window as any).__grimm.scene.cameras.main;
  return { x: c.scrollX as number, y: c.scrollY as number, zoom: c.zoom as number };
});

// The page itself never scrolls: only the panels in the sheet do.
const pageStill = async (page: Page) => expect(await page.evaluate(() => [scrollX, scrollY, document.scrollingElement!.scrollTop])).toEqual([0, 0, 0]);

test('every section opens its panel, and the town map still answers a tap after each', async ({ page }) => {
  const panels: [string, string][] = [['people', '#people'], ['power', '#kingdom'], ['economy', '#market'], ['town', '#urgent']];
  for (const [name, panel] of panels) {
    await section(page, name);
    await expect(page.locator(`#nav [data-section="${name}"]`)).toHaveAttribute('aria-current', 'page');
    await expect(page.locator(panel)).toBeVisible();
    await tapNpc(page);
    await closeCard(page);
  }
  await pageStill(page);
});

test('every tab in every section, then a tap on the map', async ({ page }) => {
  test.setTimeout(120_000); // sixteen tabs, a tap on the map after each
  const tabs: [string, string, string][] = [
    ['town', 'years', '#annals'],
    ['town', 'all', '#feed'],
    ['town', 'urgent', '#urgent'],
    ['people', 'guild', '#guild'],
    ['people', 'quests', '#guild'],
    ['people', 'people', '#people'],
    ['power', 'council', '#kingdom'],
    ['power', 'law', '#kingdom'],
    ['power', 'court', '#kingdom'],
    ['power', 'faith', '#faith'],
    ['power', 'threat', '#kingdom'],
    ['power', 'overview', '#kingdom'],
    ['economy', 'houses', '#market'],
    ['economy', 'works', '#kingdom'],
    ['economy', 'research', '#kingdom'],
    ['economy', 'market', '#market'],
  ];
  for (const [name, key, panel] of tabs) {
    await section(page, name);
    await sub(page, key);
    await expect(page.locator(panel)).toBeVisible();
    await expect(page.locator(`#sub-tabs [data-sub="${key}"]`)).toHaveAttribute('aria-pressed', 'true');
    // A shared panel shows only this tab's parts.
    if (['#kingdom', '#market', '#guild'].includes(panel)) {
      const shown = () => page.locator(`${panel} > [data-group]:not([hidden])`).evaluateAll((els) => [...new Set(els.map((e) => (e as HTMLElement).dataset.group))].length);
      await expect.poll(shown).toBe(1);
    }
    await tapNpc(page);
    await closeCard(page);
  }
  // On a phone the card covers the tabs, so "this one" gives way to the story on the card.
  await section(page, 'town');
  await expect(page.locator('#sub-tabs [data-sub="npc"]')).toBeHidden();
  await page.locator('#speed button[data-speed="3"]').tap();
  await page.waitForFunction(() => (window as any).__grimm.scene.world.chronicle.some((e: any) => e.npcId !== undefined), null, { timeout: 40_000 });
  await page.locator('#speed button[data-speed="0"]').tap();
  const told = await page.evaluate(() => (window as any).__grimm.scene.world.chronicle.findLast((e: any) => e.npcId !== undefined));
  await page.evaluate((id) => (window as any).__grimm.select(id), told.npcId);
  await expect(card(page).locator('.npc__life')).toContainText(told.text);
  await closeCard(page);
});

test('every map menu item works and leaves the map tappable', async ({ page }) => {
  await expect(page.locator('#map-tools')).toBeHidden();
  // Open and close the menu by its own button, and by a tap elsewhere.
  await page.locator('#map-menu').tap();
  await expect(page.locator('#map-tools')).toBeVisible();
  await page.locator('#map-menu').tap();
  await expect(page.locator('#map-tools')).toBeHidden();
  await page.locator('#map-menu').tap();
  await page.locator('#urgent').tap({ position: { x: 10, y: 10 } });
  await expect(page.locator('#map-tools')).toBeHidden();

  for (const id of ['#daynight', '#sound', '#zoom']) {
    const before = await page.locator(id).getAttribute('aria-pressed');
    await mapTool(page, id);
    await expect(page.locator(id)).not.toHaveAttribute('aria-pressed', before!);
    await tapNpc(page);
    await closeCard(page);
    await mapTool(page, id); // and back
    await expect(page.locator(id)).toHaveAttribute('aria-pressed', before!);
    await tapNpc(page);
    await closeCard(page);
  }
});

test('zoomed in, the map drags and taps still pick people, again and again', async ({ page, browserName }) => {
  chromeOnly(browserName);
  await mapTool(page, '#zoom');
  expect((await camera(page)).zoom).toBe(2);
  const box = (await page.locator('#game canvas').boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  for (const [dx, dy] of [[-90, -50], [80, 60], [0, -70], [-60, 0], [120, 90]]) {
    const before = await camera(page);
    await swipe(cdp, box.x + box.width / 2, box.y + box.height / 2, dx, dy);
    const after = await camera(page);
    expect(after.x !== before.x || after.y !== before.y).toBe(true); // the drag panned the map
    await pageStill(page);
    await tapNpc(page);
    await closeCard(page);
  }
  // A drag that starts on the map and ends over the sheet below must not leave the map stuck.
  await swipe(cdp, box.x + box.width / 2, box.y + box.height - 20, 0, 300);
  await tapNpc(page);
  await closeCard(page);
  // A drag while someone's card is open keeps the card, and a tap on someone else switches to them.
  const first = await tapNpc(page);
  await swipe(cdp, box.x + box.width / 2, box.y + box.height / 2, -40, -30);
  await expect(card(page)).toBeVisible();
  const second = await tapNpc(page, first);
  expect(second).not.toBe(first);
  await closeCard(page);
  // Zoomed back out, the whole town is tappable again.
  await mapTool(page, '#zoom');
  expect((await camera(page)).zoom).toBe(1);
  await tapNpc(page);
  await closeCard(page);
  await pageStill(page);
});

test('unzoomed, a drag on the map moves nothing and a tap after it still lands', async ({ page, browserName }) => {
  chromeOnly(browserName);
  const box = (await page.locator('#game canvas').boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const before = await camera(page);
  await swipe(cdp, box.x + box.width / 2, box.y + box.height / 2, 0, -150);
  await swipe(cdp, box.x + box.width / 2, box.y + box.height / 2, 0, 150);
  expect(await camera(page)).toEqual(before);
  await pageStill(page);
  await tapNpc(page);
});

test('the townsperson card: half height, full height, dreams, and back to the map', async ({ page }) => {
  const first = await tapNpc(page);
  await expect(card(page)).not.toHaveClass(/npc--full/);
  // The powers are in view at half height.
  await expect(card(page).locator('.power').first()).toBeInViewport();
  await card(page).locator('.npc__open').tap();
  await expect(card(page)).toHaveClass(/npc--full/);
  await card(page).locator('.npc__bar-grow').tap();
  await expect(card(page)).not.toHaveClass(/npc--full/);
  // Sending a dream pulls the sheet up with the dreams to pick from.
  await page.locator('#speed button[data-speed="3"]').tap(); // gather the faith a dream costs
  await page.waitForFunction(() => (window as any).__grimm.scene.world.faith >= 10, null, { timeout: 40_000 });
  await page.locator('#speed button[data-speed="0"]').tap();
  const dream = card(page).locator('.power', { hasText: 'ส่งความฝัน' });
  await expect(dream).toBeEnabled();
  await dream.tap();
  await expect(card(page)).toHaveClass(/npc--full/);
  await expect(card(page).locator('.dream-kinds')).toBeInViewport();
  await closeCard(page);
  // The next person opens at half height again.
  await tapNpc(page, first);
  await expect(card(page)).not.toHaveClass(/npc--full/);
  await closeCard(page);
});

test('the god-powers sheet and the era dialog open and close, and the map still answers', async ({ page }) => {
  await page.locator('#miracle-open').tap();
  const powers = page.locator('#miracles');
  await expect(powers).toBeVisible();
  await expect(page.locator('#miracles .miracle')).toHaveCount(19);
  await powers.locator('.dialog-x').tap();
  await expect(powers).toBeHidden();
  await tapNpc(page);
  await closeCard(page);
  // The era dialog opens over the powers sheet.
  await page.locator('#miracle-open').tap();
  await page.locator('#era-open').tap();
  await expect(page.locator('#eras')).toBeVisible();
  await page.locator('#eras form button').tap();
  await expect(page.locator('#eras')).toBeHidden();
  await powers.locator('.dialog-x').tap();
  await expect(powers).toBeHidden();
  await tapNpc(page);
  await closeCard(page);
});

test('the god-powers sheet fits the screen, keeps its close button in view, and closes from outside', async ({ page, browserName }) => {
  chromeOnly(browserName);
  await page.locator('#miracle-open').tap();
  const powers = page.locator('#miracles');
  await expect(powers).toBeVisible();
  const box = (await powers.boundingBox())!;
  const vh = await page.evaluate(() => innerHeight);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(vh + 1);
  expect(box.width).toBeGreaterThan((await page.evaluate(() => innerWidth)) - 2); // full width on a phone
  // Scroll the miracles all the way down: the close button stays in view.
  const cdp = await page.context().newCDPSession(page);
  for (let i = 0; i < 4; i++) await swipe(cdp, box.x + box.width / 2, box.y + box.height * 0.8, 0, -500);
  expect(await powers.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(powers.locator('.dialog-x')).toBeInViewport();
  await powers.locator('.dialog-x').tap();
  await expect(powers).toBeHidden();
  // A tap on the dim backdrop above the sheet closes it too.
  await page.locator('#miracle-open').tap();
  await expect(powers).toBeVisible();
  const top = (await powers.boundingBox())!.y;
  await page.touchscreen.tap(20, top / 2);
  await expect(powers).toBeHidden();
  await tapNpc(page);
  await closeCard(page);
});

test('a tap on the title opens the sheet over the map, hides the speech bubbles, and folds back', async ({ page }) => {
  const side = page.locator('#side');
  const mapTop = (await page.locator('#map').boundingBox())!.y;
  const before = (await side.boundingBox())!;
  await expect(page.locator('#bubbles')).toBeAttached();
  await page.locator('#sheet-toggle').tap();
  await expect(page.locator('#app')).toHaveAttribute('data-sheet', 'full');
  const full = (await side.boundingBox())!;
  expect(full.y).toBeLessThanOrEqual(mapTop + 1);
  expect(full.height).toBeGreaterThan(before.height + 150);
  await expect(page.locator('#bubbles')).toBeHidden();
  // The same in every section: the world map's sheet too.
  await section(page, 'world');
  await expect(page.locator('#sheet-toggle')).toBeVisible();
  await section(page, 'town');
  await page.locator('#sheet-toggle').tap();
  await expect(page.locator('#app')).not.toHaveAttribute('data-sheet', 'full');
  await expect(page.locator('#bubbles')).toBeVisible();
  await tapNpc(page);
  // A whole card covers the map too: no bubbles over it.
  await card(page).locator('.npc__open').tap();
  await expect(page.locator('#bubbles')).toBeHidden();
  await closeCard(page);
  await expect(page.locator('#bubbles')).toBeVisible();
  await tapNpc(page);
  await closeCard(page);
});

test('scrolling the sheet and the card never moves the page, and the map still answers', async ({ page, browserName }) => {
  chromeOnly(browserName);
  await sub(page, 'all');
  await page.locator('#speed button[data-speed="3"]').tap();
  await page.waitForFunction(() => document.querySelectorAll('#feed .entry').length > 12, null, { timeout: 40_000 });
  await page.locator('#speed button[data-speed="0"]').tap();
  const cdp = await page.context().newCDPSession(page);
  const feed = page.locator('#feed');
  const box = (await feed.boundingBox())!;
  for (let i = 0; i < 3; i++) await swipe(cdp, box.x + box.width / 3, box.y + box.height * 0.8, 0, -500);
  expect(await feed.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await pageStill(page);
  for (let i = 0; i < 4; i++) await swipe(cdp, box.x + box.width / 3, box.y + box.height * 0.2, 0, 500);
  await pageStill(page);
  await tapNpc(page);
  const c = (await card(page).boundingBox())!;
  for (let i = 0; i < 3; i++) await swipe(cdp, c.x + c.width / 2, c.y + c.height * 0.8, 0, -500);
  await pageStill(page);
  await closeCard(page);
  await tapNpc(page);
  await closeCard(page);
});

test('the world map: keeps, lands, a land up close, and back to a tappable town', async ({ page }) => {
  await section(page, 'world');
  await expect(page.locator('#realms .realm-card')).toHaveCount(4);
  await expect(page.locator('#zoom')).toBeHidden();
  const keeps = await shownKeeps(page);
  for (const i of [...keeps, keeps[0]]) await tapKeep(page, i);
  // A tapped card picks its realm too.
  const second = page.locator('#realms .realm-card').nth(1);
  await second.locator('.realm-card__head').tap();
  await expect(second).toHaveClass(/realm-card--picked/);
  // Open country: the lands tab opens on the land tapped.
  const land = await landPos(page);
  expect(land).not.toBeNull();
  await page.touchscreen.tap(land!.x, land!.y);
  await expect(page.locator('#lands')).toBeVisible();
  await expect(page.locator('#sub-tabs [data-sub="lands"]')).toHaveAttribute('aria-pressed', 'true');
  const pickedLand = page.locator('#lands .realm-card--picked');
  await expect(pickedLand).toContainText(land!.name);
  // Up close and back out.
  await pickedLand.getByRole('button', { name: 'ดูพื้นที่' }).tap();
  await page.waitForFunction(() => (window as any).__grimm.scene.game.scene.isActive('region'));
  await page.locator('#lands .realm-card--picked').getByRole('button', { name: 'กลับแผนที่โลก' }).tap();
  await page.waitForFunction(() => (window as any).__grimm.scene.game.scene.isActive('worldmap'));
  await sub(page, 'realms');
  await tapKeep(page, keeps[1]);
  // The war tab, and the world's own way home.
  await sub(page, 'war');
  await expect(page.locator('#kingdom')).toBeVisible();
  await mapTool(page, '#worldmap-tool'); // the menu's way home
  await expect(page.locator('#nav [data-section="town"]')).toHaveAttribute('aria-current', 'page');
  await tapNpc(page);
  await closeCard(page);
  // Every other section takes us home to the town, which answers taps again.
  for (const name of ['town', 'people', 'power', 'economy']) {
    await section(page, 'world');
    await sub(page, 'realms');
    await tapKeep(page, keeps[0]);
    await section(page, name);
    await page.waitForFunction(() => (window as any).__grimm.scene.game.scene.isActive('world'));
    await tapNpc(page);
    await closeCard(page);
  }
  await pageStill(page);
});

test('land cards open in place, keep their order, and fold from their head', async ({ page }) => {
  // Let the crown settle a second land, so there are two cards to open.
  await page.evaluate(() => (window as any).__grimm.send({ type: 'speed', tickMs: 5 }));
  await page.waitForFunction(() => ((window as any).__grimm.scene.world.regions ?? []).filter((r: any) => r.owner === 'us' && !r.seat).length >= 2, null, { timeout: 50_000 });
  await page.locator('#speed button[data-speed="0"]').tap();
  await section(page, 'world');
  await sub(page, 'lands');
  const cards = page.locator('#lands .realm-card');
  await expect(cards.nth(1)).toBeVisible();
  const order = await cards.locator('.realm-card__head b').allTextContents();
  await cards.nth(1).locator('.realm-card__head b').tap(); // the name, clear of the floating powers button
  await expect(cards.nth(1)).toHaveClass(/realm-card--picked/);
  await expect(cards.nth(1).locator('.realm-card__head')).toHaveAttribute('aria-expanded', 'true');
  const names = (t: string[]) => t.map((x) => x.replace(/^[▸▾] /, ''));
  expect(names(await cards.locator('.realm-card__head b').allTextContents())).toEqual(names(order));
  // Opening another folds the first; the head of the open one folds it.
  await cards.nth(0).locator('.realm-card__head b').tap();
  await expect(cards.nth(0)).toHaveClass(/realm-card--picked/);
  await expect(cards.nth(1)).not.toHaveClass(/realm-card--picked/);
  await cards.nth(0).locator('.realm-card__head').tap();
  await expect(page.locator('#lands .realm-card--picked')).toHaveCount(0);
  expect(names(await cards.locator('.realm-card__head b').allTextContents())).toEqual(names(order));
});

test('leaving the world map from a land up close goes straight home', async ({ page }) => {
  await section(page, 'world');
  const land = await landPos(page);
  await page.touchscreen.tap(land!.x, land!.y);
  await page.locator('#lands .realm-card--picked').getByRole('button', { name: 'ดูพื้นที่' }).tap();
  await page.waitForFunction(() => (window as any).__grimm.scene.game.scene.isActive('region'));
  await section(page, 'town');
  await page.waitForFunction(() => {
    const s = (window as any).__grimm.scene.game.scene;
    return s.isActive('world') && !s.isActive('region') && !s.isActive('worldmap');
  });
  await tapNpc(page);
  await closeCard(page);
  // And the world map comes back as the map, not the land.
  await section(page, 'world');
  await sub(page, 'realms');
  await tapKeep(page, (await shownKeeps(page))[0]);
});

test('a villager can be tapped on a land up close, and the town answers after', async ({ page }) => {
  // Let the first families settle a land.
  await page.evaluate(() => (window as any).__grimm.send({ type: 'speed', tickMs: 5 })); // years in seconds
  await page.waitForFunction(() => ((window as any).__grimm.scene.world.villagers ?? []).some((n: any) => n.alive && n.regionId !== undefined), null, { timeout: 50_000 });
  await page.locator('#speed button[data-speed="0"]').tap();
  const land = await page.evaluate(() => {
    const w = (window as any).__grimm.scene.world;
    const id = w.villagers.find((n: any) => n.alive && n.regionId !== undefined).regionId;
    return w.regions.find((r: any) => r.id === id).name as string;
  });
  await section(page, 'world');
  await sub(page, 'lands');
  await page.locator('#lands .realm-card', { hasText: land }).locator('.realm-card__head').tap();
  await page.locator('#lands .realm-card--picked').getByRole('button', { name: 'ดูพื้นที่' }).tap();
  await page.waitForFunction(() => (window as any).__grimm.scene.game.scene.getScene('region').walkers?.length > 0);
  await page.waitForTimeout(300);
  const who = await page.evaluate(() => {
    const g = (window as any).__grimm.scene.game;
    const rs = g.scene.getScene('region');
    const rect = g.canvas.getBoundingClientRect();
    const cam = rs.cameras.main;
    const k = (rect.width / g.scale.gameSize.width) * cam.zoom;
    for (const w of rs.walkers) {
      w.wait = 1e9; // hold them still for the tap
      const s = w.sprite;
      const x = rect.left + (s.x - cam.worldView.x) * k;
      const y = rect.top + (s.y - s.displayHeight / 2 - cam.worldView.y) * k;
      const m = document.getElementById('map')!.getBoundingClientRect(); // the strip of the canvas on show
      if (x > rect.left + 10 && x < rect.right - 10 && y > Math.max(rect.top, m.top) + 10 && y < Math.min(rect.bottom, m.bottom) - 10) return { id: w.id as number, x, y };
    }
    return null;
  });
  expect(who).not.toBeNull();
  await page.waitForTimeout(400); // let a step in progress finish
  const again = await page.evaluate((id) => {
    const g = (window as any).__grimm.scene.game;
    const rs = g.scene.getScene('region');
    const rect = g.canvas.getBoundingClientRect();
    const cam = rs.cameras.main;
    const k = (rect.width / g.scale.gameSize.width) * cam.zoom;
    const s = rs.walkers.find((w: any) => w.id === id).sprite;
    return { x: rect.left + (s.x - cam.worldView.x) * k, y: rect.top + (s.y - s.displayHeight / 2 - cam.worldView.y) * k };
  }, who!.id);
  await page.touchscreen.tap(again.x, again.y);
  const name = await page.evaluate((id) => (window as any).__grimm.scene.world.villagers.find((n: any) => n.id === id).name, who!.id);
  await expect(page.locator('#lands .chip--on')).toHaveText(name);
  await section(page, 'town');
  await tapNpc(page);
  await closeCard(page);
});

test('keeps and townsfolk can be picked again and again while time is running', async ({ page }) => {
  await page.locator('#speed button[data-speed="1"]').tap();
  for (let round = 0; round < 2; round++) {
    await section(page, 'world');
    await sub(page, 'realms');
    const keeps = await shownKeeps(page);
    for (const i of [keeps[0], keeps.at(-1)!]) {
      await tapKeep(page, i);
      await page.waitForTimeout(1200); // let a couple of days pass, the list rebuilding under it
    }
    await section(page, 'town');
    for (let i = 0; i < 2; i++) {
      await tapNpc(page, undefined, false);
      await page.waitForTimeout(1200);
      await closeCard(page);
    }
  }
});

test('a miracle tile shows what it does before it is worked, and a dream goes to the next person tapped', async ({ page }) => {
  await page.locator('#speed button[data-speed="3"]').tap(); // gather some faith
  await page.waitForFunction(() => (window as any).__grimm.scene.world.faith >= 10, null, { timeout: 40_000 });
  await page.locator('#speed button[data-speed="0"]').tap();
  await page.locator('#miracle-open').tap();
  const powers = page.locator('#miracles');
  const tile = powers.locator('.miracle').first();
  await tile.tap();
  await expect(tile).toHaveAttribute('aria-pressed', 'true');
  await expect(powers.locator('.miracle-detail')).toBeVisible();
  await expect(powers.locator('.miracle-go')).toBeVisible();
  await tile.tap(); // a second tap folds it away
  await expect(powers.locator('.miracle-detail')).toHaveCount(0);
  // The dream: the sheet closes, the map asks for someone, and their card opens on the dreams.
  await powers.locator('#dream-open').tap();
  await expect(powers).toBeHidden();
  await expect(page.locator('#map-note')).toHaveClass(/map-note--ask/);
  await tapNpc(page);
  await expect(card(page)).toHaveClass(/npc--full/);
  await expect(card(page).locator('.dream-kinds')).toBeInViewport();
  await expect(page.locator('#map-note')).not.toHaveClass(/map-note--ask/);
  await closeCard(page);
  await tapNpc(page);
  await closeCard(page);
});

test('the religion tab: creeds, the holy day, the rites; a believer opens with their faith on the card', async ({ page }) => {
  await section(page, 'power');
  await sub(page, 'faith');
  const view = page.locator('#faith');
  await expect(view).toBeVisible();
  await expect(view.locator('.k-tile')).toHaveCount(3);
  await expect(view.locator('.ballot__row')).toHaveCount(3);
  await expect(view.locator('.faith-holy')).toContainText('วันพระ');
  // The creed counts add up to the grown townsfolk.
  const [shown, grown] = await Promise.all([
    view.locator('.ballot__row b').evaluateAll((els) => els.reduce((s, e) => s + Number(e.textContent), 0)),
    page.evaluate(() => (window as any).__grimm.scene.world.npcs.filter((n: any) => n.alive && n.age >= 16 && n.creed).length),
  ]);
  expect(shown).toBe(grown);
  // A devout believer's row opens their card, which tells their faith once opened in full.
  const row = view.locator('.guild-sec').nth(1).locator('.chip--button').first();
  const name = await row.textContent();
  await row.tap();
  await expect(card(page).locator('.npc__name')).toHaveText(name!);
  await card(page).locator('.npc__open').tap();
  await expect(card(page)).toHaveClass(/npc--full/);
  await expect(card(page).locator('.npc__faith')).toContainText('นับถือเทพเจ้า');
  await closeCard(page);
  await tapNpc(page);
  await closeCard(page);
  await pageStill(page);
});

test('the people list filters, and a row opens that person', async ({ page }) => {
  await section(page, 'people');
  const rows = page.locator('#people .people-row');
  await expect(rows.first()).toBeVisible();
  const all = await rows.count();
  await page.locator('#people .filter-chip', { hasText: 'นักผจญภัย' }).tap();
  await expect(page.locator('#people .filter-chip', { hasText: 'นักผจญภัย' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => rows.count()).toBeLessThan(all + 1);
  const name = (await rows.first().locator('b').textContent())!;
  await rows.first().tap();
  await expect(card(page)).toBeVisible();
  await expect(card(page).locator('.npc__name')).toHaveText(name);
  await closeCard(page);
  await page.locator('#people .filter-chip', { hasText: 'ทั้งหมด' }).tap();
  await tapNpc(page);
  await closeCard(page);
});

test('day and night can be held at noon, and the choice is remembered', async ({ page }) => {
  const alpha = () => page.evaluate(() => (window as any).__grimm.scene.sky.alpha as number);
  await page.evaluate(() => {
    const sc = (window as any).__grimm.scene;
    sc.world.day = sc.clock = 8; // midnight, held: time is stopped
  });
  await page.waitForTimeout(200);
  expect(await alpha()).toBeGreaterThan(0.3);
  await mapTool(page, '#daynight');
  await page.waitForTimeout(200);
  expect(await alpha()).toBeLessThan(0.05);
  await page.reload();
  await page.waitForFunction(() => (window as any).__grimm?.scene?.townBuilt === true);
  await expect(page.locator('#daynight')).toHaveAttribute('aria-pressed', 'false');
});
