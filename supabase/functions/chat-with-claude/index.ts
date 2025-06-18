import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');

interface TimeSlot {
  start_hour: number;
  end_hour: number;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { message, date } = await req.json();

    // Here you would integrate with Claude to parse the message
    // For now, we'll use a simple parser that looks for numbers
    const timeRegex = /(\d{1,2})(?::00)?\s*(am|pm)?/gi;
    const matches = [...message.matchAll(timeRegex)];

    const slots: TimeSlot[] = [];

    for (let i = 0; i < matches.length - 1; i += 2) {
      const startMatch = matches[i];
      const endMatch = matches[i + 1];

      if (startMatch && endMatch) {
        let startHour = parseInt(startMatch[1]);
        let endHour = parseInt(endMatch[1]);

        // Convert to 24-hour format
        if (startMatch[2]?.toLowerCase() === 'pm' && startHour !== 12) startHour += 12;
        if (startMatch[2]?.toLowerCase() === 'am' && startHour === 12) startHour = 0;
        if (endMatch[2]?.toLowerCase() === 'pm' && endHour !== 12) endHour += 12;
        if (endMatch[2]?.toLowerCase() === 'am' && endHour === 12) endHour = 0;

        // Validate hours
        if (startHour >= 0 && startHour < 24 && endHour > 0 && endHour <= 24 && startHour < endHour) {
          slots.push({ start_hour: startHour, end_hour: endHour });
        }
      }
    }

    return new Response(
      JSON.stringify(slots),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  }
});