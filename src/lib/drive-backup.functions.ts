import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uploadSchema = z.object({
  cadence: z.enum(["daily", "weekly", "monthly", "manual"]),
  fileName: z.string().min(1).max(200),
  content: z.string().min(2),
});

export const uploadBackupToDriveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => uploadSchema.parse(data))
  .handler(async ({ data }) => {
    const { uploadBackupToDrive } = await import("./drive-backup.server");
    return uploadBackupToDrive(data.cadence, data.fileName, data.content);
  });
