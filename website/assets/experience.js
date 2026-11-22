/* Aether experience: intentional motion and accessible product previews. */
(() => {
  'use strict';
  const modes = {
    discord: {
      title:'Everything happens in your server.',
      description:'Officers use slash commands, receive roleplay incident cards, and respond without leaving Discord. Web CAD remains available when needed.',
      action:'Explore commands ↗',
      href:'/commands/'
    },
    web: {
      title:'A proper dispatch workspace.',
      description:'Use the authenticated CAD for map snapshots, call queues, BOLOs, officer units and detailed fictional records, with Discord permissions checked on every request.',
      action:'Open Web CAD ↗',
      href:'https://aether.wispbyte.app/cad/'
    },
    hybrid: {
      title:'One connected shift.',
      description:'Dispatchers work on the web while field officers respond through Discord. Incidents, units and records stay connected.',
      action:'Open full CAD ↗',
      href:'https://aether.wispbyte.app/cad/'
    }
  };
  const controls=[...document.querySelectorAll('[data-cad-sample]')];
  const preview=document.querySelector('#cadExamples');
  const title=document.querySelector('#cadChoiceTitle');
  const desc=document.querySelector('#cadChoiceDesc');
  const action=document.querySelector('#cadChoiceAction');
  const activate=mode=>{
    if(!modes[mode]||!preview||!title||!desc||!action)return;
    controls.forEach(button=>{
      const active=button.dataset.cadSample===mode;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',String(active));
      button.tabIndex=active?0:-1;
    });
    preview.className='cad-samples mode-'+mode;
    title.textContent=modes[mode].title;
    desc.textContent=modes[mode].description;
    action.textContent=modes[mode].action;
    action.href=modes[mode].href;
  };
  controls.forEach((button,index)=>{
    button.addEventListener('click',()=>activate(button.dataset.cadSample));
    button.addEventListener('keydown',e=>{
      if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;
      e.preventDefault();
      const next=e.key==='Home'?0:e.key==='End'?controls.length-1:
        (index+(e.key==='ArrowRight'?1:-1)+controls.length)%controls.length;
      controls[next].focus();
      activate(controls[next].dataset.cadSample);
    });
  });
  // Motion stays one-shot and nonessential; layout remains readable when JS is off.
  document.querySelectorAll('.feature-card,.guide-step,.guide-choice,.cad-choice-wrap').forEach((element,index)=>{
    element.style.setProperty('--aether-enter-delay',Math.min(index%4*70,280)+'ms');
  });
  activate('hybrid');
})();
