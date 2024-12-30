import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'

interface Document {
  id: number;
  file_path: string;
}

interface ProcessRequest {
  chat_id: string;
  documents: Document[];
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      throw new Error('Method not allowed')
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

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

    const { data: { user }, error: verificationError } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''))
    if (verificationError || !user) {
      throw new Error('Invalid token')
    }

    const { chatId, documentIds } = await req.json()
    
    console.log('Processing request:', { chatId, documentIds })

    if (!chatId || typeof chatId !== 'string') {
      throw new Error('Invalid chatId format')
    }

    if (!Array.isArray(documentIds) || !documentIds.every(id => typeof id === 'number')) {
      throw new Error('Invalid documentIds format')
    }

    // Check if documents are already being processed
    const { data: existingDocs, error: checkError } = await supabaseClient
      .from('documents')
      .select('id, processing_status')
      .in('id', documentIds)
      .eq('chat_id', chatId)

    if (checkError) {
      throw new Error('Failed to check document status')
    }

    // Filter out documents that are already being processed
    const docsToProcess = existingDocs?.filter(doc => 
      doc.processing_status !== 'processing' && 
      doc.processing_status !== 'completed'
    ) ?? []

    if (docsToProcess.length === 0) {
      return new Response(
        JSON.stringify({
          message: 'All documents are already processed or being processed',
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
    }

    const documentsToProcess = docsToProcess.map(doc => doc.id)

    // Get documents info
    const { data: documents, error: docsError } = await supabaseClient
      .from('documents')
      .select('id, file_path')
      .eq('chat_id', chatId)
      .in('id', documentsToProcess)

    if (docsError || !documents) {
      throw new Error('Failed to fetch document information')
    }

    // Update status to processing
    const { error: updateError } = await supabaseClient
      .from('documents')
      .update({ processing_status: 'processing' })
      .in('id', documentsToProcess)

    if (updateError) {
      throw new Error('Failed to update document status')
    }

    // Call FastAPI backend with authentication
    const response = await fetch(
      `${Deno.env.get('BACKEND_URL')}/api/v1/documents/process`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader  // Forward the auth token
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
      // If backend fails, revert processing status
      await supabaseClient
        .from('documents')
        .update({ processing_status: 'pending' })
        .in('id', documentsToProcess)

      const errorText = await response.text()
      console.error('Backend error:', errorText)
      throw new Error(`Backend request failed: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const result = await response.json()

    return new Response(
      JSON.stringify({
        message: 'Document processing started',
        chatId,
        documentIds: documentsToProcess,
        result
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        status: 200,
      }
    )

  } catch (error: any) {
    console.error('Processing error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
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