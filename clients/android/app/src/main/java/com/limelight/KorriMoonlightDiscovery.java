package com.limelight;

import com.limelight.nvstream.http.NvApp;

import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/** Returns current app state and repairs Moonlight trust away from the WebView thread. */
final class KorriMoonlightDiscovery implements AutoCloseable {
    private static final int MAX_PENDING_HOSTS = 16;
    private static final int WORKER_COUNT = 4;
    private static final long RETRY_BACKOFF_MS = 5_000;
    private static final Executor ANDROID_REFRESH_EXECUTOR = createAndroidExecutor();

    interface CachedApps {
        List<NvApp> read(String hostUuid) throws Exception;
    }

    interface NeedsRepair {
        boolean test(String hostUuid, List<NvApp> cached) throws Exception;
    }

    interface Guard {
        boolean current();
    }

    interface Refresh {
        void run(String hostUuid, Guard guard) throws Exception;
    }

    interface Completion {
        void appsChanged(String hostUuid);
    }

    interface Clock {
        long nowMs();
    }

    private final CachedApps cachedApps;
    private final NeedsRepair needsRepair;
    private final Refresh refresh;
    private final Completion completion;
    private final Executor executor;
    private final Clock clock;
    private final ConcurrentHashMap<String, Boolean> inFlight = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Long> retryAfter = new ConcurrentHashMap<>();
    private final AtomicLong generation = new AtomicLong(1);

    KorriMoonlightDiscovery(
            CachedApps cachedApps,
            NeedsRepair needsRepair,
            Refresh refresh,
            Completion completion) {
        this(cachedApps, needsRepair, refresh, completion,
                ANDROID_REFRESH_EXECUTOR, android.os.SystemClock::elapsedRealtime);
    }

    KorriMoonlightDiscovery(
            CachedApps cachedApps,
            NeedsRepair needsRepair,
            Refresh refresh,
            Completion completion,
            Executor executor,
            Clock clock) {
        this.cachedApps = cachedApps;
        this.needsRepair = needsRepair;
        this.refresh = refresh;
        this.completion = completion;
        this.executor = executor;
        this.clock = clock;
    }

    List<NvApp> query(String hostUuid) throws Exception {
        List<NvApp> current = cachedApps.read(hostUuid);
        if (needsRepair.test(hostUuid, current)) {
            schedule(hostUuid);
        }
        return current;
    }

    private void schedule(String hostUuid) {
        if (hostUuid == null || hostUuid.trim().isEmpty()) {
            return;
        }
        long ticket = generation.get();
        Long blockedUntil = retryAfter.get(hostUuid);
        if (blockedUntil != null && blockedUntil > clock.nowMs()) {
            return;
        }
        if (inFlight.putIfAbsent(hostUuid, Boolean.TRUE) != null) {
            return;
        }
        try {
            executor.execute(() -> {
                Guard guard = () -> generation.get() == ticket;
                try {
                    if (!guard.current()) return;
                    refresh.run(hostUuid, guard);
                    if (!guard.current()) return;
                    retryAfter.remove(hostUuid);
                    completion.appsChanged(hostUuid);
                } catch (Exception ignored) {
                    if (guard.current()) {
                        retryAfter.put(hostUuid, clock.nowMs() + RETRY_BACKOFF_MS);
                    }
                } finally {
                    inFlight.remove(hostUuid);
                }
            });
        } catch (RuntimeException rejected) {
            inFlight.remove(hostUuid);
            retryAfter.put(hostUuid, clock.nowMs() + RETRY_BACKOFF_MS);
        }
    }

    @Override
    public void close() {
        generation.incrementAndGet();
        inFlight.clear();
        retryAfter.clear();
    }

    private static Executor createAndroidExecutor() {
        ThreadFactory factory = runnable -> {
            Thread thread = new Thread(runnable, "korri-moonlight-discovery");
            thread.setDaemon(true);
            return thread;
        };
        ThreadPoolExecutor executor = new ThreadPoolExecutor(
                WORKER_COUNT,
                WORKER_COUNT,
                30,
                TimeUnit.SECONDS,
                new ArrayBlockingQueue<>(MAX_PENDING_HOSTS),
                factory,
                new ThreadPoolExecutor.AbortPolicy());
        executor.allowCoreThreadTimeOut(true);
        return executor;
    }
}
