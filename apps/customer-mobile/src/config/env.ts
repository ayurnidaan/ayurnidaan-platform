type AppEnvironment = 'development' | 'production';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const appEnvironment = process.env.EXPO_PUBLIC_APP_ENV;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase configuration. Copy .env.example to .env.local and add the development project values.',
  );
}

if (appEnvironment !== 'development' && appEnvironment !== 'production') {
  throw new Error('EXPO_PUBLIC_APP_ENV must be development or production.');
}

export const env = {
  appEnvironment: appEnvironment as AppEnvironment,
  supabaseUrl,
  supabaseAnonKey,
} as const;
