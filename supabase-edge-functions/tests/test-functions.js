// tests/test-functions.js
import { config } from './config.js';

// Utility function for consistent logging
const logger = {
  info: (msg) => console.log(`\n📝 ${msg}`),
  success: (msg) => console.log(`\n✅ ${msg}`),
  error: (msg, error) => {
    console.error(`\n❌ ${msg}`);
    if (error?.response) {
      console.error('Response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        body: error.response.body
      });
    } else if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack
      });
    } else {
      console.error('Unknown error:', error);
    }
  },
  warning: (msg) => console.warn(`\n⚠️ ${msg}`)
};

async function validateResponse(response, expectedStatus = 200) {
  const data = await response.json().catch(e => ({ error: 'Failed to parse JSON response' }));
  
  if (!response.ok || response.status !== expectedStatus) {
    throw {
      response,
      data,
      message: `Expected status ${expectedStatus}, got ${response.status}`
    };
  }

  return data;
}

async function testFunction(name, endpoint, method = 'POST', body = null, expectedStatus = 200) {
  logger.info(`Testing ${name}...`);
  try {
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${config.jwt}`,
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
      logger.info(`Request body: ${JSON.stringify(body, null, 2)}`);
    }

    const startTime = Date.now();
    const response = await fetch(`${config.baseUrl}/${endpoint}`, options);
    const endTime = Date.now();

    const data = await validateResponse(response, expectedStatus);
    
    logger.success(`${name} completed in ${endTime - startTime}ms`);
    logger.info(`Response: ${JSON.stringify(data, null, 2)}`);
    
    return { success: true, data };
  } catch (error) {
    logger.error(`Failed to test ${name}`, error);
    return { success: false, error };
  }
}

async function runTests() {
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    failures: []
  };

  try {
    logger.info('Starting test suite...');

    // Test 1: Create Chat
    results.total++;
    const chatResult = await testFunction('chat-creator', 'chat-creator');
    if (!chatResult.success) {
      results.failed++;
      results.failures.push('chat-creator');
      logger.error('Chat creation failed, stopping tests');
      return;
    }
    results.passed++;
    const chatId = chatResult.data.chatId;

    // Test 2: Embedding Generator with updated format
    results.total++;
    const embedResult = await testFunction('embedding-generator', 'embedding-generator', 'POST', {
      fileName: 'test.pdf',
      filePath: 'test/test.pdf',
      textChunks: [
        {
          text: 'This is a test document chunk with some meaningful content about machine learning.',
          page_number: 1
        },
        {
          text: 'Another test chunk discussing artificial intelligence and its applications.',
          page_number: 1
        },
        {
          text: 'A third chunk about deep learning and neural networks.',
          page_number: 2
        },
        {
          text: 'Fourth chunk covering supervised and unsupervised learning.',
          page_number: 2
        },
        {
          text: 'Fifth chunk about reinforcement learning and its real-world applications.',
          page_number: 3
        }
      ],
      chatId,
      totalPages: 3 // Added total pages count
    });
    embedResult.success ? results.passed++ : (results.failed++, results.failures.push('embedding-generator'));

    // Test 3: Chat Title Generator
    results.total++;
    const titleResult = await testFunction('chat-title-generator', 'chat-title-generator', 'POST', {
      chatId,
      firstMessage: 'What are the main concepts of machine learning mentioned in this document?'
    });
    titleResult.success ? results.passed++ : (results.failed++, results.failures.push('chat-title-generator'));

    // Test 4: Document Query with Pagination
    results.total++;
    const queryResult = await testFunction('document-query', 'document-query', 'POST', {
      chatId,
      query: 'What are the main points about machine learning?',
      selectedDocuments: [],
      pagination: {
        pageSize: 3,
        pageNumber: 1
      }
    });

    // Validate query response structure
    if (queryResult.success) {
      const validResponse = 
        queryResult.data.response &&
        Array.isArray(queryResult.data.sourceReferences) &&
        queryResult.data.pagination &&
        typeof queryResult.data.pagination.totalCount === 'number' &&
        typeof queryResult.data.pagination.pageSize === 'number' &&
        typeof queryResult.data.pagination.pageNumber === 'number' &&
        typeof queryResult.data.pagination.totalPages === 'number';

      if (!validResponse) {
        queryResult.success = false;
        logger.error('Invalid response structure from document-query');
      }
    }
    queryResult.success ? results.passed++ : (results.failed++, results.failures.push('document-query'));

    // Test 5: Document Query Pagination (Page 2)
    results.total++;
    const queryPage2Result = await testFunction('document-query-page-2', 'document-query', 'POST', {
      chatId,
      query: 'What are the main points about machine learning?',
      selectedDocuments: [],
      pagination: {
        pageSize: 3,
        pageNumber: 2
      }
    });
    queryPage2Result.success ? results.passed++ : (results.failed++, results.failures.push('document-query-page-2'));

    // Test 6: Chat History
    results.total++;
    const historyResult = await testFunction('chat-history', `chat-history?chatId=${chatId}`, 'GET');
    historyResult.success ? results.passed++ : (results.failed++, results.failures.push('chat-history'));

  } catch (error) {
    logger.error('Test suite failed unexpectedly', error);
  } finally {
    // Print test summary
    logger.info('\nTest Summary:');
    console.log(`Total Tests: ${results.total}`);
    console.log(`Passed: ${results.passed}`);
    console.log(`Failed: ${results.failed}`);
    if (results.failures.length > 0) {
      logger.warning('Failed Tests:');
      results.failures.forEach(failure => console.log(`- ${failure}`));
    }
  }
}

// Add error handling for unhandled rejections
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled Promise Rejection', error);
  process.exit(1);
});

runTests().catch(error => {
  logger.error('Fatal error in test suite', error);
  process.exit(1);
});