document.addEventListener('DOMContentLoaded', () => {
  // Get token from URL
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  document.getElementById('token').value = token;

  const form = document.getElementById('resetPasswordForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const resetToken = document.getElementById('token').value;

    if (password !== confirmPassword) {
      alert('As senhas não coincidem!');
      return;
    }

    try {
      const response = await fetch('/api/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token: resetToken, password })
      });

      if (response.ok) {
        alert('Senha redefinida com sucesso!');
        window.location.href = '/login.html';
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao redefinir senha');
      }
    } catch (error) {
      alert(error.message);
    }
  });
});