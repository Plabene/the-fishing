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
  await expect(page.locator('#skip-results')).toHaveCSS('clip-path','none');
  await page.keyboard.press('Enter');await expect(page.locator('#booking-heading')).toBeFocused();
  await expect(page.locator('#skip-results')).toHaveCSS('clip-path','inset(50%)');
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
  await page.locator('#manage-tier-boats').press('Enter');await expect(page.locator('#fleet-search')).toBeFocused();await page.locator('.boat-more>summary').first().press('Enter');expect(await overflow()).toBe(true);await page.keyboard.press('Escape');await expect(page.locator('.boat-more>summary').first()).toBeFocused();
  await page.locator('[data-tier=none]').click();await page.locator('#query-submit').click();await expect(page.locator('#query-result-state')).toHaveText('조회 대상 없음');await page.locator('#recovery-fleet').press('Enter');await expect(page.locator('#fleet-search')).toBeFocused();
  await testInfo.attach('measurement',{body:JSON.stringify({width:testInfo.project.use.viewport!.width,horizontalOverflow:!await overflow(),humanTaskTime:'not measured',fiveSecondStudy:'not conducted',screenReaderAudio:'not measured'}),contentType:'application/json'});
});

test('scope changes invalidate completion, while result search and species remain local',async({page},testInfo)=>{
  await page.locator('#query-submit').click();await expect(page.locator('#query-result-state')).toHaveText('완료');
  await expect(page.locator('#fixture-requests')).toHaveText('요청 4');
  await page.locator('#result-search>summary').press('Enter');await page.locator('#search').fill('반응형 시험 2호');
  await expect(page.locator('#summary')).toContainText('2개 출조');await expect(page.locator('#search')).toBeFocused();
  await expect(page.locator('#query-result-state')).toHaveText('완료');await expect(page.locator('#query-result-counts')).toContainText('확인 4척');
  await page.locator('#search').fill('존재하지 않는 시험선박');await expect(page.locator('#query-result-note')).toContainText('검색어를 지우면');
  await page.locator('#search-clear').press('Enter');await expect(page.locator('#search')).toBeFocused();await expect(page.locator('#summary')).toContainText('8개 출조');
  await expect(page.locator('#fixture-requests')).toHaveText('요청 4');
  if(testInfo.project.use.hasTouch) await page.locator('[data-tier=tier1]').tap();else await page.locator('[data-tier=tier1]').press('Space');
  await expect(page.locator('#query-result-state')).toHaveText('조건 변경 · 새 조회 필요');await expect(page.locator('#query-result-counts')).toContainText('이전 조건의 조회: 완료');
  await expect(page.locator('#recovery-query')).toBeVisible();await expect(page.locator('#fixture-requests')).toHaveText('요청 4');
  await page.locator('#recovery-query').press('Enter');await expect(page.locator('#query-submit')).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('#query-result-state')).toHaveText('완료');await expect(page.locator('#fixture-requests')).toHaveText('요청 5');
  await page.locator('#people').fill('2');await page.locator('#query-submit').click();await expect(page.locator('#fixture-requests')).toHaveText('요청 6');await expect(page.locator('#query-result-state')).toHaveText('완료');
  await page.locator('#next').press('Enter');await expect(page.locator('#query-result-state')).toHaveText('조건 변경 · 새 조회 필요');await expect(page.locator('#summary')).toContainText('0개 출조');await expect(page.locator('#fixture-requests')).toHaveText('요청 6');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('scope-changed.png'),fullPage:true});
});

test('success, empty, partial, failure, cancellation and offline do not erase user tiers',async({page,context},testInfo)=>{
  const run=async(mode:string)=>{await page.locator('#fixture-scenario').selectOption(mode);await page.locator('#query-submit').click();await expect(page.locator('#query-submit')).toBeEnabled();};
  for(const [mode,label] of [['success','완료'],['empty','완료'],['partial','일부 완료'],['failure','실패']]) {await run(mode);await expect(page.locator('#query-result-state')).toHaveText(label);await expect(page.locator('#app-announcement')).not.toBeEmpty();}
  await page.locator('#fixture-scenario').selectOption('slow');await page.locator('#query-submit').click();await expect(page.locator('#stop-query')).toBeVisible();await page.locator('#stop-query').press('Enter');await expect(page.locator('#query-result-state')).toHaveText('취소');await expect(page.locator('#query-submit')).toBeFocused();
  await context.setOffline(true);await page.locator('#query-submit').click();await expect(page.locator('#query-result-note')).toContainText('오프라인');await context.setOffline(false);
  await page.locator('#fleet-section>summary').click();await expect(page.locator('#tier-saved-counts')).toContainText('1티어 1 / 2티어 1 / 3티어 1 / 기타 1');await page.screenshot({path:testInfo.outputPath('recovery.png'),fullPage:true});
});

test('visible scope, species and day detail text keep readable contrast and size',async({page},testInfo)=>{
  await page.locator('#query-submit').click();await expect(page.locator('#query-result-state')).toHaveText('완료');
  await page.locator('#species-toggle-label').click();
  const date=await page.locator('#month').inputValue()+'-06';await page.locator(`[data-date="${date}"]`).click();
  const samples=await page.evaluate(()=>{
    const rgb=(s:string)=>s.match(/[\d.]+/g)!.map(Number);
    const lum=(v:number[])=>v.slice(0,3).map(c=>c/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
    const visible=(n:Element)=>{for(let p:Element|null=n;p;p=p.parentElement) if((p as HTMLElement).hidden || getComputedStyle(p).display==='none' || getComputedStyle(p).visibility==='hidden' || p instanceof HTMLDetailsElement && !p.open && !p.querySelector('summary')?.contains(n)) return false;return n.getClientRects().length>0;};
    return [...document.querySelectorAll('#query-scope *,#query-feedback *,#species-filter *,#calendar *,#day-view *,#result-search>summary')].filter(n=>visible(n) && [...n.childNodes].some(c=>c.nodeType===3 && c.textContent?.trim()) && !n.closest(':disabled')).map(n=>{
      let bg=[255,255,255];for(let p:Element|null=n;p;p=p.parentElement) {const c=rgb(getComputedStyle(p).backgroundColor);if(c.length===3 || c[3]>=.99) {bg=c;break;}}
      const style=getComputedStyle(n),a=lum(rgb(style.color)),b=lum(bg);
      return {selector:n.id || n.className,text:n.textContent?.slice(0,40),font:Number.parseFloat(style.fontSize),contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
    });
  });
  expect(samples.length).toBeGreaterThan(100);
  expect(samples.filter(s=>s.contrast<4.5),JSON.stringify(samples.filter(s=>s.contrast<4.5))).toEqual([]);
  expect(samples.filter(s=>s.font<10)).toEqual([]);
  await testInfo.attach('computed-text-contrast',{body:JSON.stringify(samples),contentType:'application/json'});
});
