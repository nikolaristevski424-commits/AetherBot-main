(async () => {
  const grid=document.getElementById('listingGrid'), search=document.getElementById('listingSearch'), category=document.getElementById('listingCategory'), count=document.getElementById('resultCount');
  const ah=window.AdvertiseHERE;
  if(!grid) return;
  const data=await ah.getJson('/api/listings');
  let listings=Array.isArray(data.listings)?data.listings:[];
  if(data.httpStatus!==200) grid.innerHTML=ah.emptyState('Directory connection pending','The new Discord bot backend is not connected yet. Your community listings will appear here once it is running.','<a class="btn btn-primary" href="/dashboard/">Manage your server ↗</a>');
  const params=new URLSearchParams(location.search);
  if(params.has('category'))category.value=params.get('category');
  function draw(){
    if(data.httpStatus!==200)return;
    const q=search.value.trim().toLowerCase(), c=category.value;
    const shown=listings.filter(l=>(!c||l.category===c)&&(!q||`${l.title} ${l.description}`.toLowerCase().includes(q)));
    grid.innerHTML=shown.length?shown.map(ah.listingCard).join(''):ah.emptyState('No communities found','Try a different search or category, or become one of the first communities to list.','<a class="btn btn-primary" href="/dashboard/">List your community ↗</a>');
    count.textContent=`${shown.length} ${shown.length===1?'community':'communities'}`;
  }
  search.addEventListener('input',draw);category.addEventListener('change',draw);draw();
})();
