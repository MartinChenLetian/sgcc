import { createClient } from '@supabase/supabase-js'

// 这里读取你在 .env 文件里配置的地址和密码
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)