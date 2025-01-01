import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'

interface Document {
  id: number
  file_path: string
  processing_status: string
}

interface ProcessRequest {
  chatId: string
  documentIds: number[]
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Validate request method
    if (req.method !== 'POST') {
      throw new Error('Method not allowed')
    }

    // Validate authentication
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
    const { data: { user }, error: verificationError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (verificationError || !user) {
      throw new Error('Invalid token')
    }

    // Parse request body
    const { chatId, documentIds }: ProcessRequest = await req.json()
    
    console.log('Processing request:', { chatId, documentIds })

    // Validate request parameters
    if (!chatId || typeof chatId !== 'string') {
      throw new Error('Invalid chatId format')
    }

    if (!Array.isArray(documentIds) || !documentIds.every(id => typeof id === 'number')) {
      throw new Error('Invalid documentIds format')
    }

    // Verify chat ownership
    const { data: chat, error: chatError } = await supabaseClient
      .from('chats')
      .select('id')
      .eq('id', chatId)
      .eq('user_id', user.id)
      .single()

    if (chatError || !chat) {
      throw new Error('Chat not found or unauthorized')
    }

    // Get documents info and check their current status
    const { data: documents, error: docsError } = await supabaseClient
      .from('documents')
      .select('id, file_path, processing_status')
      .eq('chat_id', chatId)
      .in('id', documentIds)

    if (docsError) {
      throw new Error('Failed to fetch document information')
    }

    if (!documents || documents.length === 0) {
      throw new Error('No valid documents found')
    }

    // Filter documents based on their status
    const documentsToProcess = documents.filter(doc => 
      doc.processing_status !== 'processing' && 
      doc.processing_status !== 'completed'
    )

    if (documentsToProcess.length === 0) {
      return new Response(
        JSON.stringify({
          message: 'All documents are already processed or being processed',
          skipped: documents.map(doc => ({
            id: doc.id,
            status: doc.processing_status
          }))
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

    // Update status to processing for selected documents
    const { error: updateError } = await supabaseClient
      .from('documents')
      .update({ processing_status: 'processing' })
      .in('id', documentsToProcess.map(doc => doc.id))

    if (updateError) {
      throw new Error('Failed to update document status')
    }

    // Call FastAPI backend with authentication
    try {
      const response = await fetch(
        `${Deno.env.get('BACKEND_URL')}/api/v1/documents/process`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader
          },
          body: JSON.stringify({
            chat_id: chatId,
            documents: documentsToProcess.map(doc => ({
              id: doc.id,
              file_path: doc.file_path
            }))
          })
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Backend error:', errorText)
        
        // Revert processing status on failure
        await supabaseClient
          .from('documents')
          .update({ 
            processing_status: 'failed',
            error_message: `Backend processing failed: ${errorText}`
          })
          .in('id', documentsToProcess.map(doc => doc.id))
          
        throw new Error(`Backend request failed: ${response.status} ${response.statusText} - ${errorText}`)
      }

      const result = await response.json()

      return new Response(
        JSON.stringify({
          message: 'Document processing started',
          processed: documentsToProcess.map(doc => ({
            id: doc.id,
            status: 'processing'
          })),
          skipped: documents
            .filter(doc => !documentsToProcess.find(p => p.id === doc.id))
            .map(doc => ({
              id: doc.id,
              status: doc.processing_status
            })),
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

    } catch (error:any) {
      // Revert processing status on failure
      await supabaseClient
        .from('documents')
        .update({ 
          processing_status: 'failed',
          error_message: `Processing request failed: ${error.message}`
        })
        .in('id', documentsToProcess.map(doc => doc.id))
        
      throw error
    }

  } catch (error: any) {
    console.error('Processing error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.stack
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