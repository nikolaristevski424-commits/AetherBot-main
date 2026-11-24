/* Aether quick navigation — Ctrl+K / Cmd+K, no privileged actions. */
(() => {
 'use strict';
 const destinations=[
  {title:'Server dashboard',detail:'Real Discord metrics and setup health',href:'/dashboard/',icon:'▦'},
  {title:'Dispatch CAD',detail:'Incidents, units and assignment queue',href:'https://aether.wispbyte.app/cad/',icon:'◈'},
  {title:'Officer MDT',detail:'Search fictional people and vehicle records',href:'https://aether.wispbyte.app/cad/?view=mdt',icon:'▤'},
  {title:'BOLO board',detail:'Roleplay alerts in the CAD MDT',href:'https://aether.wispbyte.app/cad/?view=mdt',icon:'⚑'},
  {title:'ER:LC companion',detail:'Installable staff companion interface',href:'/companion/',icon:'◉'},
  {title:'Staff moderation',detail:'Case history, actions and role settings',href:'/staff/',icon:'⌘'},
  {title:'Bot commands',detail:'Find Aether slash commands',href:'/commands/',icon:'⌕'},
  {title:'System status',detail:'Service checks and incident reports',href:'/status/',icon:'◎'},
  {title:'Aether blog',detail:'Product updates and changelog',href:'/blog/',icon:'▤'},
  {title:'Incident history',detail:'Published outage and maintenance reports',href:'/status/incidents/',icon:'◉'},
  {title:'Your profile',detail:'Manage your Aether community identity',href:'/profile/',icon:'◉'},
  {title:'Community presets',detail:'Share and download protection settings',href:'/community/',icon:'▤'},
  {title:'Reviews',detail:'Read or leave a community review',href:'/reviews/',icon:'✧'},
  {title:'Documentation',detail:'Configure Discord OAuth and Wispbyte',href:'/docs/',icon:'◷'},
  {title:'FAQ',detail:'Common questions',href:'/faq/',icon:'?'}
 ];
 function init(){
  if(document.querySelector('#aetherQuicknav'))return;
  const trigger=document.createElement('button');trigger.type='button';
  trigger.className='aether-quicknav-trigger';trigger.textContent='⌕  Quick jump  Ctrl/⌘ K';
  trigger.setAttribute('aria-label','Open Aether quick navigation, Control K');
  trigger.title='Quick navigation (Ctrl/Cmd + K)';
  const target=document.querySelector('.nav-actions')||document.querySelector('.comp-head');
  if(target)target.prepend(trigger);else {trigger.classList.add('aether-quicknav-floating');document.body.append(trigger)}
  const dialog=document.createElement('dialog');dialog.id='aetherQuicknav';dialog.className='aether-quicknav';dialog.setAttribute('aria-label','Aether quick navigation');
  const label=document.createElement('label');label.className='aether-quicknav-label';label.textContent='Jump to a workspace';
  const input=document.createElement('input');input.type='search';input.placeholder='Search pages, CAD, moderation…';
  input.setAttribute('aria-label','Search Aether pages');input.autocomplete='off';
  const results=document.createElement('nav');results.className='aether-quicknav-results';results.setAttribute('aria-label','Quick navigation results');
  const footer=document.createElement('div');footer.className='aether-quicknav-footer';footer.textContent='↑ ↓ navigate  ·  Enter open  ·  Esc close';
  dialog.append(label,input,results,footer);document.body.append(dialog);
  function draw(){
   results.replaceChildren();
   const q=input.value.trim().toLowerCase();
   const filtered=destinations.filter(d=>(d.title+' '+d.detail).toLowerCase().includes(q));
   if(!filtered.length){const empty=document.createElement('p');empty.textContent='No matching pages';results.append(empty);return}
   for(const item of filtered){
     const link=document.createElement('a');link.href=item.href;link.className='aether-quicknav-result';
     const mark=document.createElement('span');mark.textContent=item.icon;mark.className='aether-quicknav-icon';
     const block=document.createElement('span');const title=document.createElement('strong');title.textContent=item.title;
     const subtitle=document.createElement('small');subtitle.textContent=item.detail;block.append(title,subtitle);
     link.append(mark,block);results.append(link);
   }
  }
  function open(){input.value='';draw();if(!dialog.open)dialog.showModal();input.focus()}
  trigger.addEventListener('click',open);
  input.addEventListener('input',draw);
  input.addEventListener('keydown',e=>{
   if(e.key==='ArrowDown'){e.preventDefault();results.querySelector('a')?.focus()}
   if(e.key==='Enter'){const first=results.querySelector('a');if(first){e.preventDefault();first.click()}}
  });
  results.addEventListener('keydown',e=>{
   const nodes=[...results.querySelectorAll('a')],index=nodes.indexOf(document.activeElement);
   if(e.key==='ArrowDown'||e.key==='ArrowUp'){
     e.preventDefault();nodes[(index+(e.key==='ArrowDown'?1:-1)+nodes.length)%nodes.length]?.focus();
   }
  });
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
  document.addEventListener('keydown',e=>{
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(dialog.open)dialog.close();else open();}
  });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
