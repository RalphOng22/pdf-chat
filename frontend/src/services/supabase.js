import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
export const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

// Service methods for API operations
export const supabaseService = {
  // Auth methods
  async signIn(email, password) {
    return await supabase.auth.signInWithPassword({ email, password });
  },

  async signUp(email, password, userData = {}) {
    return await supabase.auth.signUp({
      email,
      password,
      options: {
        data: userData
      }
    });
  },

  async signOut() {
    return await supabase.auth.signOut();
  },

  // Document methods
  async uploadDocuments(files, chatId, session) {
    const formData = new FormData();
    formData.append('chatId', chatId);
    files.forEach(file => formData.append('files', file));

    try {
      const response = await fetch(
        `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/upload-handler`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      return response.json();
    } catch (error) {
      console.error('Upload error:', error);
      throw new Error(`Upload failed: ${error.message}`);
    }
  },

  async processDocuments(chatId, documentIds, session) {
    try {
      const response = await fetch(
        `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/document-processor`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chatId,
            documentIds: documentIds.map(Number)
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Processing failed');
      }

      return response.json();
    } catch (error) {
      console.error('Processing error:', error);
      throw new Error(`Processing failed: ${error.message}`);
    }
  },



  // Chat methods
  async sendChatQuery(chatId, query, documentIds, session) {
    const response = await fetch(
      `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/chat-query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          chatId,
          query,
          documentIds
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Query failed');
    }

    return response.json();
  },

  async generateChatTitle(chatId, firstMessage, session) {
    const response = await fetch(
      `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/chat-title-generator`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          chatId,
          firstMessage,
        }),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to generate chat title');
    }

    return response.json();
  },

  // Database methods
  async createChat(data) {
    return await supabase
      .from('chats')
      .insert({
        ...data,
        created_at: 'now()'
      })
      .select('*')
      .single();
  },

  async getChatDocuments(chatId) {
    return await supabase
      .from('documents')
      .select('*')
      .eq('chat_id', chatId);
  },

  async getChat(chatId) {
    return await supabase
      .from('chats')
      .select('*')
      .eq('id', chatId)
      .single();
  },

  async deleteChat(chatId) {
    // Delete related records first
    await supabase.from('queries').delete().eq('chat_id', chatId);
    await supabase.from('documents').delete().eq('chat_id', chatId);
    return await supabase.from('chats').delete().eq('id', chatId);
  },

  // Storage methods
  async getPDFUrl(filePath) {
    return await supabase.storage
      .from('pdfs')
      .createSignedUrl(filePath, 3600); // 1 hour expiry
  },

  // Realtime subscriptions
  subscribeToDocumentUpdates(chatId, callback) {
    return supabase
      .channel(`documents-${chatId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'documents',
          filter: `chat_id=eq.${chatId}`,
        },
        callback
      )
      .subscribe();
  },

  subscribeToChatUpdates(chatId, callback) {
    return supabase
      .channel(`chat-${chatId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chats',
          filter: `id=eq.${chatId}`,
        },
        callback
      )
      .subscribe();
  }
};