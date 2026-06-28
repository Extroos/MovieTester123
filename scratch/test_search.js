import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://olfqhktlxhunxqwxhzwn.supabase.co';
const supabaseAnonKey = 'sb_publishable_2GKvKG0ttg8ptEAvoPWKxQ_euzkvmzi';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  try {
    console.log("Trying to sign in anonymously...");
    const { data: auth, error: err } = await supabase.auth.signInAnonymously();
    
    if (err) {
      console.warn("Anonymous sign-in not enabled/supported:", err.message);
      return;
    }

    console.log("Signed in anonymously! User ID:", auth.user.id);
    console.log("Querying profiles...");
    const { data: profiles, error: pError } = await supabase
      .from('profiles')
      .select('*');

    if (pError) throw pError;
    console.log("Profiles in database:", profiles);
  } catch (e) {
    console.error("Test failed:", e);
  }
}

run();
