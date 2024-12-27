import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { GoogleGenerativeAI } from "npm:@google/generative-ai"
import { corsHeaders } from '../shared/cors.ts'

interface TitleRequest {
  chatId: string;
  firstMessage: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      throw new Error('Method not allowed')
    }

    // Get and verify auth header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Verify user token
    const {
      data: { user },
      error: verificationError,
    } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''))

    if (verificationError || !user) {
      throw new Error('Invalid token')
    }

    // Get request body
    const { chatId, firstMessage }: TitleRequest = await req.json()

    if (!chatId || !firstMessage) {
      throw new Error('Missing required parameters')
    }

    // Verify chat belongs to user
    const { data: chat, error: chatError } = await supabaseClient
      .from('chats')
      .select('id')
      .eq('id', chatId)
      .eq('user_id', user.id)
      .single()

    if (chatError || !chat) {
      throw new Error('Chat not found or unauthorized')
    }

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(Deno.env.get("GOOGLE_API_KEY")!)
    const model = genAI.getGenerativeModel({ model: "gemini-pro" })

    // Generate title
    const prompt = `Based on this first message or question from a chat conversation, generate a short, concise, and contextual title (maximum 6 words). First message: "${firstMessage}"`
    const result = await model.generateContent(prompt)
    const title = result.response.text().trim()

    // Update chat title
    const { error: updateError } = await supabaseClient
      .from('chats')
      .update({ title })
      .eq('id', chatId)

    if (updateError) {
      throw new Error('Failed to update chat title')
    }

    return new Response(
      JSON.stringify({ title }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        status: 200,
      }
    )

  } catch (error:any) {
    return new Response(
      JSON.stringify({
        error: error.message
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        status: error.message === 'Invalid token' ? 401 : 400,
      }
    )
  }
})