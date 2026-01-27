import webPush from 'web-push';

// Generate new VAPID keys
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const keys = webPush.generateVAPIDKeys();
  return {
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
  };
}

// Check if VAPID keys are configured
export function getVapidStatus(): {
  configured: boolean;
  publicKey: string | null;
  hasPrivateKey: boolean;
} {
  const publicKey = process.env.VAPID_PUBLIC_KEY || null;
  const privateKey = process.env.VAPID_PRIVATE_KEY || null;
  
  return {
    configured: !!(publicKey && privateKey),
    publicKey,
    hasPrivateKey: !!privateKey,
  };
}

// Get the frontend VAPID public key
export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || null;
}
