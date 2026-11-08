(async () => {
 const grid=document.getElementById('listingGrid'), search=document.getElementById('listingSearch'), category=document.getElementById('listingCategory'), sort=document.getElementById('listingSort'), count=document.getElementById('resultCount');
 if(!grid)return;
 const ah=window.AdvertiseHERE; const data=await ah.getJson('/api/listings');
 const listings=Array.isArray(data.listings)?data.listings:[];
 if(data.httpStatus!==200){grid.innerHTML=ah.emptyState('The directory is preparing to launch','The Discord bot has not connected to the website yet. No sample communities will be presented as real listings.','<a class="btn btn-primary" href="/status/">View platform status ↗</a>');count.textContent='Directory connection pending';return;}
 const params=new URLSearchParams(location.search), preselected=params.get('category');
 if([...category.options].some(x=>x.value===preselected))category.value=preselected;
 function draw(){
  const q=search.value.trim().toLowerCase(),c=category.value;
  const shown=listings.filter(l=>(!c||l.category===c)&&(!q||`${l.title} ${l.description}`.toLowerCase().includes(q)));
  const cmp=sort.value;
  shown.sort((a,b)=>cmp==='members'?(b.memberCount||0)-(a.memberCount||0):cmp==='bumps'?(b.bumpCount||0)-(a.bumpCount||0):cmp==='name'?a.title.localeCompare(b.title):(b.lastBumpAt||0)-(a.lastBumpAt||0));
  grid.innerHTML=shown.length?shown.map(ah.listingCard).join(''):ah.emptyState('No matching communities','Try changing your search or category, or submit your community to get started.','<a class="btn btn-primary" href="/dashboard/">Submit your server ↗</a>');
  count.textContent=`${shown.length} ${shown.length===1?'community':'communities'} found`;
  document.querySelectorAll('[data-category]').forEach(btn=>{btn.classList.toggle('active',btn.dataset.category===c);btn.setAttribute('aria-pressed',String(btn.dataset.category===c));});
  const qs=new URLSearchParams(location.search);c?qs.set('category',c):qs.delete('category');history.replaceState(null,'',location.pathname+(qs.toString()?'?'+qs:''));
 }
 search.addEventListener('input',draw);category.addEventListener('change',draw);sort.addEventListener('change',draw);
 document.querySelectorAll('[data-category]').forEach(btn=>btn.addEventListener('click',()=>{category.value=btn.dataset.category;draw();}));
 draw();
})();
