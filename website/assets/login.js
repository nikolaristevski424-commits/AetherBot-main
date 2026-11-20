(async function(){
  const notice=document.querySelector('#loginNotice');const signin=document.querySelector('#discordSignIn');
  const err=new URLSearchParams(location.search).get('error');
  const errors={ 'not-configured':'Discord login is not configured on this Vercel project yet. See the deployment guide.','state':'The login request expired or could not be validated. Please start again.','discord':'Discord could not complete authorization. Try again shortly.' };
  if(err)notice.textContent=errors[err]||'Authentication could not be completed.';
  try{
    const [config,me]=await Promise.all([fetch('/api/config',{cache:'no-store'}).then(x=>x.json()),fetch('/api/auth/me',{cache:'no-store'}).then(x=>x.json())]);
    if(me.authenticated){notice.textContent='You are already signed in. Open your command center.';signin.href='/dashboard/';signin.textContent='Open dashboard ↗';}
    else if(!config.oauthConfigured){notice.textContent=errors['not-configured'];signin.setAttribute('aria-disabled','true');signin.href='/docs/';signin.textContent='View login setup guide ↗';}
    else if(!err)notice.textContent='Discord sign-in is ready. Your authorized servers will appear after login.';
  }catch{notice.textContent='Could not check login status. Try refreshing the page.';}
})();
