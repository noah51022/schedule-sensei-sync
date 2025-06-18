-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view availability for events they participate in" ON public.availability;

-- Create a new, simplified policy
CREATE POLICY "Users can view availability for events they can access" 
ON public.availability 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.events 
        WHERE id = availability.event_id 
        AND creator_id = auth.uid()
    )
    OR user_id = auth.uid()
); 