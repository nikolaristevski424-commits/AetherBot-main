/* Aether theme preference: no cookies, server state or secrets involved. */
(() => {
  'use strict';
  const key='aether_theme_v1';
  let saved=null;
  try { saved=localStorage.getItem(key); } catch {}
  const prefersDark=window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const theme=saved==='dark'||saved==='light'?saved:(prefersDark?'dark':'light');
  function apply(value,persist=false){
    document.documentElement.dataset.theme=value;
    document.documentElement.style.colorScheme=value;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',value==='dark'?'#131020':'#f4f0fa');
    const button=document.getElementById('themeToggle');
    if(button){button.textContent=value==='dark'?'☀ Light mode':'☾ Dark mode';button.setAttribute('aria-label',value==='dark'?'Switch to light mode':'Switch to dark mode');button.setAttribute('aria-pressed',String(value==='dark'));}
    if(persist)try{localStorage.setItem(key,value)}catch{}
  }
  apply(theme);
  const ready=()=>{
    if(document.getElementById('themeToggle'))return;
    const btn=document.createElement('button');
    btn.type='button';btn.id='themeToggle';btn.className='aether-theme-toggle';
    btn.addEventListener('click',()=>apply(document.documentElement.dataset.theme==='dark'?'light':'dark',true));
    const nav=document.querySelector('.nav-actions')||document.querySelector('.comp-top')||document.querySelector('.comp-head');
    if(nav)nav.prepend(btn);
    else if(document.querySelector('.control-nav'))document.querySelector('.control-nav').append(btn);
    else{btn.classList.add('aether-theme-floating');document.body.append(btn);}
    apply(document.documentElement.dataset.theme);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change',event=>{
    let setting=null;try{setting=localStorage.getItem(key)}catch{}
    if(setting!=='dark'&&setting!=='light')apply(event.matches?'dark':'light');
  });
})();
