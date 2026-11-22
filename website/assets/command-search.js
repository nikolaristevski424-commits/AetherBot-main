/* Accessible command search and filters. Works without external APIs. */
(() => {
 'use strict';
 const input=document.getElementById('commandSearch');
 const list=document.getElementById('commandList');
 if(!input||!list)return;
 const filters=[...document.querySelectorAll('[data-command-filter]')];
 const commands=[...list.querySelectorAll('.command-item')];
 const count=document.getElementById('commandCount');
 let category='all';
 function update(){
   const query=input.value.trim().toLowerCase();
   let visible=0;
   for(const card of commands){
     const matchesCategory=category==='all'||card.dataset.commandCategory===category;
     const matchesQuery=!query||card.textContent.toLowerCase().includes(query);
     card.hidden=!(matchesCategory&&matchesQuery);
     if(!card.hidden)visible++;
   }
   if(count)count.textContent=visible===0?'No matching commands. Try a different search.':
     `${visible} featured command${visible===1?'':'s'} found`;
   filters.forEach(b=>{const active=b.dataset.commandFilter===category;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
 }
 filters.forEach(button=>button.addEventListener('click',()=>{category=button.dataset.commandFilter;update();}));
 input.addEventListener('input',update);
 update();
})();