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

    const {
      data: { user },
      error: verificationError,
    } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''))

    if (verificationError || !user) {
      throw new Error('Invalid token')
    }

    const formData = await req.formData()
    const filesData = formData.getAll('files')

    if (filesData.length === 0) {
      throw new Error('No files provided')
    }

    // Type guard function to check if value is a File
    const isFile = (value: FormDataEntryValue): value is File => {
      return value instanceof File
    }

    // Filter and validate files
    const files = filesData.filter(isFile)

    if (files.length === 0) {
      throw new Error('No valid files provided')
    }

    // Validate files are PDFs and within size limit
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        throw new Error(`Invalid file type for ${file.name}. Only PDFs are allowed.`)
      }
      if (file.size > MAX_FILE_SIZE) {
        const sizeMB = Math.round(file.size / (1024 * 1024))
        throw new Error(`File ${file.name} is too large (${sizeMB}MB). Maximum size is 10MB.`)
      }
    }

    // Create new chat
    const { data: chat, error: chatError } = await supabaseClient
      .from('chats')
      .insert([
        {
          user_id: user.id,
          title: files.length === 1 ? files[0].name : 'Multiple PDFs Chat',
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single()

    if (chatError) {
      throw chatError
    }

    // Upload files and create document records
    const results = await Promise.all(
      files.map(async (file) => {
        const filePath = `pdfs/${chat.id}/${file.name}`
        
        // Upload file to storage
        const { error: uploadError } = await supabaseClient
          .storage
          .from('pdfs')
          .upload(filePath, file, {
            contentType: 'application/pdf',
            cacheControl: '3600',
            upsert: false // Prevent overwriting existing files
          })

        if (uploadError) {
          throw uploadError
        }

        // Create document record
        const { data: document, error: docError } = await supabaseClient
          .from('documents')
          .insert([
            {
              chat_id: chat.id,
              name: file.name,
              file_path: filePath,
              upload_date: new Date().toISOString(),
              processing_status: 'pending',
              size_bytes: file.size // Store file size for future reference
            }
          ])
          .select()
          .single()

        if (docError) {
          throw docError
        }

        return {
          filename: file.name,
          documentId: document.id,
          size: file.size
        }
      })
    )

    return new Response(
      JSON.stringify({
        chatId: chat.id,
        documents: results
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