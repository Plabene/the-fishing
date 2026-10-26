import {el} from './dayView';
import {emptyState,TIERS,type AppState,LABELS} from './models';
import {preferenceBackups,type PreferenceSnapshot} from './preferenceProtection';
import {suppliedPreferences,recoveryPreview,recoverPreferences,RECOVERY_LABEL} from './preferenceRecovery';
import {exportTierBackup} from './tierBackup';
import {saveJsonFile} from './fileSave';

export function installPreferenceRecovery(target:HTMLElement,current:()=>AppState,commit:(state:AppState,message:string)=>Promise<boolean>,say:(message:string)=>void) {
  const panel=el('section','','tier-backup'),title=el('strong','티어 복구 · 자동 보호 이력'),select=el('select'),label=el('label','복구 자료'),status=el('p'),actions=el('div','','actions');
  panel.id='tier-recovery';select.id='recovery-source';status.id='recovery-preview';label.append(select);
  let values:PreferenceSnapshot[]=[suppliedPreferences];
  const option=el('option',`${RECOVERY_LABEL} 마지막 백업 · ${TIERS.reduce((n,t)=>n+suppliedPreferences.tiers[t].length,0)}개 티어 / ${suppliedPreferences.selectedUids.length}개 선택`);option.value='0';select.append(option);
  const refresh=()=>{const source=values[Number(select.value)] || suppliedPreferences,p=recoveryPreview(current(),source);status.textContent=`현재 ${TIERS.map(t=>`${LABELS[t]} ${current().tiers[t].length}`).join(' · ')} / 백업 티어 ${p.total}개 · 누락 ${p.missing}개 · 다른 분류 ${p.conflicts}개${p.cleared?' · 백업 기준 분류 해제 '+p.cleared+'개':''}${p.unresolved?' · 선박 정보 없는 '+p.unresolved+'개':''}. 복구 전 설정은 자동 보관합니다.`;};
  for(const [id,caption,mode] of [['recover-missing','누락 티어만 복구','missing'],['recover-exact','백업 분류·선택 적용','exact']] as const) {
    const button=el('button',caption);button.id=id;button.type='button';button.addEventListener('click',async()=>{
      try {const result=recoverPreferences(current(),values[Number(select.value)] || suppliedPreferences,mode);await commit(result.state,`백업 기준 티어 ${result.count}개 ${mode==='missing'?'보완':'적용'} · 다른 선박·조회 자료 보존${result.unresolved?' · 정보 없는 '+result.unresolved+'개 미복원':''}`);refresh();}
      catch {say('복구 자료를 적용하지 못했습니다. 기존 설정을 유지합니다.');}
    });actions.append(button);
  }
  const history=el('button','기기 자동 백업 찾기');history.type='button';history.id='recovery-history';history.addEventListener('click',async()=>{
    try {const backups=await preferenceBackups();values=[suppliedPreferences,...backups.map(b=>b.value)];select.replaceChildren(option);
      backups.forEach((backup,index)=>{const count=TIERS.reduce((n,t)=>n+backup.value.tiers[t].length,0),o=el('option',`${backup.key.startsWith('preferences-before:')?'배포 전 보호본':'설정 변경 이력'} · ${backup.value.savedAt?new Date(backup.value.savedAt).toLocaleString('ko-KR'):'과거 기록'} · 티어 ${count}개`);o.value=String(index+1);select.append(o);});refresh();say(`이 기기의 보호 이력 ${backups.length}개를 확인했습니다. 자료를 선택해 복구 내용을 확인하세요.`);
    } catch {say('자동 백업을 읽지 못했습니다. 현재 설정은 변경하지 않았습니다.');}
  });actions.append(history);
  const download=el('button','선택한 복구 파일 저장');download.type='button';download.id='recovery-export';download.addEventListener('click',async()=>{
    try {const source=values[Number(select.value)] || suppliedPreferences,base={...emptyState(),boats:current().boats},result=recoverPreferences(base,source,'exact');await saveJsonFile(exportTierBackup(result.state,new Date(),source.scopeUids),'thefishing-recovered-tiers');say(`복구 파일 저장을 요청했습니다.${result.unresolved?' 미확인 선박 '+result.unresolved+'개는 포함하지 못했습니다.':''}`);}catch{say('복구 파일을 저장하지 못했습니다. 기존 백업 파일은 유지됩니다.');}
  });actions.append(download);select.addEventListener('change',refresh);
  panel.append(title,label,status,actions,el('p','누락 복구는 현재 지정된 티어를 유지합니다. 백업 분류 적용은 백업에 담긴 선박만 변경합니다. 다른 기기의 기록은 그 기기에서 확인하거나 JSON 파일로 옮겨야 합니다.','muted'));target.append(panel);refresh();return refresh;
}
