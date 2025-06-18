-- Create events table
CREATE TABLE public.events (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

-- Create availability table
CREATE TABLE public.availability (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    start_hour INTEGER NOT NULL CHECK (start_hour >= 0 AND start_hour < 24),
    end_hour INTEGER NOT NULL CHECK (end_hour > 0 AND end_hour <= 24),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT valid_hour_range CHECK (end_hour > start_hour),
    UNIQUE(event_id, user_id, date, start_hour, end_hour)
);

-- Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;

-- Create policies for events
CREATE POLICY "Users can view events they created or are participating in" 
ON public.events 
FOR SELECT 
USING (
    creator_id = auth.uid() OR 
    EXISTS (
        SELECT 1 FROM public.availability 
        WHERE event_id = events.id AND user_id = auth.uid()
    )
);

CREATE POLICY "Users can create events" 
ON public.events 
FOR INSERT 
WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Users can update their own events" 
ON public.events 
FOR UPDATE 
USING (creator_id = auth.uid());

CREATE POLICY "Users can delete their own events" 
ON public.events 
FOR DELETE 
USING (creator_id = auth.uid());

-- Create policies for availability
CREATE POLICY "Users can view availability for events they participate in" 
ON public.availability 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.events 
        WHERE id = availability.event_id 
        AND (creator_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.availability a2 
            WHERE a2.event_id = events.id AND a2.user_id = auth.uid()
        ))
    )
);

CREATE POLICY "Users can manage their own availability" 
ON public.availability 
FOR ALL 
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Add trigger for updated_at
CREATE TRIGGER update_events_updated_at
    BEFORE UPDATE ON public.events
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_availability_updated_at
    BEFORE UPDATE ON public.availability
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column(); 