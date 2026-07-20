import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAsyncVerification } from './sync-engine';
import { supabase } from '../lib/db';
import * as syncEngine from './sync-engine';

const { mockEq, mockUpdate, mockFrom } = vi.hoisted(() => {
  const mockEq = vi.fn().mockResolvedValue({});
  const mockUpdate = vi.fn(() => ({ eq: mockEq }));
  const mockFrom = vi.fn(() => ({
    update: mockUpdate,
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: { sha: '123' } })
          }))
        })),
        single: vi.fn().mockResolvedValue({ data: { last_indexed_sha: '123' } })
      }))
    }))
  }));
  return { mockEq, mockUpdate, mockFrom };
});

vi.mock('../lib/db', () => ({
  supabase: {
    from: mockFrom
  }
}));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    execSync: vi.fn(() => Buffer.from('123\n'))
  };
});

describe('runAsyncVerification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('successful sync -> ready (when shouldTransitionToReady is true)', async () => {
    vi.spyOn(syncEngine, 'verifyRepositorySync').mockResolvedValue({ isValid: true, reason: null });

    await runAsyncVerification('repo-1', '/tmp', 10, 'run-1', Date.now(), true);

    expect(mockFrom).toHaveBeenCalledWith('repositories');
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      verification_status: 'passed',
      status: 'ready'
    }));
  });

  it('verification failure -> failed (when shouldTransitionToReady is true)', async () => {
    vi.spyOn(syncEngine, 'verifyRepositorySync').mockResolvedValue({ isValid: false, reason: 'Mismatch' });

    await runAsyncVerification('repo-2', '/tmp', 10, 'run-2', Date.now(), true);

    const mockUpdate = supabase.from('repositories').update as any;
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      verification_status: 'failed',
      status: 'failed'
    }));
  });

  it('thrown exception -> failed (when shouldTransitionToReady is true)', async () => {
    vi.spyOn(syncEngine, 'verifyRepositorySync').mockRejectedValue(new Error('Fatal boom'));

    await runAsyncVerification('repo-3', '/tmp', 10, 'run-3', Date.now(), true);

    const mockUpdate = supabase.from('repositories').update as any;
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      verification_status: 'failed',
      status: 'failed'
    }));
  });

  it('initial indexing flow still behaves correctly and does not transition to ready prematurely', async () => {
    vi.spyOn(syncEngine, 'verifyRepositorySync').mockResolvedValue({ isValid: true, reason: null });

    await runAsyncVerification('repo-4', '/tmp', 10, 'run-4', Date.now(), false);

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      verification_status: 'passed'
    }));
    expect(mockUpdate).not.toHaveBeenCalledWith(expect.objectContaining({
      status: 'ready'
    }));
    expect(mockUpdate).not.toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed'
    }));
  });

  it('timeout -> failed (when shouldTransitionToReady is true)', async () => {
    vi.useFakeTimers();
    // A promise that never resolves
    vi.spyOn(syncEngine, 'verifyRepositorySync').mockImplementation(() => new Promise(() => {}));

    const promise = runAsyncVerification('repo-5', '/tmp', 10, 'run-5', Date.now(), true);
    
    // Advance time by 60 seconds (WATCHDOG_TIMEOUT_MS)
    vi.advanceTimersByTime(60000);

    await promise;

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      verification_status: 'failed',
      status: 'failed',
      verification_reason: expect.stringContaining('Timeout')
    }));
  });
});
