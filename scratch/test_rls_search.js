import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://olfqhktlxhunxqwxhzwn.supabase.co';
const supabaseAnonKey = 'sb_publishable_2GKvKG0ttg8ptEAvoPWKxQ_euzkvmzi';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const emailA = `test.user.a.${Math.floor(Math.random() * 100000)}@gmail.com`;
  const emailB = `test.user.b.${Math.floor(Math.random() * 100000)}@gmail.com`;
  const password = 'Password123!';

  try {
    console.log("1. Signing up User A:", emailA);
    const { data: authA, error: errA } = await supabase.auth.signUp({ email: emailA, password });
    if (errA) throw errA;
    const userA = authA.user;
    console.log("User A signed up. ID:", userA.id);

    console.log("2. Creating profile for User A (Alice)...");
    const { data: profileA, error: pErrA } = await supabase
      .from('profiles')
      .insert({ user_id: userA.id, name: 'Alice', avatar: 'avatar1', is_kids: false })
      .select()
      .single();
    if (pErrA) throw pErrA;
    console.log("Profile A created:", profileA);

    console.log("\n3. Signing up User B:", emailB);
    const { data: authB, error: errB } = await supabase.auth.signUp({ email: emailB, password });
    if (errB) throw errB;
    const userB = authB.user;
    console.log("User B signed up. ID:", userB.id);

    console.log("4. Creating profile for User B (Bob)...");
    const { data: profileB, error: pErrB } = await supabase
      .from('profiles')
      .insert({ user_id: userB.id, name: 'Bob', avatar: 'avatar2', is_kids: false })
      .select()
      .single();
    if (pErrB) throw pErrB;
    console.log("Profile B created:", profileB);

    console.log("\n5. Searching for 'Alice' as User B...");
    
    // Log in as User B to set the active session context for RLS
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: emailB, password });
    if (signInErr) throw signInErr;
    console.log("Logged in as User B.");

    const { data: matchingProfiles, error: sErr } = await supabase
      .from('profiles')
      .select('id, user_id, name, avatar, created_at')
      .ilike('name', `%Alice%`);

    if (sErr) throw sErr;
    console.log("Search matches found:", matchingProfiles);

    // Clean up if possible
    console.log("\nCleaning up (deleting test profiles)...");
    await supabase.from('profiles').delete().eq('user_id', userA.id);
    await supabase.from('profiles').delete().eq('user_id', userB.id);
    console.log("Done.");

  } catch (e) {
    console.error("Test failed:", e);
  }
}

run();
