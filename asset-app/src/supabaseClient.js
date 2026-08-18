import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "ไม่พบค่า VITE_SUPABASE_URL หรือ VITE_SUPABASE_ANON_KEY — ตรวจสอบไฟล์ .env หรือ Environment Variables บน Vercel"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
