-- Fix overlap detection in delete_availability_slots function
-- The issue is that the current logic doesn't properly handle boundary conditions
-- where slots end exactly at the start of another slot

CREATE OR REPLACE FUNCTION "public"."delete_availability_slots"("p_event_id" "uuid", "p_user_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_slots" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
    current_date date;
    slot record;
begin
    for current_date in select generate_series(p_start_date, p_end_date, '1 day'::interval)::date loop
        for slot in select * from jsonb_to_recordset(p_slots) as x(start_hour int, end_hour int) loop
            delete from public.availability a
            where
                a.event_id = p_event_id and
                a.user_id = p_user_id and
                a.date = current_date and
                -- Check for overlapping intervals.
                -- An existing slot (start_hour, end_hour) overlaps with the new slot (slot.start_hour, slot.end_hour)
                -- if the existing slot starts before the new one ends, and the new one starts before or at the existing one ends.
                -- Fixed: Use <= for proper boundary handling
                a.start_hour < slot.end_hour and
                slot.start_hour <= a.end_hour;
        end loop;
    end loop;
end;
$$;
