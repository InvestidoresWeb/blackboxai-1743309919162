require('dotenv').config();
const express = require('express');
const MercadoPago = require('mercadopago');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Initialize Mercado Pago
MercadoPago.configure({
  access_token: process.env.MERCADOPAGO_ACCESS_TOKEN,
  integrator_id: process.env.MERCADOPAGO_INTEGRATOR_ID
});

// Middleware to verify JWT
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Authentication routes
app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;
  
  try {
    // Check if user exists
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(400).json({ error: 'E-mail não encontrado' });
    }

    // Generate reset token (in a real app, you would send an email)
    const resetToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: '1h'
    });

    res.json({ 
      message: 'Link de recuperação enviado por e-mail',
      token: resetToken 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reset-password', async (req, res) => {
  const { token, password } = req.body;
  
  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    
    // Update password
    const { error } = await supabase
      .from('users')
      .update({ password_hash: passwordHash })
      .eq('id', decoded.id);

    if (error) throw error;
    
    res.json({ message: 'Senha redefinida com sucesso' });
  } catch (error) {
    res.status(400).json({ error: 'Token inválido ou expirado' });
  }
});

app.post('/api/signup', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    
    // Insert user
    const { data, error } = await supabase
      .from('users')
      .insert([{ email, password_hash: passwordHash }])
      .select();
      
    if (error) throw error;
    
    // Generate JWT
    const token = jwt.sign({ id: data[0].id }, process.env.JWT_SECRET, {
      expiresIn: '1d'
    });
    
    res.json({ token });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Get user
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) throw new Error('Invalid credentials');

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) throw new Error('Invalid credentials');

    // Generate JWT
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: '1d'
    });

    res.json({ token });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Protected routes
app.post('/api/create-invite-payment', authenticate, async (req, res) => {
  try {
    const price = await getSetting('invite_price');
    const sellerId = await getNextSellerInQueue();

    const preference = {
      items: [{
        title: 'Convite',
        unit_price: price,
        quantity: 1
      }],
      back_urls: { success: '/success' },
      auto_return: 'approved',
      payment_methods: {
        excluded_payment_types: [{ id: 'credit_card' }, { id: 'debit_card' }],
        default_payment_method_id: 'pix'
      },
      notification_url: `${process.env.BASE_URL}/api/payment-notification`,
      metadata: {
        user_id: req.user.id,
        seller_id: sellerId
      }
    };

    const response = await MercadoPago.preferences.create(preference);
    res.json(response.body);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Payment notification webhook
app.post('/api/payment-notification', async (req, res) => {
  try {
    const paymentId = req.body.data.id;
    const payment = await MercadoPago.payment.get(paymentId);

    if (payment.body.status === 'approved') {
      await processSuccessfulPayment(payment.body);
    }

    res.status(200).end();
  } catch (error) {
    console.error('Payment notification error:', error);
    res.status(500).end();
  }
});

// Helper functions
async function getSetting(key) {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', key)
    .single();

  if (error) throw error;
  return data.value;
}

async function getNextSellerInQueue() {
  // Get the oldest batch with remaining invites
  const { data: batch, error } = await supabase
    .from('batches')
    .select('*')
    .gt('remaining_invites', 0)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (error || !batch) {
    // If no batches available, create overflow batches
    await createOverflowBatches(10);
    return getNextSellerInQueue();
  }

  return batch.owner_id;
}

async function processSuccessfulPayment(payment) {
  const userId = payment.metadata.user_id;
  const sellerId = payment.metadata.seller_id;
  const amount = payment.transaction_amount;
  const systemSplit = await getSetting('system_split');
  const sellerSplit = await getSetting('seller_split');

  // Create transaction record
  await supabase.from('transactions').insert([{
    user_id: userId,
    amount: amount,
    split_to_seller: sellerSplit,
    split_to_system: systemSplit,
    status: 'completed',
    payment_id: payment.id
  }]);

  // Update seller's balance
  await supabase.rpc('increment_balance', {
    user_id: sellerId,
    amount: sellerSplit
  });

  // Create new batch for buyer (3 invites)
  await supabase.from('batches').insert([{
    owner_id: userId,
    position_in_queue: await getNextQueuePosition(),
    remaining_invites: 3
  }]);

  // Update batch's remaining invites
  await supabase.rpc('decrement_invites', {
    batch_id: payment.metadata.batch_id,
    amount: 1
  });
}

async function createOverflowBatches(count) {
  const systemUserId = await getSystemUserId();
  for (let i = 0; i < count; i++) {
    await supabase.from('batches').insert([{
      owner_id: systemUserId,
      position_in_queue: await getNextQueuePosition(),
      remaining_invites: 1
    }]);
  }
}

async function getSystemUserId() {
  // Get or create system user
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('email', 'system@invites.com')
    .single();

  if (!error && data) return data.id;

  const { data: newUser } = await supabase
    .from('users')
    .insert([{ email: 'system@invites.com', password_hash: '' }])
    .select();

  return newUser[0].id;
}

async function getNextQueuePosition() {
  const { data, error } = await supabase
    .from('batches')
    .select('position_in_queue', { count: 'exact' });

  return (data?.length || 0) + 1;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});