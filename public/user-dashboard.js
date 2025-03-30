document.addEventListener('DOMContentLoaded', async () => {
  // Check authentication
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login.html';
    return;
  }

  // Load user data
  await loadUserData();

  // Setup event listeners
  document.getElementById('buyInviteBtn').addEventListener('click', initPayment);
  document.getElementById('connectMpBtn').addEventListener('click', connectMercadoPago);
});

async function loadUserData() {
  try {
    const token = localStorage.getItem('token');
    
    // Get user balance
    const balanceRes = await fetch('/api/user/balance', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const balanceData = await balanceRes.json();
    document.getElementById('userBalance').textContent = `R$ ${balanceData.balance.toFixed(2)}`;

    // Get invite stats
    const invitesRes = await fetch('/api/user/invites', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const invitesData = await invitesRes.json();
    document.getElementById('availableInvites').textContent = invitesData.available;
    document.getElementById('soldInvites').textContent = invitesData.sold;

    // Get invite price
    const priceRes = await fetch('/api/invite-price');
    const priceData = await priceRes.json();
    document.getElementById('invitePrice').textContent = `R$ ${priceData.price.toFixed(2)}`;

    // Load transactions
    await loadTransactions();
  } catch (error) {
    console.error('Error loading user data:', error);
    alert('Erro ao carregar dados do usuário');
  }
}

async function initPayment() {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/create-invite-payment', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await res.json();

    // Initialize Mercado Pago checkout
    const mp = new MercadoPago(process.env.MERCADOPAGO_PUBLIC_KEY, {
      locale: 'pt-BR'
    });

    mp.checkout({
      preference: {
        id: data.id
      },
      render: {
        container: '#paymentContainer',
        label: 'Pagar com Pix',
        type: 'wallet'
      }
    });

    document.getElementById('paymentContainer').classList.remove('hidden');
  } catch (error) {
    console.error('Error initiating payment:', error);
    alert('Erro ao iniciar pagamento');
  }
}

async function connectMercadoPago() {
  // Implement Mercado Pago OAuth flow
  alert('Redirecionando para vincular conta Mercado Pago...');
  // This would redirect to Mercado Pago OAuth URL
}

async function loadTransactions() {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/user/transactions', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const transactions = await res.json();

    const table = document.getElementById('transactionsTable');
    table.innerHTML = transactions.map(t => `
      <tr>
        <td class="py-2 px-4 border-b">${new Date(t.created_at).toLocaleString()}</td>
        <td class="py-2 px-4 border-b">R$ ${t.amount.toFixed(2)}</td>
        <td class="py-2 px-4 border-b">${t.status}</td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Error loading transactions:', error);
  }
}

// Handle Mercado Pago callback
if (window.location.search.includes('payment_id')) {
  const params = new URLSearchParams(window.location.search);
  const paymentId = params.get('payment_id');
  
  if (paymentId) {
    alert('Pagamento realizado com sucesso!');
    window.location.href = '/user-dashboard.html';
  }
}