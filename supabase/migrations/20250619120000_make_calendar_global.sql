-- Drop existing policies that are too restrictive
DROP POLICY IF EXISTS "Users can view events they created" ON public.events;
DROP POLICY IF EXISTS "Users can view availability for events they can access" ON public.availability;

-- Allow any authenticated user to view all events, as it's a global calendar.
CREATE POLICY "Allow all authenticated users to view events"
ON public.events
FOR SELECT
USING (auth.role() = 'authenticated');

-- Allow any authenticated user to create a new event.
CREATE POLICY "Allow all authenticated users to create events"
ON public.events
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- Allow users to update events they created.
CREATE POLICY "Allow users to update their own events"
ON public.events
FOR UPDATE
USING (auth.uid() = creator_id);

-- Allow any authenticated user to view all availability data.
CREATE POLICY "Allow all authenticated users to view availability"
ON public.availability
FOR SELECT
USING (auth.role() = 'authenticated');

-- Allow users to manage their own availability.
CREATE POLICY "Allow users to manage their own availability"
ON public.availability
FOR ALL -- Covers INSERT, UPDATE, DELETE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id); 