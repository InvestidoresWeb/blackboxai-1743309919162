const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function initializeDatabase() {
  console.log('Initializing database...');

  // Create users table
  const { data: usersTable, error: usersError } = await supabase.rpc(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      mercadopago_id VARCHAR(255) UNIQUE,
      balance NUMERIC(10,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  if (usersError) {
    console.error('Error creating users table:', usersError);
    return;
  }

  // Create batches table
  const { data: batchesTable, error: batchesError } = await supabase.rpc(`
    CREATE TABLE IF NOT EXISTS batches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id UUID REFERENCES users(id),
      position_in_queue INT NOT NULL,
      remaining_invites INT NOT NULL DEFAULT 3,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  if (batchesError) {
    console.error('Error creating batches table:', batchesError);
    return;
  }

  // Create transactions table
  const { data: transactionsTable, error: transactionsError } = await supabase.rpc(`
    CREATE TABLE IF NOT EXISTS transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id),
      amount NUMERIC(10,2) NOT NULL,
      split_to_seller NUMERIC(10,2),
      split_to_system NUMERIC(10,2),
      status VARCHAR(50) NOT NULL,
      payment_id VARCHAR(255) UNIQUE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  if (transactionsError) {
    console.error('Error creating transactions table:', transactionsError);
    return;
  }

  // Create settings table
  const { data: settingsTable, error: settingsError } = await supabase.rpc(`
    CREATE TABLE IF NOT EXISTS settings (
      key VARCHAR(50) PRIMARY KEY,
      value NUMERIC(10,2)
    );
  `);

  if (settingsError) {
    console.error('Error creating settings table:', settingsError);
    return;
  }

  // Insert default settings
  const { data: insertSettings, error: insertError } = await supabase
    .from('settings')
    .upsert([
      { key: 'invite_price', value: 65 },
      { key: 'system_split', value: 15 },
      { key: 'seller_split', value: 50 }
    ]);

  if (insertError) {
    console.error('Error inserting default settings:', insertError);
    return;
  }

  console.log('Database initialized successfully!');
}

initializeDatabase().catch(console.error);