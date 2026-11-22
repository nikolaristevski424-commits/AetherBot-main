(async function(){
  const notice=document.querySelector('#loginNotice');const signin=document.querySelector('#discordSignIn');
  const err=new URLSearchParams(location.search).get('error');
  const errors={
    'not-configured':'Website OAuth configuration is incomplete on Vercel. Check the application ID, OAuth client secret, session secret, and canonical origin.',
    'state':'Your sign-in state cookie was missing, expired or did not match. Start again on aetherbot-hq.vercel.app in the same browser tab, with cookies enabled.',
    'denied':'Discord authorization was cancelled or denied. Choose Continue with Discord to restart.',
    'credentials':'Discord rejected the website OAuth credentials. Check that AETHER_DISCORD_CLIENT_SECRET is the OAuth2 Client Secret (not the bot token) for the same application ID.',
    'code':'Discord rejected the authorization code. Confirm that the registered callback exactly matches https://aetherbot-hq.vercel.app/api/auth/callback, then restart the sign-in.',
    'network':'Aether could not reach or read Discord authorization services. Try again after checking the connection.',
    'discord':'Discord could not verify your account during authorization. Please restart sign-in and check the configured application.'
  };
  if(err){notice.textContent=errors[err]||'Authentication could not be completed.';document.querySelector('#authTroubleshoot')?.setAttribute('open','');}
  try{
    const [config,me]=await Promise.all([fetch('/api/config',{cache:'no-store'}).then(x=>x.json()),fetch('/api/auth/me',{cache:'no-store'}).then(x=>x.json())]);
    if(me.authenticated){notice.textContent='You are already signed in. Open your command center.';signin.href='/dashboard/';signin.textContent='Open dashboard ↗';}
    else if(!config.oauthConfigured){notice.textContent=errors['not-configured'];signin.setAttribute('aria-disabled','true');signin.href='/docs/';signin.textContent='View login setup guide ↗';}
    else if(!err)notice.textContent='Discord sign-in is ready. Your authorized servers will appear after login.';
  }catch{notice.textContent='Could not check login status. Try refreshing the page.';}
})();
