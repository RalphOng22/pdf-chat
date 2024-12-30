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
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No authorization header')

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: { user }, error: verificationError } = 
      await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''))
    if (verificationError || !user) throw new Error('Invalid token')

    const { chatId, firstMessage }: TitleRequest = await req.json()
    if (!chatId || !firstMessage) throw new Error('Missing required parameters')

    // Verify chat ownership
    const { data: chat, error: chatError } = await supabaseClient
      .from('chats')
      .select('id')
      .eq('id', chatId)
      .eq('user_id', user.id)
      .single()
    if (chatError || !chat) throw new Error('Chat not found or unauthorized')

    // Generate title using Gemini
    const genAI = new GoogleGenerativeAI(Deno.env.get("GOOGLE_API_KEY")!)
    const model = genAI.getGenerativeModel({ model: "gemini-pro" })
    const result = await model.generateContent(
      `Based on this first message or question from a chat conversation, generate a short, concise, and contextual title (maximum 6 words). First message: "${firstMessage}"`
    )
    const title = result.response.text().trim()

    // Update chat
    const { error: updateError } = await supabaseClient
      .from('chats')
      .update({ title })
      .eq('id', chatId)
    if (updateError) throw new Error('Failed to update chat title')

    return new Response(
      JSON.stringify({ title }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: error.message === 'Invalid token' ? 401 : 400,
      }
    )
  }
})