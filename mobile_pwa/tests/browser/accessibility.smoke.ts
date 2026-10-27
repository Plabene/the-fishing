import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
  // The fixture stubs provider responses; block accidental external browser requests too.
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('tests/responsive-fixture.html');
  await expect(page.locator('#query-submit')).toBeEnabled();
});
test('responsive keyboard journey preserves exact filters, data, focus and native disclosure semantics',async({page},testInfo)=>{
  await page.screenshot({path:testInfo.outputPath('before.png'),fullPage:true});
  const overflow=()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
  expect(await overflow()).toBe(true);
  await page.locator('#fixture-scenario').press('Tab');
  await expect(page.locator('#skip-results')).toBeFocused();
  await page.keyboard.press('Enter');await expect(page.locator('#booking-heading')).toBeFocused();
  await page.locator('[data-tier=tier1]').press('Space');await expect(page.locator('[data-tier=tier1]')).toBeFocused();await expect(page.locator('[data-tier=tier1]')).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('Tab');await expect(page.locator('[data-tier=tier2]')).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('[data-tier=tier2]')).toBeFocused();await expect(page.locator('[data-tier=tier2]')).toHaveAttribute('aria-pressed','true');await page.keyboard.press('Shift+Tab');await expect(page.locator('[data-tier=tier1]')).toBeFocused();
  await page.locator('#region-toggle>summary').press('Enter');
  await page.locator('[data-region-field=province]>summary').press('Space');
  const province=page.locator('[data-region-choice=province][value="충청남도"]');await province.press('Space');await expect(province).toBeFocused();await expect(page.locator('#reservation-filter-summary')).toContainText('전북특별자치도');await province.press('Escape');await expect(page.locator('[data-region-field=province]>summary')).toBeFocused();await page.keyboard.press('Escape');await expect(page.locator('#region-toggle>summary')).toBeFocused();
  await page.locator('#query-submit').press('Enter');await expect(page.locator('#query-result-state')).toHaveText('완료');await expect(page.locator('#query-submit')).toBeEnabled();await expect(page.locator('#query-submit')).toBeFocused();
  await page.locator('#species-toggle-label').press('Enter');const mixed=page.locator('[data-species-choice="주꾸미+갑오징어"]');await mixed.press('Space');await expect(mixed).toBeFocused();await expect(page.locator('#summary')).toContainText('2개 출조');await mixed.press('Escape');await expect(page.locator('#species-toggle-label')).toBeFocused();await expect(page.locator('#fixture-requests')).toHaveText('요청 2');
  const date=await page.locator('#month').inputValue()+'-06';await page.locator(`[data-date="${date}"]`).press('Enter');await expect(page.locator('#day-heading')).toContainText('1척 · 2개');if(testInfo.project.use.viewport!.width<=900) await expect(page.locator('#day-heading')).toBeFocused();
  await expect(page.locator('.event-card')).toHaveCount(2);for(const card of await page.locator('.event-card').all()) {await expect(card).toContainText('쭈꾸미');await expect(card).toContainText('갑오징어');await expect(card).toContainText('120,000원');await expect(card.locator('a')).toHaveAttribute('rel','noopener noreferrer');await expect(card.locator('a')).toHaveAttribute('aria-label',/아주긴선박명.*새 탭/);}
  expect(await overflow()).toBe(true);await page.screenshot({path:testInfo.outputPath('after-day.png'),fullPage:true});
  await page.locator('#fleet-section>summary').press('Enter');await page.locator('.boat-more>summary').first().press('Enter');expect(await overflow()).toBe(true);await page.keyboard.press('Escape');await expect(page.locator('.boat-more>summary').first()).toBeFocused();
  await page.locator('[data-tier=none]').click();await page.locator('#query-submit').click();await expect(page.locator('#query-result-state')).toHaveText('조회 대상 없음');await page.locator('#recovery-fleet').press('Enter');await expect(page.locator('#fleet-search')).toBeFocused();
  await testInfo.attach('measurement',{body:JSON.stringify({width:testInfo.project.use.viewport!.width,horizontalOverflow:!await overflow(),humanTaskTime:'not measured',fiveSecondStudy:'not conducted',screenReaderAudio:'not measured'}),contentType:'application/json'});
});

test('success, empty, partial, failure, cancellation and offline do not erase user tiers',async({page,context},testInfo)=>{
  const run=async(mode:string)=>{await page.locator('#fixture-scenario').selectOption(mode);await page.locator('#query-submit').click();await expect(page.locator('#query-submit')).toBeEnabled();};
  for(const [mode,label] of [['success','완료'],['empty','완료'],['partial','일부 완료'],['failure','실패']]) {await run(mode);await expect(page.locator('#query-result-state')).toHaveText(label);await expect(page.locator('#app-announcement')).not.toBeEmpty();}
  await page.locator('#fixture-scenario').selectOption('slow');await page.locator('#query-submit').click();await expect(page.locator('#stop-query')).toBeVisible();await page.locator('#stop-query').press('Enter');await expect(page.locator('#query-result-state')).toHaveText('취소');await expect(page.locator('#query-submit')).toBeFocused();
  await context.setOffline(true);await page.locator('#query-submit').click();await expect(page.locator('#query-result-note')).toContainText('오프라인');await context.setOffline(false);
  await page.locator('#fleet-section>summary').click();await expect(page.locator('#tier-saved-counts')).toContainText('1티어 1 / 2티어 1 / 3티어 1 / 기타 1');await page.screenshot({path:testInfo.outputPath('recovery.png'),fullPage:true});
});
