import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'

interface ProcessDocumentsRequest {
  chatId: string;
  documentIds: number[];
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
    const { chatId, documentIds }: ProcessDocumentsRequest = await req.json()

    if (!chatId || !documentIds?.length) {
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

    // Verify documents exist and belong to the chat
    const { data: documents, error: docsError } = await supabaseClient
      .from('documents')
      .select('id, file_path')
      .eq('chat_id', chatId)
      .in('id', documentIds)

    if (docsError || !documents || documents.length !== documentIds.length) {
      throw new Error('One or more documents not found')
    }

    // Update documents status to processing
    await supabaseClient
      .from('documents')
      .update({ processing_status: 'processing' })
      .in('id', documentIds)

    // Call FastAPI backend to start processing
    const response = await fetch(
      `${Deno.env.get('BACKEND_URL')}/api/v1/documents/process`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('BACKEND_API_KEY')}`,
        },
        body: JSON.stringify({
          chat_id: chatId,
          documents: documents.map(doc => ({
            id: doc.id,
            file_path: doc.file_path
          }))
        })
      }
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to start document processing')
    }

    return new Response(
      JSON.stringify({
        message: 'Document processing started',
        chatId,
        documentIds
      }),
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