export interface CancellationToken {
  isCancelled: boolean;
  reason?: string;
}

export interface ExecuteOptions {
  timeoutMs: number;
  retries?: number;
  taskName: string;
  repoId?: string;
}

export interface ExecutionResult<T> {
  result?: T;
  error?: any;
  durationMs: number;
  status: "success" | "timeout" | "error" | "cancelled";
}

/**
 * Robust async executor with timeout, retries, and cancellation token support.
 * Also provides standard structured logging for [Pipeline-Trace].
 */
export async function executeWithTimeout<T>(
  options: ExecuteOptions,
  operation: (token: CancellationToken) => Promise<T>
): Promise<ExecutionResult<T>> {
  const { timeoutMs, retries = 0, taskName, repoId = "unknown" } = options;
  const token: CancellationToken = { isCancelled: false };
  let attempt = 0;

  while (attempt <= retries) {
    attempt++;
    const tStart = performance.now();
    const logPrefix = `[Pipeline-Trace] [${repoId}] [${taskName}] [Attempt ${attempt}/${retries + 1}]`;
    
    console.log(`${logPrefix} START - Timeout: ${timeoutMs}ms`);

    try {
      const operationPromise = operation(token);
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`TimeoutError: Task ${taskName} exceeded ${timeoutMs}ms`));
        }, timeoutMs);
      });

      const result = await Promise.race([operationPromise, timeoutPromise]);
      const durationMs = Math.round(performance.now() - tStart);

      if (token.isCancelled) {
        console.warn(`${logPrefix} CANCELLED after ${durationMs}ms. Reason: ${token.reason || "Unknown"}`);
        return { durationMs, status: "cancelled", error: new Error(`Cancelled: ${token.reason}`) };
      }

      console.log(`${logPrefix} END SUCCESS - Elapsed: ${durationMs}ms`);
      return { result, durationMs, status: "success" };
    } catch (error: any) {
      const durationMs = Math.round(performance.now() - tStart);
      const isTimeout = error.message?.startsWith("TimeoutError");
      
      if (token.isCancelled) {
        console.warn(`${logPrefix} CANCELLED after ${durationMs}ms. Reason: ${token.reason || "Unknown"}`);
        return { durationMs, status: "cancelled", error: new Error(`Cancelled: ${token.reason}`) };
      }

      console.error(`${logPrefix} END ${isTimeout ? 'TIMEOUT' : 'ERROR'} - Elapsed: ${durationMs}ms`, error);

      if (attempt > retries) {
        return { durationMs, status: isTimeout ? "timeout" : "error", error };
      }
      
      // Wait a bit before retrying (exponential backoff could be added here)
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }

  // Should never reach here due to the return in the loop
  return { durationMs: 0, status: "error", error: new Error("Unexpected end of executeWithTimeout") };
}
