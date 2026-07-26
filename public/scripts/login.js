const tabs = document.querySelectorAll('.auth-tab');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const errorEl = document.getElementById('auth-error');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    errorEl.hidden = true;
    if (tab.dataset.mode === 'login') {
      loginForm.hidden = false;
      signupForm.hidden = true;
    } else {
      loginForm.hidden = true;
      signupForm.hidden = false;
    }
  });
});

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

async function submitAuth(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    showError(data.error || 'Something went wrong');
    return;
  }
  window.location.href = 'main.html';
}

loginForm.addEventListener('submit', event => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  submitAuth('/api/auth/login', {
    email: formData.get('email'),
    password: formData.get('password'),
  });
});

signupForm.addEventListener('submit', event => {
  event.preventDefault();
  const formData = new FormData(signupForm);
  submitAuth('/api/auth/signup', {
    email: formData.get('email'),
    password: formData.get('password'),
    displayName: formData.get('displayName'),
  });
});

getCurrentUser().then(user => {
  if (user) window.location.href = 'main.html';
});
