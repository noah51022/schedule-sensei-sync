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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Request-Headers': '*'
};

const SYSTEM_PROMPT = `You are a helpful scheduling assistant. Your task is to:
1. Parse natural language descriptions of availability into specific time slots
2. Return these as an array of time slots in 24-hour format
3. Only include slots that are clearly specified in the message

For example:
"I'm free from 9 AM to 5 PM" → [{ "start_hour": 9, "end_hour": 17 }]
"Available 2-4 PM and 6-8 PM" → [{ "start_hour": 14, "end_hour": 16 }, { "start_hour": 18, "end_hour": 20 }]

If no specific time slots can be determined, return an empty array: []
If times are ambiguous or unclear, err on the side of not including them.

IMPORTANT: Your response must be ONLY a valid JSON array of time slots. Do not include any explanatory text, markdown formatting, or other content. Just the pure JSON array.

Examples of correct responses:
[]
[{ "start_hour": 9, "end_hour": 17 }]
[{ "start_hour": 14, "end_hour": 16 }, { "start_hour": 18, "end_hour": 20 }]`;

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

    // Add date context to the message if provided
    const userMessage = date
      ? `For ${new Date(date).toLocaleDateString()}, ${message}`
      : message;

    console.log('Making request to Claude API with message:', userMessage);
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
            content: userMessage
          }],
          system: SYSTEM_PROMPT
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

    // Handle new Claude 3 response format
    if (!claudeResponse.content || !Array.isArray(claudeResponse.content)) {
      console.error('Unexpected response format:', claudeResponse);
      return new Response(
        JSON.stringify({ error: 'Unexpected response format from Claude' }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const content = claudeResponse.content[0];
    if (!content || content.type !== 'text' || typeof content.text !== 'string') {
      console.error('Invalid content format:', content);
      return new Response(
        JSON.stringify({ error: 'Invalid content format from Claude' }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Clean the response text to ensure it's valid JSON
    let cleanedText = content.text.trim();

    // Remove any markdown code block formatting that might be present
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    console.log('Cleaned Claude response text:', cleanedText);

    let slots;
    try {
      slots = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Failed to parse Claude response as JSON:', parseError);
      console.error('Claude response text:', cleanedText);

      // Try to extract JSON from the response if it contains explanatory text
      const jsonMatch = cleanedText.match(/\[.*\]/s);
      if (jsonMatch) {
        try {
          slots = JSON.parse(jsonMatch[0]);
          console.log('Successfully extracted JSON from text:', slots);
        } catch (extractError) {
          console.error('Failed to extract JSON:', extractError);
          return new Response(
            JSON.stringify({
              error: 'Invalid JSON response from Claude',
              raw_response: cleanedText
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
      } else {
        return new Response(
          JSON.stringify({
            error: 'Invalid JSON response from Claude',
            raw_response: cleanedText
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
    }

    console.log('Parsed time slots:', slots);

    // Validate the response format
    if (!Array.isArray(slots)) {
      console.error('Response is not an array:', slots);
      return new Response(
        JSON.stringify({ error: 'Invalid response format from Claude - not an array' }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
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

    console.log('Valid time slots after filtering:', validSlots);

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
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error.message || 'Unknown error'
      }),
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