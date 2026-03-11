import { describe, it, expect } from 'vitest';

// Helper function to retry fetch with exponential backoff
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      lastError = error as Error;
      // Wait before retrying (exponential backoff)
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
      }
    }
  }
  
  throw lastError;
}

describe('Twilio Credentials Validation', () => {
  it('should have valid Twilio credentials configured', async () => {
    // Check that environment variables are set
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

    expect(accountSid).toBeDefined();
    expect(authToken).toBeDefined();
    expect(phoneNumber).toBeDefined();

    // Validate format
    expect(accountSid).toMatch(/^AC[a-f0-9]{32}$/i);
    expect(authToken).toHaveLength(32);
    expect(phoneNumber).toMatch(/^\+[1-9]\d{1,14}$/);

    // Validate credentials by calling Twilio API
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    
    const response = await fetchWithRetry(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${credentials}`,
        },
      }
    );

    // Check if credentials are valid
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.sid).toBe(accountSid);
    expect(data.status).toBe('active');
    
    console.log(`✓ Twilio account verified: ${data.friendly_name}`);
    console.log(`✓ Account status: ${data.status}`);
  }, 30000); // 30 second timeout for API call with retries

  it('should have a valid phone number', async () => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !phoneNumber) {
      throw new Error('Twilio credentials not configured');
    }

    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    
    // Check if the phone number exists in the account
    const response = await fetchWithRetry(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${credentials}`,
        },
      }
    );

    expect(response.status).toBe(200);
    
    const data = await response.json();
    
    // Phone number should exist in the account
    expect(data.incoming_phone_numbers).toBeDefined();
    expect(data.incoming_phone_numbers.length).toBeGreaterThan(0);
    
    const phoneInfo = data.incoming_phone_numbers[0];
    expect(phoneInfo.phone_number).toBe(phoneNumber);
    
    console.log(`✓ Phone number verified: ${phoneInfo.friendly_name || phoneNumber}`);
    console.log(`✓ SMS capable: ${phoneInfo.capabilities?.sms ? 'Yes' : 'No'}`);
  }, 30000); // 30 second timeout for API call with retries
});
