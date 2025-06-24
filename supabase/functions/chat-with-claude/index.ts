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
  name?: string; // Optional name/label for the time slot
  availability_type?: 'available' | 'unavailable' | 'busy' | 'tentative'; // Type of availability
}

interface DailyAvailability {
  date: string;
  slots: TimeSlot[];
}

interface ClaudeFunctionResponse {
  action: 'add' | 'remove';
  dates: DailyAvailability[];
}

// Function to correct common time format issues
function correctTimeSlot(slot: any, originalMessage: string): TimeSlot | null {
  let { start_hour, end_hour, name, availability_type } = slot;

  // Ensure we have numbers
  if (typeof start_hour !== 'number' || typeof end_hour !== 'number') {
    console.log('Non-numeric time values:', { start_hour, end_hour });
    return null;
  }

  // Handle special full-day cases
  if (start_hour === 0 && end_hour === 24) {
    console.log('Accepted full 24-hour slot:', { start_hour, end_hour, name, availability_type });
    const result: TimeSlot = { start_hour, end_hour };
    if (name && typeof name === 'string' && name.trim()) {
      result.name = name.trim();
    }
    if (availability_type && ['available', 'unavailable', 'busy', 'tentative'].includes(availability_type)) {
      result.availability_type = availability_type;
    }
    return result;
  }

  // Basic validation - be more lenient
  if (start_hour < 0 || start_hour >= 24 || end_hour <= 0 || end_hour > 24) {
    console.log('Invalid time range:', { start_hour, end_hour });
    return null;
  }

  if (start_hour >= end_hour) {
    console.log('Start time is not before end time:', { start_hour, end_hour });
    return null;
  }

  console.log('Accepted time slot:', { start_hour, end_hour, name, availability_type });
  const result: TimeSlot = { start_hour, end_hour };
  if (name && typeof name === 'string' && name.trim()) {
    result.name = name.trim();
  }
  if (availability_type && ['available', 'unavailable', 'busy', 'tentative'].includes(availability_type)) {
    result.availability_type = availability_type;
  }
  return result;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Request-Headers': '*'
};

const SYSTEM_PROMPT = `You are a helpful scheduling assistant. Your task is to:
1. Parse natural language descriptions of availability into specific time slots for specific dates
2. Handle both single-day and multi-day availability requests
3. Extract optional names/labels for time slots when provided
4. Determine the availability type (available, unavailable, busy, tentative) based on context
5. Return the results as a JSON object with date-specific time slots

CRITICAL: Always use 24-hour format for times. Convert AM/PM times correctly:
- 12 AM = 0, 1 AM = 1, ..., 11 AM = 11
- 12 PM = 12, 1 PM = 13, ..., 11 PM = 23

AVAILABILITY TYPE DETECTION:
Analyze the user's message to determine the type of time slot:

AVAILABLE (default - when user is free/available):
- "I'm free Monday 9-5"
- "Available all day Tuesday"
- "I can meet Thursday afternoon"
- "Open for meetings tomorrow morning"
- "Free time: 2-4pm"

UNAVAILABLE (when user is not available/cannot be scheduled):
- "I'm not available June 4-6" → availability_type: "unavailable"
- "I'm unavailable Monday morning" → availability_type: "unavailable"
- "I can't meet Tuesday" → availability_type: "unavailable"
- "I'm out of office Wednesday" → availability_type: "unavailable"
- "Not free Thursday afternoon" → availability_type: "unavailable"

BUSY (when user has specific commitments/meetings):
- "I have a client meeting Tuesday 2-4pm" → availability_type: "busy"
- "Doctor appointment Friday 10-11am" → availability_type: "busy"
- "Busy with conference all day Monday" → availability_type: "busy"
- "Team meeting 9-10am Thursday" → availability_type: "busy"
- "In meetings from 1-5pm" → availability_type: "busy"

TENTATIVE (when user might be available/uncertain):
- "I might be free Thursday afternoon" → availability_type: "tentative"
- "Possibly available Monday morning" → availability_type: "tentative"
- "Maybe free for a call Tuesday" → availability_type: "tentative"
- "Could work Wednesday if needed" → availability_type: "tentative"

SPECIAL CASES for "all day" expressions:
- "all day", "entire day", "whole day", "free all day", "available all day" → [{ "start_hour": 8, "end_hour": 24 }]
- "24/7", "24 hours", "round the clock" → [{ "start_hour": 0, "end_hour": 24 }]

NAMING TIME SLOTS:
When users provide context or purpose for their availability/unavailability, extract this as a "name" field:
- "vacation in Aruba" → name: "vacation in Aruba"
- "doctor appointment" → name: "doctor appointment"  
- "client meeting" → name: "client meeting"
- "away for summer camp" → name: "away for summer camp"
- "working from home" → name: "working from home"
- "family event" → name: "family event"
- "conference call" → name: "conference call"

If no specific purpose/context is mentioned, omit the name field entirely.

For MULTI-DAY requests, analyze the date range and apply the time slots to each applicable date:
- "I'm free all of August" → Apply default all-day hours (8-24) to all August days with availability_type: "available"
- "Available July 10th-15th from 9am-5pm" → Apply 9-17 to July 10,11,12,13,14,15 with availability_type: "available"
- "Vacation in Hawaii July 1st-15th" → Apply all-day with name "vacation in Hawaii" and availability_type: "unavailable"
- "Not available next week" → Apply to all 7 days of next week with availability_type: "unavailable"
- "Busy with project Monday-Friday" → Apply weekdays with availability_type: "busy"

Your response must be a JSON object with this exact structure:
{
  "action": "add" | "remove",
  "dates": [
    {
      "date": "YYYY-MM-DD",
      "slots": [{ "start_hour": number, "end_hour": number, "name"?: string, "availability_type"?: "available" | "unavailable" | "busy" | "tentative" }]
    }
  ]
}

Examples:
- Simple availability: { "action": "add", "dates": [{ "date": "2024-01-15", "slots": [{ "start_hour": 9, "end_hour": 17, "availability_type": "available" }] }] }
- Named availability: { "action": "add", "dates": [{ "date": "2024-01-15", "slots": [{ "start_hour": 14, "end_hour": 16, "name": "client meeting", "availability_type": "available" }] }] }
- Vacation period: { "action": "add", "dates": [{ "date": "2024-01-15", "slots": [{ "start_hour": 8, "end_hour": 24, "name": "vacation in Aruba", "availability_type": "unavailable" }] }] }
- Busy time: { "action": "add", "dates": [{ "date": "2024-01-15", "slots": [{ "start_hour": 10, "end_hour": 11, "name": "doctor appointment", "availability_type": "busy" }] }] }
- Unavailable: { "action": "add", "dates": [{ "date": "2024-01-15", "slots": [{ "start_hour": 9, "end_hour": 17, "availability_type": "unavailable" }] }] }
- Remove availability: { "action": "remove", "dates": [{ "date": "2024-01-15", "slots": [{ "start_hour": 9, "end_hour": 17 }] }] }

IMPORTANT: Your response must be ONLY valid JSON. No explanatory text or markdown formatting.`;

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

    const { message, date, dateRange } = requestBody;
    console.log('Received message:', message);
    console.log('Received date:', date);
    console.log('Received dateRange:', dateRange);

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
    let contextualMessage = message;
    if (dateRange && dateRange.start && dateRange.end) {
      const startDate = new Date(dateRange.start).toLocaleDateString();
      const endDate = new Date(dateRange.end).toLocaleDateString();
      contextualMessage = `Context: Current calendar shows ${startDate} to ${endDate}. Today is ${new Date().toLocaleDateString()}. User message: ${message}`;
    } else if (date) {
      contextualMessage = `For ${new Date(date).toLocaleDateString()}, ${message}`;
    }

    const userMessage = contextualMessage;

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

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Failed to parse Claude response as JSON:', parseError);
      console.error('Claude response text:', cleanedText);

      // Try to extract JSON from the response if it contains explanatory text
      const jsonMatch = cleanedText.match(/\{.*\}/s);
      if (jsonMatch) {
        try {
          parsedResponse = JSON.parse(jsonMatch[0]);
          console.log('Successfully extracted JSON from text:', parsedResponse);
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

    console.log('Parsed Claude response:', parsedResponse);

    // Handle both old format (array of slots) and new format (object with action and dates)
    let functionResponse: ClaudeFunctionResponse;

    if (Array.isArray(parsedResponse)) {
      // Legacy format - convert to new format
      console.log('Converting legacy slot array format');
      const validSlots: TimeSlot[] = [];
      for (const slot of parsedResponse) {
        if (typeof slot === 'object' && slot !== null) {
          const correctedSlot = correctTimeSlot(slot, message);
          if (correctedSlot) {
            validSlots.push(correctedSlot);
          }
        }
      }

      functionResponse = {
        action: 'add',
        dates: validSlots.length > 0 ? [{
          date: date ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          slots: validSlots
        }] : []
      };
    } else if (parsedResponse && typeof parsedResponse === 'object' && parsedResponse.action && parsedResponse.dates) {
      // New format - validate and process
      console.log('Processing new object format');

      if (!['add', 'remove'].includes(parsedResponse.action)) {
        console.error('Invalid action:', parsedResponse.action);
        return new Response(
          JSON.stringify({ error: 'Invalid action in Claude response' }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        );
      }

      if (!Array.isArray(parsedResponse.dates)) {
        console.error('Invalid dates format:', parsedResponse.dates);
        return new Response(
          JSON.stringify({ error: 'Invalid dates format in Claude response' }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        );
      }

      // Validate and correct each date entry
      const validDates: DailyAvailability[] = [];
      for (const dateEntry of parsedResponse.dates) {
        if (dateEntry && typeof dateEntry === 'object' && dateEntry.date && Array.isArray(dateEntry.slots)) {
          const validSlots: TimeSlot[] = [];
          for (const slot of dateEntry.slots) {
            const correctedSlot = correctTimeSlot(slot, message);
            if (correctedSlot) {
              validSlots.push(correctedSlot);
            }
          }

          if (validSlots.length > 0) {
            validDates.push({
              date: dateEntry.date,
              slots: validSlots
            });
          }
        }
      }

      functionResponse = {
        action: parsedResponse.action,
        dates: validDates
      };
    } else {
      console.error('Invalid response format:', parsedResponse);
      return new Response(
        JSON.stringify({ error: 'Invalid response format from Claude' }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    console.log('Final response:', functionResponse);

    return new Response(
      JSON.stringify(functionResponse),
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