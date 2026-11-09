(() => {
  const ah = window.AdvertiseHERE;
  const cards = document.getElementById('homeListings');
  const fmt = ah.formatCount;
  Promise.all([ah.getJson('/api/listings'), ah.getJson('/api/health')]).then(([directory, health]) => {
    if (directory.httpStatus === 200 && Array.isArray(directory.listings) && directory.listings.length) {
      cards.innerHTML = directory.listings.slice(0, 3).map(ah.listingCard).join('');
    } else if (directory.httpStatus !== 200) {
      cards.innerHTML = ah.emptyState('The directory is opening soon.', 'The live Discord listing connection is not configured yet. You can still explore the website and read how listing works.', '<a class="btn btn-outline" href="/status/">View connection status ↗</a>');
    } else {
      cards.innerHTML = ah.emptyState('Your community could be the first.', 'No approved listings are currently available. Submit a server for review to get started.', '<a class="btn btn-primary" href="/dashboard/">Submit a listing ↗</a>');
    }
    const stats = health.bot?.stats;
    if (health.bot?.connected && stats) {
      document.getElementById('statListings').textContent = fmt(stats.approvedListings);
      document.getElementById('statBumps').textContent = fmt(stats.totalBumps);
      document.getElementById('statConnected').textContent = fmt(stats.connectedGuilds);
      document.getElementById('statNote').textContent = 'Live counts from the connected AdvertiseHERE bot.';
    }
  }).catch(() => {
    cards.innerHTML = ah.emptyState('Directory unavailable', 'We could not check the directory right now. Try again in a little while.', '<a class="btn btn-outline" href="/status/">Check status ↗</a>');
  });
})();
