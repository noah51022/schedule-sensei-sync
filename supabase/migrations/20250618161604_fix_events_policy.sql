-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view events they created or are participating in" ON public.events;

-- Create a simplified policy that just allows creators to view their events
-- Other users will get access through the availability policy we fixed earlier
CREATE POLICY "Users can view events they created" 
ON public.events 
FOR SELECT 
USING (creator_id = auth.uid()); 