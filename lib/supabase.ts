import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://pkevfbklrgrxllniofhv.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrZXZmYmtscmdyeGxsbmlvZmh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMDU2NTMsImV4cCI6MjA5NzY4MTY1M30.a8mBDuETQSN7yMg_HRyNc87Rzj7F9KFluyUkK3S7mqg";

export const supabase = createClient(supabaseUrl, supabaseKey);