import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { generateVapidKeys, getVapidStatus, getVapidPublicKey } from "../vapid";
import { sendTestPushNotification } from "../notifications";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),

  // Get VAPID configuration status
  getVapidStatus: adminProcedure
    .query(() => {
      return getVapidStatus();
    }),

  // Generate new VAPID keys
  generateVapidKeys: adminProcedure
    .mutation(() => {
      const keys = generateVapidKeys();
      return {
        success: true,
        keys,
        instructions: {
          VAPID_PUBLIC_KEY: keys.publicKey,
          VAPID_PRIVATE_KEY: keys.privateKey,
          VITE_VAPID_PUBLIC_KEY: keys.publicKey,
        },
      };
    }),

  // Get public VAPID key for frontend
  getVapidPublicKey: publicProcedure
    .query(() => {
      return {
        publicKey: getVapidPublicKey(),
      };
    }),

  // Send test push notification
  sendTestPushNotification: adminProcedure
    .input(
      z.object({
        endpoint: z.string().url(),
        p256dh: z.string().min(1),
        auth: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const result = await sendTestPushNotification(
        {
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
        },
        {
          title: 'Queue Call - テスト通知',
          body: 'プッシュ通知が正常に動作しています！',
          tag: 'test-notification',
          data: {
            type: 'test',
            timestamp: Date.now(),
          },
        }
      );
      return result;
    }),
});
