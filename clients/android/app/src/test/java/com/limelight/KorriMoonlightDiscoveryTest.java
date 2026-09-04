package com.limelight;

import com.limelight.nvstream.http.NvApp;

import org.junit.Test;

import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

public class KorriMoonlightDiscoveryTest {
    @Test
    public void emptyFirstPollPublishesCompletionAfterBackgroundRepair() throws Exception {
        NvApp refreshed = new NvApp("Korri Stream", "current", 7, false);
        AtomicReference<List<NvApp>> durable =
                new AtomicReference<>(Collections.emptyList());
        CountDownLatch releaseRefresh = new CountDownLatch(1);
        CountDownLatch completion = new CountDownLatch(1);
        ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            KorriMoonlightDiscovery discovery = new KorriMoonlightDiscovery(
                    hostUuid -> durable.get(),
                    (hostUuid, cached) -> cached.isEmpty(),
                    (hostUuid, guard) -> {
                        assertTrue(releaseRefresh.await(2, TimeUnit.SECONDS));
                        if (guard.current()) durable.set(Collections.singletonList(refreshed));
                    },
                    hostUuid -> completion.countDown(),
                    executor,
                    System::currentTimeMillis);

            assertTrue(discovery.query("host-uuid").isEmpty());
            releaseRefresh.countDown();
            assertTrue(completion.await(2, TimeUnit.SECONDS));
            List<NvApp> visible = discovery.query("host-uuid");
            assertEquals(1, visible.size());
            assertSame(refreshed, visible.get(0));
        } finally {
            releaseRefresh.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    public void healthyHostDoesNoNetworkWork() throws Exception {
        NvApp app = new NvApp("Korri Stream", "current", 7, false);
        AtomicInteger refreshes = new AtomicInteger();
        KorriMoonlightDiscovery discovery = new KorriMoonlightDiscovery(
                hostUuid -> Collections.singletonList(app),
                (hostUuid, cached) -> false,
                (hostUuid, guard) -> refreshes.incrementAndGet(),
                hostUuid -> {},
                Runnable::run,
                System::currentTimeMillis);

        assertEquals(1, discovery.query("healthy").size());
        assertEquals(0, refreshes.get());
    }

    @Test
    public void closeFencesWritesAndCompletion() throws Exception {
        CountDownLatch refreshEntered = new CountDownLatch(1);
        CountDownLatch releaseRefresh = new CountDownLatch(1);
        AtomicInteger writes = new AtomicInteger();
        AtomicInteger completions = new AtomicInteger();
        ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            KorriMoonlightDiscovery discovery = new KorriMoonlightDiscovery(
                    hostUuid -> Collections.emptyList(),
                    (hostUuid, cached) -> true,
                    (hostUuid, guard) -> {
                        refreshEntered.countDown();
                        releaseRefresh.await(2, TimeUnit.SECONDS);
                        if (guard.current()) writes.incrementAndGet();
                    },
                    hostUuid -> completions.incrementAndGet(),
                    executor,
                    System::currentTimeMillis);
            discovery.query("host-uuid");
            assertTrue(refreshEntered.await(2, TimeUnit.SECONDS));
            discovery.close();
            releaseRefresh.countDown();
            executor.shutdown();
            assertTrue(executor.awaitTermination(2, TimeUnit.SECONDS));
            assertEquals(0, writes.get());
            assertEquals(0, completions.get());
        } finally {
            releaseRefresh.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    public void blockedHostCannotStarveValidHost() throws Exception {
        CountDownLatch blockedEntered = new CountDownLatch(1);
        CountDownLatch validCompleted = new CountDownLatch(1);
        CountDownLatch releaseBlocked = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            KorriMoonlightDiscovery discovery = new KorriMoonlightDiscovery(
                    hostUuid -> Collections.emptyList(),
                    (hostUuid, cached) -> true,
                    (hostUuid, guard) -> {
                        if ("blocked".equals(hostUuid)) {
                            blockedEntered.countDown();
                            releaseBlocked.await(2, TimeUnit.SECONDS);
                        }
                    },
                    hostUuid -> {
                        if ("valid".equals(hostUuid)) validCompleted.countDown();
                    },
                    executor,
                    System::currentTimeMillis);
            discovery.query("blocked");
            assertTrue(blockedEntered.await(2, TimeUnit.SECONDS));
            discovery.query("valid");
            assertTrue(validCompleted.await(500, TimeUnit.MILLISECONDS));
        } finally {
            releaseBlocked.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    public void failedHostUsesBoundedRetryBackoff() throws Exception {
        AtomicLong clock = new AtomicLong(100);
        AtomicInteger attempts = new AtomicInteger();
        KorriMoonlightDiscovery discovery = new KorriMoonlightDiscovery(
                hostUuid -> Collections.emptyList(),
                (hostUuid, cached) -> true,
                (hostUuid, guard) -> {
                    attempts.incrementAndGet();
                    throw new IllegalStateException("offline");
                },
                hostUuid -> {},
                Runnable::run,
                clock::get);
        discovery.query("offline");
        discovery.query("offline");
        assertEquals(1, attempts.get());
        clock.addAndGet(5_001);
        discovery.query("offline");
        assertEquals(2, attempts.get());
    }
}
