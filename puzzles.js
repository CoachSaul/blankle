const SUPABASE_URL = 'https://mjrllbftoruhvwzedkym.supabase.co';
const SUPABASE_KEY = 'sb_publishable_e0QYsjxJv0MmgmdWI-tFNw_kxh6mPID';

async function fetchPuzzle(date, level) {
  const url = `${SUPABASE_URL}/rest/v1/puzzles?date=eq.${date}&level=eq.${level}&select=*&apikey=${SUPABASE_KEY}`;

  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Accept': 'application/json',
    }
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const rows = await res.json();
  if (!rows.length) {
    const err = new Error('No rows found');
    err.code = 'PGRST116';
    throw err;
  }

  return rows[0];
}
