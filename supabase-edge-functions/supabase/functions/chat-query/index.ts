import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'

interface ChatQueryRequest {
  chatId: string;
  query: string;
  documentIds?: number[]; // Optional: to filter specific documents
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
    const { chatId, query, documentIds }: ChatQueryRequest = await req.json()

    if (!chatId || !query) {
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

    // If documentIds provided, verify they belong to this chat
    if (documentIds?.length) {
      const { count, error: docsError } = await supabaseClient
        .from('documents')
        .select('id', { count: 'exact' })
        .eq('chat_id', chatId)
        .in('id', documentIds)

      if (docsError || count !== documentIds.length) {
        throw new Error('One or more documents not found or unauthorized')
      }
    }

    // Forward query to FastAPI backend
    const response = await fetch(
      `${Deno.env.get('BACKEND_URL')}api/v1/query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify({
          chat_id: chatId,
          query,
          document_ids: documentIds
        })
      }
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to process query')
    }

    const result = await response.json()

    return new Response(
      JSON.stringify(result),
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