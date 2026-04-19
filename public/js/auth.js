// Auth state management for user
class AuthManager {
  constructor() {
    this.init();
  }

  init() {
    this.checkAuthStatus();
    this.setupLogout();
  }

  checkAuthStatus() {
    const token = localStorage.getItem('userToken');
    const loginLink = document.getElementById('loginLink');
    const registerLink = document.getElementById('registerLink');
    const logoutBtn = document.getElementById('logoutBtn');

    if (token) {
      // User is logged in
      const userName = localStorage.getItem('userName') || 'Пользователь';
      
      if (loginLink) loginLink.style.display = 'none';
      if (registerLink) registerLink.style.display = 'none';
      if (logoutBtn) {
        logoutBtn.style.display = 'inline-block';
        logoutBtn.textContent = `${userName} (Выход)`;
      }
    } else {
      // User is not logged in
      if (loginLink) loginLink.style.display = 'inline-block';
      if (registerLink) registerLink.style.display = 'inline-block';
      if (logoutBtn) logoutBtn.style.display = 'none';
    }
  }

  setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('userToken');
        localStorage.removeItem('userName');
        localStorage.removeItem('userEmail');
        window.location.reload();
      });
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new AuthManager();
  });
} else {
  new AuthManager();
}
