import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
console.log('API Key exists:', !!anthropicApiKey);
console.log('API Key length:', anthropicApiKey?.length || 0);
console.log('API Key prefix:', anthropicApiKey?.substring(0, 10) || 'null');
if (!anthropicApiKey) {
  console.error('ANTHROPIC_API_KEY environment variable is not set');
  throw new Error('ANTHROPIC_API_KEY environment variable is required');
}

interface TimeSlot {
  start_hour: number;
  end_hour: number;
}

interface ClaudeResponse {
  action?: 'add' | 'remove'; // 'add' is the default
  start_date?: string; // YYYY-MM-DD
  end_date?: string; // YYYY-MM-DD
  slots: TimeSlot[];
}

interface DailyAvailability {
  date: string; // YYYY-MM-DD
  slots: TimeSlot[];
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Request-Headers': '*'
};

const getSystemPrompt = (contextDate: string) => `You are a helpful scheduling assistant. Your task is to:
1. Parse natural language descriptions of availability, including requests to ADD or REMOVE time.
2. Determine if the user wants to 'add' or 'remove' availability. Default to 'add' if unclear.
3. The user is currently viewing the date: ${contextDate}. Use this for context if the user's message is ambiguous about dates (e.g., "tomorrow"). Today's actual date is not as relevant as the date they are viewing.
4. Return a JSON object with:
   - "action": "add" or "remove".
   - "start_date": The start date of availability in "YYYY-MM-DD" format.
   - "end_date": The end date of availability in "YYYY-MM-DD" format (optional, only if a range is specified).
   - "slots": An array of time slots, each with "start_hour" and "end_hour" in 24-hour format.
5. If no specific time slots can be determined, return an object with an empty "slots" array, like { "action": "add", "slots": [] }.
6. If no date is mentioned, use the context date as the "start_date".
7. When a day of the week is mentioned (e.g., "next Monday"), calculate the date based on the context date.

Examples of user messages and your expected JSON output:
- User message: "I'm free from 9 AM to 5 PM" (Context date: "2024-08-15")
  Your output: { "action": "add", "start_date": "2024-08-15", "slots": [{ "start_hour": 9, "end_hour": 17 }] }
- User message: "Available 2-4 PM and 6-8 PM tomorrow" (Context date: "2024-08-15")
  Your output: { "action": "add", "start_date": "2024-08-16", "slots": [{ "start_hour": 14, "end_hour": 16 }, { "start_hour": 18, "end_hour": 20 }] }
- User message: "I'm no longer available from 2pm to 3pm on Aug 19" (Context date: "2024-08-15")
  Your output: { "action": "remove", "start_date": "2024-08-19", "slots": [{ "start_hour": 14, "end_hour": 15 }] }
- User message: "remove my availability on august 20th from 9am to 12pm" (Context date: "2024-08-15")
  Your output: { "action": "remove", "start_date": "2024-08-20", "slots": [{ "start_hour": 9, "end_hour": 12 }] }
- User message: "Actually, I am not free next Monday" (Context date: "2024-08-12")
  Your output: { "action": "remove", "start_date": "2024-08-19", "slots": [{ "start_hour": 0, "end_hour": 24 }] }
- User message: "I can do next monday from 10am to 12pm" (Context date: "2024-08-12")
  Your output: { "action": "add", "start_date": "2024-08-19", "slots": [{ "start_hour": 10, "end_hour": 12 }] }
- User message: "I'm busy"
  Your output: { "action": "add", "slots": [] }

IMPORTANT: Your response must be ONLY a valid JSON object. Do not include any explanatory text, markdown formatting, or other content. Just the pure JSON object.
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('Starting function execution');

    let requestBody;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const { message, date } = requestBody;
    console.log('Received message:', message);
    console.log('Received date:', date);

    if (!message) {
      console.error('Message is missing from request');
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const contextDate = date ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const systemPrompt = getSystemPrompt(contextDate);

    console.log('Making request to Claude API with message:', message);
    console.log('Authorization header starts with:', `Bearer ${anthropicApiKey}`.substring(0, 20));

    let response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': anthropicApiKey,
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20240620',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: message
          }],
          system: systemPrompt
        })
      });
    } catch (fetchError) {
      console.error('Failed to fetch from Claude API:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to connect to Claude API' }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    console.log('Claude API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', {
        status: response.status,
        statusText: response.statusText,
        errorText
      });
      return new Response(
        JSON.stringify({
          error: 'Failed to process availability update',
          details: `Claude API error: ${response.status} ${response.statusText}`
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    let claudeResponse;
    try {
      claudeResponse = await response.json();
    } catch (parseError) {
      console.error('Failed to parse Claude API response:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid response from Claude API' }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    console.log('Claude API response:', claudeResponse);

    if (!claudeResponse.content || !claudeResponse.content[0] || !claudeResponse.content[0].text) {
      return new Response(JSON.stringify({ error: 'Invalid response format from Claude' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let cleanedText = claudeResponse.content[0].text.trim();
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    console.log('Cleaned Claude response text:', cleanedText);

    let parsedResponse: ClaudeResponse;
    try {
      parsedResponse = JSON.parse(cleanedText);
    } catch (parseError) {
      const jsonMatch = cleanedText.match(/{[\s\S]*}/);
      if (jsonMatch) {
        try {
          parsedResponse = JSON.parse(jsonMatch[0]);
        } catch (e) {
          return new Response(JSON.stringify({ error: 'Invalid JSON response from Claude' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } else {
        return new Response(JSON.stringify({ error: 'Could not parse JSON from Claude response' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (!parsedResponse || !parsedResponse.slots) {
      return new Response(JSON.stringify({ error: 'Invalid data structure from Claude' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const validSlots = parsedResponse.slots.filter(
      (slot) =>
        typeof slot === 'object' &&
        typeof slot.start_hour === 'number' &&
        typeof slot.end_hour === 'number' &&
        slot.start_hour >= 0 &&
        slot.start_hour < 24 &&
        slot.end_hour > 0 &&
        slot.end_hour <= 24 &&
        slot.start_hour < slot.end_hour
    );

    if (validSlots.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const startDateStr = parsedResponse.start_date || contextDate;
    const startDate = new Date(`${startDateStr}T00:00:00Z`);

    // Use end_date if provided, otherwise use start_date
    const endDateStr = parsedResponse.end_date || startDateStr;
    const endDate = new Date(`${endDateStr}T00:00:00Z`);

    const resultWithAction = {
      action: parsedResponse.action || 'add',
      slots: validSlots,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0]
    };

    const dates: DailyAvailability[] = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      dates.push({
        date: currentDate.toISOString().split('T')[0],
        slots: validSlots
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const finalResponse = {
      action: parsedResponse.action || 'add',
      dates: dates
    };

    return new Response(JSON.stringify(finalResponse), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Unhandled error:', error);
    return new Response(JSON.stringify({ error: `An unexpected error occurred: ${error.message}` }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
});