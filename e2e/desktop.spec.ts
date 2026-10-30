import { expect, test, type Page } from '@playwright/test';

// The wide layout: nav down the left, map in the middle, sheet on the right, all by mouse.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__grimm?.scene?.townBuilt === true);
  await page.locator('#speed button[data-speed="0"]').click();
});

async function clickNpc(page: Page) {
  await page.waitForFunction(() => !(window as any).__grimm.scene.sys.isSleeping());
  await page.waitForTimeout(300);
  const pos = await page.evaluate(() => {
    const sc = (window as any).__grimm.scene;
    const rect = sc.game.canvas.getBoundingClientRect();
    for (const n of sc.world.npcs) {
      const p = n.alive && n.age >= 16 ? sc.npcScreenPos(n.id) : null;
      if (p && p.x > rect.left + 60 && p.x < rect.right - 60 && p.y > rect.top + 60 && p.y < rect.bottom - 30) return { x: p.x, y: p.y + 8 };
    }
    return null;
  });
  expect(pos).not.toBeNull();
  await page.mouse.click(pos!.x, pos!.y);
  await expect(page.locator('#npc-card')).toBeVisible();
}

test('sections, the map menu, the card and the world map by mouse', async ({ page }) => {
  for (const [name, panel] of [['people', '#people'], ['power', '#kingdom'], ['economy', '#market'], ['town', '#urgent']]) {
    await page.locator(`#nav [data-section="${name}"]`).click();
    await expect(page.locator(panel)).toBeVisible();
    await clickNpc(page);
    await page.locator('#npc-card .npc__close').click();
    await expect(page.locator('#npc-card')).toBeHidden();
  }
  // The card sits above the panel, and "this one" filters the chronicle to them.
  await clickNpc(page);
  await page.locator('#sub-tabs [data-sub="npc"]').click();
  await expect(page.locator('#feed')).toBeVisible();
  await expect(page.locator('#sub-tabs [data-sub="npc"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#npc-card .npc__close').click();
  for (const id of ['#zoom', '#daynight', '#sound', '#zoom']) {
    await page.locator('#map-menu').click();
    await page.locator(id).click();
    await expect(page.locator('#map-tools')).toBeHidden();
    await clickNpc(page);
    await page.locator('#npc-card .npc__close').click();
  }
  await page.locator('#miracle-open').click();
  await expect(page.locator('#miracles .miracle')).toHaveCount(19);
  await page.locator('#miracles .dialog-x').click();
  await page.locator('#nav [data-section="world"]').click();
  await expect(page.locator('#realms .realm-card')).toHaveCount(4);
  await page.locator('#nav [data-section="town"]').click();
  await clickNpc(page);
});

test('the dreams to send wrap inside the card instead of running off its side', async ({ page }) => {
  await page.locator('#nav [data-section="power"]').click();
  await page.locator('#sub-tabs [data-sub="faith"]').click();
  await page.locator('#speed button[data-speed="3"]').click(); // gather the faith a dream costs
  await page.waitForFunction(() => (window as any).__grimm.scene.world.faith >= 10, null, { timeout: 40_000 });
  await page.locator('#speed button[data-speed="0"]').click();
  await clickNpc(page);
  await page.locator('#npc-card .power', { hasText: 'ส่งความฝัน' }).click();
  await expect(page.locator('#npc-card .dream-pick')).toBeVisible();
  for (const id of ['#npc-card', '#side']) expect(await page.locator(id).evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(0);
  await page.locator('#npc-card .npc__head .npc__close').click();
  await expect(page.locator('#npc-card')).toBeHidden();
});
