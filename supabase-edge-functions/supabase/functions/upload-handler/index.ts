import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'

// Constants
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB in bytes
const MAX_FILES = 5 // Maximum number of files per upload

interface UploadedDocument {
  filename: string
  documentId: number
}

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Method validation
    if (req.method !== 'POST') {
      throw new Error('Method not allowed')
    }

    // Auth validation
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

    // Parse form data
    const formData = await req.formData()
    const chatId = formData.get('chatId')
    const filesData = formData.getAll('files')

    // Validate chat ID
    if (!chatId || typeof chatId !== 'string') {
      throw new Error('Valid Chat ID is required')
    }

    // Validate files
    if (filesData.length === 0) {
      throw new Error('No files provided')
    }

    if (filesData.length > MAX_FILES) {
      throw new Error(`Maximum ${MAX_FILES} files allowed per upload`)
    }

    // Filter valid files
    const files = filesData.filter((value): value is File => value instanceof File)
    if (files.length === 0) {
      throw new Error('No valid files provided')
    }

    // Validate file types and sizes
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        throw new Error(`Invalid file type for ${file.name}. Only PDFs are allowed.`)
      }
      if (file.size > MAX_FILE_SIZE) {
        const sizeMB = Math.round(file.size / (1024 * 1024))
        throw new Error(`File ${file.name} is too large (${sizeMB}MB). Maximum size is 10MB.`)
      }
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

    // Upload files and create document records
    const uploadedDocuments: UploadedDocument[] = []
    
    for (const file of files) {
      const filePath = `pdfs/${chatId}/${file.name}`
      
      try {
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

        uploadedDocuments.push({
          filename: file.name,
          documentId: document.id
        })

      } catch (error) {
        // If document creation fails, clean up the uploaded file
        try {
          await supabaseClient.storage.from('pdfs').remove([filePath])
        } catch (cleanupError) {
          console.error(`Failed to cleanup file after error: ${cleanupError}`)
        }
        throw error
      }
    }

    // Trigger processing for all uploaded documents
    if (uploadedDocuments.length > 0) {
      try {
        const processingResponse = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/document-processor`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${authHeader.split(' ')[1]}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              chatId,
              documentIds: uploadedDocuments.map(doc => doc.documentId)
            })
          }
        )

        if (!processingResponse.ok) {
          console.error('Processing trigger failed:', await processingResponse.text())
          // Mark documents as failed if processing couldn't be initiated
          await supabaseClient
            .from('documents')
            .update({ processing_status: 'failed' })
            .in('id', uploadedDocuments.map(doc => doc.documentId))
        }
      } catch (error) {
        console.error('Failed to trigger document processing:', error)
        // Mark documents as failed if processing couldn't be initiated
        await supabaseClient
          .from('documents')
          .update({ processing_status: 'failed' })
          .in('id', uploadedDocuments.map(doc => doc.documentId))
      }
    }

    return new Response(
      JSON.stringify({
        message: 'Files uploaded successfully',
        documents: uploadedDocuments
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
    console.error('Upload error:', error)
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