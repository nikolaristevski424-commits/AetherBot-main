(async () => {
  const notice = document.querySelector('#loginNotice');
  const signIn = document.querySelector('#discordSignIn');
  const query = new URLSearchParams(location.search);
  const destinations = new Map([
    ['/dashboard/', 'Open dashboard'],
    ['/profile/', 'Open your profile'],
    ['/community/', 'Open community presets'],
    ['/reviews/', 'Open reviews'],
    ['/cad/', 'Open CAD'],
    ['/staff/', 'Open staff desk'],
    ['/owner/', 'Open owner panel'],
    ['/team/panel/', 'Open team panel'],
    ['/api/auth/cad/', 'Continue to CAD'],
  ]);
  const requested = query.get('next');
  const next = destinations.has(requested) ? requested : '/dashboard/';
  const configurationError = 'Discord sign-in is temporarily unavailable. Check Aether status or try again later.';
  const errors = {
    'not-configured': configurationError,
    state: 'This sign-in attempt expired or could not be verified. Start again in this tab with cookies enabled.',
    denied: 'Discord sign-in was cancelled. Choose Continue with Discord to try again.',
    credentials: configurationError,
    code: 'The Discord sign-in link expired. Choose Continue with Discord to start again.',
    network: 'Aether could not reach Discord. Try again in a moment.',
    discord: 'Discord could not verify your account. Try signing in again.',
  };

  function showNotice(message) {
    notice.textContent = message;
    notice.hidden = false;
  }

  signIn.href = '/api/auth/login?' + new URLSearchParams({ next });
  const error = query.get('error');
  if (error) {
    showNotice(Object.hasOwn(errors, error) ? errors[error] : 'Sign-in could not be completed. Try again.');
    document.querySelector('#authTroubleshoot')?.setAttribute('open', '');
  }

  try {
    const [configResponse, accountResponse] = await Promise.all([
      fetch('/api/config', { cache: 'no-store' }),
      fetch('/api/auth/me', { cache: 'no-store' }),
    ]);
    if (!configResponse.ok || !accountResponse.ok) throw new Error('Login status unavailable');
    const [config, account] = await Promise.all([configResponse.json(), accountResponse.json()]);
    if (account.authenticated) {
      signIn.href = next;
      signIn.textContent = destinations.get(next);
      showNotice('You’re already signed in.');
    } else if (!config.oauthConfigured) {
      showNotice(configurationError);
      signIn.href = '/status/';
      signIn.textContent = 'Check Aether status';
    }
  } catch {
    if (!error) showNotice('Aether could not check sign-in availability. You can still try signing in with Discord.');
  }
})();
