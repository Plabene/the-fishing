// @vitest-environment jsdom
import {afterEach,expect,test} from 'vitest';
import {appLayout} from '../src/appLayout';
import {finishFilterPanels,installFilterPanels} from '../src/filterPanels';

afterEach(()=>document.body.replaceChildren());
function mount() {const root=document.createElement('div');root.innerHTML=appLayout(0);document.body.append(root);return root;}

test('one route has labelled scope, results and management; counts and source state precede the calendar',()=>{
  const root=mount(),get=(selector:string)=>root.querySelector<HTMLElement>(selector)!;
  const before=(a:string,b:string)=>!!(get(a).compareDocumentPosition(get(b))&Node.DOCUMENT_POSITION_FOLLOWING);
  expect(root.querySelectorAll('h1')).toHaveLength(1);
  const ids=[...root.querySelectorAll('[id]')].map(e=>e.id);expect(new Set(ids).size).toBe(ids.length);
  for(const [section,heading] of [['query-scope','query-scope-heading'],['booking-results','booking-heading'],['management-section','management-heading']]) {
    expect(get('#'+section).getAttribute('aria-labelledby')).toBe(heading);expect(get('#'+heading).tagName).toBe('H2');
  }
  for(const selector of ['#region-toggle','#tabs','#platform-filter','#query-form','#query-target']) expect(get(selector).closest('#query-scope')).not.toBeNull();
  for(const selector of ['#source-badge','#summary','#species-toggle','#calendar-layout','#day-view','#month-results','#query-status']) expect(get(selector).closest('#booking-results')).not.toBeNull();
  expect(before('#platform-filter','#query-submit')).toBe(true);expect(before('#query-target','#booking-heading')).toBe(true);
  expect(before('#summary','#calendar-layout')).toBe(true);expect(before('#source-badge','#calendar-layout')).toBe(true);
  expect(before('#booking-results','#fleet-section')).toBe(true);expect(before('#fleet-section','#management-section')).toBe(true);
  expect(root.querySelectorAll('#query-form button[type=submit],button[form=query-form][type=submit]')).toHaveLength(1);
  for(const selector of ['#search','#search-section','#search-reset','#selected-boats','#select-all','#select-none']) expect(root.querySelector(selector)).toBeNull();
  expect(get('#tier-scope-help').textContent).toContain('이번 조회 범위만 바꿉니다');
});

test('query-tier help and persistent tier management are distinct, with recovery and source anchors reachable',()=>{
  const root=mount();
  expect(root.querySelector('#tier-scope-label')?.textContent).toBe('조회에 포함할 티어');
  expect(root.querySelector('#tier-scope-help')?.textContent).toContain('저장된 티어는 달력 아래');
  expect(root.querySelector('#tier-hidden-reasons')?.closest('#fleet-section')).not.toBeNull();
  expect(root.querySelector('#tier-show-all')?.closest('#fleet-section')).not.toBeNull();
  expect(root.querySelector('#tier-open-recovery')?.getAttribute('href')).toBe('#tier-recovery');
  expect(root.querySelector('#source-access')?.closest('#management-section')).not.toBeNull();
  expect(root.querySelector('#api-settings')?.closest('#management-section')).not.toBeNull();
});

test.each(['success','empty'] as const)('focus survives native disclosure blur on %s, without changing form values',outcome=>{
  const root=mount(),panel=root.querySelector<HTMLDetailsElement>('#region-toggle')!;
  const input=document.createElement('input');input.value='군산 · 보령';panel.querySelector('.filter-panel-body')!.append(input);
  panel.open=true;input.focus();
  const descriptor=Object.getOwnPropertyDescriptor(HTMLDetailsElement.prototype,'open')!;
  Object.defineProperty(panel,'open',{get(){return descriptor.get!.call(this);},set(value){descriptor.set!.call(this,value);if(!value) input.blur();}});
  finishFilterPanels(root,outcome);
  expect(panel.open).toBe(false);expect(input.value).toBe('군산 · 보령');expect(document.activeElement).toBe(root.querySelector('#query-submit'));
});

test('manual close returns focus to summary; unavailable submit falls back to a visible summary; errors retain controls',()=>{
  const root=mount();installFilterPanels(root);
  const region=root.querySelector<HTMLDetailsElement>('#region-toggle')!,species=root.querySelector<HTMLDetailsElement>('#species-toggle')!;
  region.open=true;root.querySelector<HTMLButtonElement>('[data-close-panel=region-toggle]')!.click();
  expect(document.activeElement).toBe(region.querySelector('summary'));expect(region.open).toBe(false);
  region.open=true;root.querySelector<HTMLButtonElement>('[data-close-panel=region-toggle]')!.focus();root.querySelector<HTMLButtonElement>('#query-submit')!.disabled=true;
  finishFilterPanels(root,'success');expect(document.activeElement).toBe(region.querySelector('summary'));
  species.open=true;finishFilterPanels(root,'error');expect(region.open).toBe(true);expect(species.open).toBe(true);
  finishFilterPanels(root,'cancelled');expect(region.open).toBe(true);expect(species.open).toBe(true);
});
