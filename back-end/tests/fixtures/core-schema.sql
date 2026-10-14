-- Supabase Database Schema (Single Source of Truth)
-- Last Updated: 2026-06-25T20:10:00+05:00

-- Create user_profiles table linked to Supabase Auth users
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    first_name TEXT,
    last_name TEXT,
    title TEXT,
    summary TEXT,
    contact JSONB DEFAULT '{}'::jsonb,
    education JSONB DEFAULT '[]'::jsonb,
    experience JSONB DEFAULT '[]'::jsonb,
    projects JSONB DEFAULT '[]'::jsonb,
    skills JSONB DEFAULT '[]'::jsonb,
    certifications JSONB DEFAULT '[]'::jsonb,
    languages_spoken JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row-Level Security (RLS)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to avoid duplication
DROP POLICY IF EXISTS "Allow authenticated users to read their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow authenticated users to upsert their own profile" ON public.user_profiles;

-- Create RLS Policies
-- Allow authenticated users to read their own profile details
CREATE POLICY "Allow authenticated users to read their own profile" 
ON public.user_profiles 
FOR SELECT 
TO authenticated 
USING (auth.uid() = id);

-- Allow authenticated users to insert/update their own profile details
CREATE POLICY "Allow authenticated users to upsert their own profile" 
ON public.user_profiles 
FOR ALL 
TO authenticated 
USING (auth.uid() = id) 
WITH CHECK (auth.uid() = id);

-- Create automatic timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Bind the trigger function to user_profiles updates
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create table for multiple saved CVs/projects
CREATE TABLE IF NOT EXISTS public.saved_cvs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    theme_id TEXT NOT NULL DEFAULT 'latex',
    options JSONB NOT NULL DEFAULT '{}'::jsonb,
    cv_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    snapshot_data TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row-Level Security
ALTER TABLE public.saved_cvs ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
DROP POLICY IF EXISTS "Allow authenticated users to read their own saved CVs" ON public.saved_cvs;
CREATE POLICY "Allow authenticated users to read their own saved CVs"
ON public.saved_cvs FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow authenticated users to insert their own CVs" ON public.saved_cvs;
CREATE POLICY "Allow authenticated users to insert their own CVs"
ON public.saved_cvs FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow authenticated users to update their own CVs" ON public.saved_cvs;
CREATE POLICY "Allow authenticated users to update their own CVs"
ON public.saved_cvs FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow authenticated users to delete their own CVs" ON public.saved_cvs;
CREATE POLICY "Allow authenticated users to delete their own CVs"
ON public.saved_cvs FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Enable updated_at trigger
DROP TRIGGER IF EXISTS update_saved_cvs_updated_at ON public.saved_cvs;
CREATE TRIGGER update_saved_cvs_updated_at
    BEFORE UPDATE ON public.saved_cvs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

