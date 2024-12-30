import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'

// Constants
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB in bytes

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

    const formData = await req.formData()
    const chatId = formData.get('chatId')
    const filesData = formData.getAll('files')

    if (!chatId) {
      throw new Error('Chat ID is required')
    }

    if (filesData.length === 0) {
      throw new Error('No files provided')
    }

    const isFile = (value: FormDataEntryValue): value is File => {
      return value instanceof File
    }

    const files = filesData.filter(isFile)
    if (files.length === 0) {
      throw new Error('No valid files provided')
    }

    // Validate files
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        throw new Error(`Invalid file type for ${file.name}. Only PDFs are allowed.`)
      }
      if (file.size > MAX_FILE_SIZE) {
        const sizeMB = Math.round(file.size / (1024 * 1024))
        throw new Error(`File ${file.name} is too large (${sizeMB}MB). Maximum size is 10MB.`)
      }
    }

    // Verify chat
    const { data: chat, error: chatError } = await supabaseClient
      .from('chats')
      .select('id')
      .eq('id', chatId)
      .eq('user_id', user.id)
      .single()

    if (chatError || !chat) {
      throw new Error('Chat not found or unauthorized')
    }

    // Upload files and create documents
    const uploadedDocuments = await Promise.all(
      files.map(async (file) => {
        const filePath = `pdfs/${chatId}/${file.name}`
        
        // Upload to storage
        const { error: uploadError } = await supabaseClient
          .storage
          .from('pdfs')
          .upload(filePath, file, {
            contentType: 'application/pdf',
            cacheControl: '3600',
            upsert: false
          })

        if (uploadError) throw uploadError

        // Create document record
        const { data: document, error: docError } = await supabaseClient
          .from('documents')
          .insert([{
            chat_id: chatId,
            name: file.name,
            file_path: filePath,
            upload_date: new Date().toISOString(),
            processing_status: 'pending',
          }])
          .select()
          .single()

        if (docError) throw docError

        // Trigger processing
        const processingResponse = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/document-processor`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${authHeader.split(' ')[1]}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              chatId: chatId,
              documentIds: [document.id]
            })
          }
        );

        if (!processingResponse.ok) {
          console.error('Processing trigger failed:', await processingResponse.text());
        }

        return {
          filename: file.name,
          documentId: document.id,
        }
      })
    )

    return new Response(
      JSON.stringify({ documents: uploadedDocuments }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        status: 200,
      }
    )

  } catch (error: any) {
    console.error('Upload error:', error);
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