import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'your-supabase-url';
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'your-supabase-anon-key';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Add the functionsUrl and supabaseKey to the exported object
supabase.functionsUrl = `${supabaseUrl}/functions/v1`;
supabase.supabaseKey = supabaseKey;