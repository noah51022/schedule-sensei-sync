import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "std/http/server.ts";

const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
if (!anthropicApiKey) {
  throw new Error('ANTHROPIC_API_KEY environment variable is required');
}

interface TimeSlot {
  start_hour: number;
  end_hour: number;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are a helpful scheduling assistant. Your task is to:
1. Parse natural language descriptions of availability into specific time slots
2. Return these as an array of time slots in 24-hour format
3. Only include slots that are clearly specified in the message

For example:
"I'm free from 9 AM to 5 PM" → [{ start_hour: 9, end_hour: 17 }]
"Available 2-4 PM and 6-8 PM" → [{ start_hour: 14, end_hour: 16 }, { start_hour: 18, end_hour: 20 }]

If no specific time slots can be determined, return an empty array.
If times are ambiguous or unclear, err on the side of not including them.

Your response should be ONLY a JSON array of time slots, nothing else.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { message } = await req.json();

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: message
        }]
      })
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.statusText}`);
    }

    const claudeResponse = await response.json();
    const slots = JSON.parse(claudeResponse.content[0].text);

    // Validate the response format
    if (!Array.isArray(slots)) {
      throw new Error('Invalid response format from Claude');
    }

    // Validate each slot
    const validSlots = slots.filter(slot => {
      return (
        typeof slot === 'object' &&
        typeof slot.start_hour === 'number' &&
        typeof slot.end_hour === 'number' &&
        slot.start_hour >= 0 &&
        slot.start_hour < 24 &&
        slot.end_hour > 0 &&
        slot.end_hour <= 24 &&
        slot.start_hour < slot.end_hour
      );
    });

    return new Response(
      JSON.stringify(validSlots),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  }
});