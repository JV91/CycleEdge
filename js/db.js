// ── Supabase DB layer ──────────────────────────────────────────────────────────
// Depends on: window.supabase (CDN), loaded before this file

// price_alerts table:
// create table price_alerts (
//   id uuid primary key default gen_random_uuid(),
//   user_id uuid references auth.users not null,
//   label text not null,
//   price_usd numeric not null,
//   direction text not null check (direction in ('above','below')),
//   fired boolean default false,
//   created_at timestamptz default now()
// );
// alter table price_alerts enable row level security;
// create policy "users own their data" on price_alerts for all using (auth.uid() = user_id);

const SUPABASE_URL = 'https://pqdfhawlnrhphyygvbry.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ueItvuUVDdbMPhTRk_9ipQ_gpcM3-v-';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Auth ───────────────────────────────────────────────────────────────────────

async function dbSignUp(email, password) {
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) throw error;
    return data;
}

async function dbSignIn(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

async function dbSignInWithGoogle() {
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin + window.location.pathname
        }
    });
    if (error) throw error;
    return data;
}

async function dbSignOut() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
}

async function dbGetSession() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    return data.session;
}

function dbOnAuthChange(callback) {
    supabaseClient.auth.onAuthStateChange((_event, session) => {
        callback(session);
    });
}

// ── Strategy Settings ──────────────────────────────────────────────────────────

async function dbSaveSettings(name, settingsObj) {
    const session = await dbGetSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabaseClient
        .from('strategy_settings')
        .insert([{ user_id: session.user.id, name, settings: settingsObj }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

async function dbLoadSettings() {
    const session = await dbGetSession();
    if (!session) return [];

    const { data, error } = await supabaseClient
        .from('strategy_settings')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
}

async function dbDeleteSettings(id) {
    const { error } = await supabaseClient
        .from('strategy_settings')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

// ── Portfolio Entries ──────────────────────────────────────────────────────────
// entry = { date, asset, type, amount_currency, price_usd, notes }

async function dbAddEntry(entry) {
    const session = await dbGetSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabaseClient
        .from('portfolio_entries')
        .insert([{ user_id: session.user.id, ...entry }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

async function dbGetEntries() {
    const session = await dbGetSession();
    if (!session) return [];

    const { data, error } = await supabaseClient
        .from('portfolio_entries')
        .select('*')
        .eq('user_id', session.user.id)
        .order('date', { ascending: true });

    if (error) throw error;
    return data || [];
}

async function dbDeleteEntry(id) {
    const { error } = await supabaseClient
        .from('portfolio_entries')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

async function dbUpdateEntry(id, entry) {
    const { error } = await supabaseClient
        .from('portfolio_entries')
        .update(entry)
        .eq('id', id);

    if (error) throw error;
}

async function dbDeleteAllEntries() {
    const session = await dbGetSession();
    if (!session) throw new Error('Not authenticated');
    const { error } = await supabaseClient
        .from('portfolio_entries')
        .delete()
        .eq('user_id', session.user.id);
    if (error) throw error;
}

// ── Price Snapshots ────────────────────────────────────────────────────────────

async function dbRecordSnapshot(actualUSD, predictedUSD) {
    const session = await dbGetSession();
    if (!session) throw new Error('Not authenticated');

    const today = new Date().toISOString().slice(0, 10);

    // Upsert by user_id + date to avoid duplicates
    const { data, error } = await supabaseClient
        .from('price_snapshots')
        .upsert(
            [{ user_id: session.user.id, date: today, actual_usd: actualUSD, predicted_usd: predictedUSD }],
            { onConflict: 'user_id,date' }
        )
        .select()
        .single();

    if (error) throw error;
    return data;
}

async function dbGetSnapshots() {
    const session = await dbGetSession();
    if (!session) return [];

    const { data, error } = await supabaseClient
        .from('price_snapshots')
        .select('*')
        .eq('user_id', session.user.id)
        .order('date', { ascending: true });

    if (error) throw error;
    return data || [];
}

// ── Price Alerts ───────────────────────────────────────────────────────────────

async function dbSaveAlert(label, priceUSD, direction) {
    const session = await dbGetSession();
    if (!session) throw new Error('Not authenticated');
    const { data, error } = await supabaseClient
        .from('price_alerts')
        .insert([{ user_id: session.user.id, label, price_usd: priceUSD, direction, fired: false }])
        .select().single();
    if (error) throw error;
    return data;
}

async function dbGetAlerts() {
    const session = await dbGetSession();
    if (!session) return [];
    const { data, error } = await supabaseClient
        .from('price_alerts')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

async function dbDeleteAlert(id) {
    const { error } = await supabaseClient.from('price_alerts').delete().eq('id', id);
    if (error) throw error;
}

async function dbMarkAlertFired(id) {
    const { error } = await supabaseClient.from('price_alerts').update({ fired: true }).eq('id', id);
    if (error) throw error;
}

async function dbRearmAlert(id) {
    const { error } = await supabaseClient.from('price_alerts').update({ fired: false }).eq('id', id);
    if (error) throw error;
}
