-- Create a table for public profiles
create table if not exists public.profiles (
  user_id uuid references auth.users(id) on delete cascade primary key,
  display_name text,
  updated_at timestamp with time zone
);

-- Set up Row Level Security (RLS)
-- See https://supabase.com/docs/guides/auth/row-level-security
alter table public.profiles enable row level security;

-- Drop existing policies before creating new ones to avoid errors
drop policy if exists "Public profiles are viewable by everyone." on public.profiles;
create policy "Public profiles are viewable by everyone."
  on public.profiles for select
  using ( true );

drop policy if exists "Users can insert their own profile." on public.profiles;
create policy "Users can insert their own profile."
  on public.profiles for insert
  with check ( auth.uid() = user_id );

drop policy if exists "Users can update their own profile." on public.profiles;
create policy "Users can update their own profile."
  on public.profiles for update
  using ( auth.uid() = user_id );

-- This trigger automatically creates a profile for new users
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id, display_name, updated_at)
  values (new.id, new.raw_user_meta_data->>'display_name', now());
  return new;
end;
$$ language plpgsql security definer;

-- Drop trigger if it exists before creating it
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user(); 