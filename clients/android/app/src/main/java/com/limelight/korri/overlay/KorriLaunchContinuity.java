package com.limelight.korri.overlay;

import android.app.ActivityManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;

/** Bounded monitor that binds and later clears one exact foreground launch process. */
public final class KorriLaunchContinuity {
    public interface ProcessInspector {
        ProcessObservation inspect();
    }

    public interface Cancellable {
        void cancel();
    }

    public interface Scheduler {
        Cancellable schedule(Runnable callback);
    }

    public interface EndLaunch {
        void clear(String launchId);
    }

    public static final class ProcessIdentity {
        public final int pid;
        public final int uid;
        public final String processName;
        public final String packageName;

        public ProcessIdentity(int pid, int uid, String processName, String packageName) {
            this.pid = pid;
            this.uid = uid;
            this.processName = processName;
            this.packageName = packageName;
        }

        @Override
        public boolean equals(Object other) {
            if (!(other instanceof ProcessIdentity)) return false;
            ProcessIdentity identity = (ProcessIdentity) other;
            return pid == identity.pid
                    && uid == identity.uid
                    && Objects.equals(processName, identity.processName)
                    && Objects.equals(packageName, identity.packageName);
        }

        @Override
        public int hashCode() {
            return Objects.hash(pid, uid, processName, packageName);
        }
    }

    public static final class ProcessObservation {
        private final boolean complete;
        private final List<ProcessIdentity> identities;

        private ProcessObservation(boolean complete, List<ProcessIdentity> identities) {
            this.complete = complete;
            this.identities = Collections.unmodifiableList(new ArrayList<>(identities));
        }

        public static ProcessObservation unavailable() {
            return new ProcessObservation(false, Collections.emptyList());
        }

        public static ProcessObservation complete(List<ProcessIdentity> identities) {
            return new ProcessObservation(true, identities);
        }
    }

    /** Production inspector. A null process list is deliberately not an empty observation. */
    public static final class ActivityManagerProcessInspector implements ProcessInspector {
        private final ActivityManager manager;

        public ActivityManagerProcessInspector(ActivityManager manager) {
            this.manager = manager;
        }

        @Override
        public ProcessObservation inspect() {
            if (manager == null) return ProcessObservation.unavailable();
            List<ActivityManager.RunningAppProcessInfo> processes =
                    manager.getRunningAppProcesses();
            if (processes == null) return ProcessObservation.unavailable();
            List<ProcessIdentity> identities = new ArrayList<>();
            for (ActivityManager.RunningAppProcessInfo process : processes) {
                if (process == null || process.processName == null) continue;
                if (process.pkgList == null || process.pkgList.length == 0) {
                    identities.add(new ProcessIdentity(
                            process.pid, process.uid, process.processName, process.processName));
                    continue;
                }
                for (String packageName : process.pkgList) {
                    if (packageName != null) {
                        identities.add(new ProcessIdentity(
                                process.pid, process.uid, process.processName, packageName));
                    }
                }
            }
            return ProcessObservation.complete(identities);
        }
    }

    private enum CheckKind {
        BIND,
        LIVENESS
    }

    private final ProcessInspector inspector;
    private final Scheduler scheduler;
    private final EndLaunch endLaunch;
    private final int maxChecks;
    private KorriActiveLaunch launch;
    private ProcessIdentity boundIdentity;
    private String foregroundPackage;
    private String foregroundClass;
    private Cancellable pending;
    private int generation;
    private boolean destroyed;

    public KorriLaunchContinuity(
            ProcessInspector inspector, Scheduler scheduler, EndLaunch endLaunch, int maxChecks) {
        if (maxChecks < 1) throw new IllegalArgumentException("maxChecks must be positive");
        this.inspector = inspector;
        this.scheduler = scheduler;
        this.endLaunch = endLaunch;
        this.maxChecks = maxChecks;
    }

    public void updateSession(KorriActiveLaunch next) {
        if (destroyed || sameLaunch(launch, next)) return;
        replaceGeneration();
        boundIdentity = null;
        launch = next;
        if (matchesKnownForeground()) {
            schedule(CheckKind.BIND, 0);
        }
    }

    public void updateForeground(String packageName, String className) {
        if (destroyed) return;
        foregroundPackage = packageName;
        foregroundClass = className;
        if (launch == null) return;
        if (matchesKnownForeground()) {
            if (boundIdentity == null && pending == null) {
                schedule(CheckKind.BIND, 0);
            }
            return;
        }
        if (boundIdentity != null) {
            if (pending == null) schedule(CheckKind.LIVENESS, 0);
        } else if (pending != null) {
            generation++;
            cancelPending();
        }
    }

    public boolean hasBoundIdentity(String launchId, int pid) {
        return launch != null
                && launch.launchId().equals(launchId)
                && boundIdentity != null
                && boundIdentity.pid == pid;
    }

    public void destroy() {
        if (destroyed) return;
        destroyed = true;
        replaceGeneration();
        launch = null;
        boundIdentity = null;
        foregroundPackage = null;
        foregroundClass = null;
    }

    private void schedule(CheckKind kind, int completedChecks) {
        String launchId = launch.launchId();
        int callbackGeneration = generation;
        pending = scheduler.schedule(
                () -> check(launchId, callbackGeneration, kind, completedChecks));
    }

    private void check(
            String launchId, int callbackGeneration, CheckKind kind, int completedChecks) {
        if (!isCurrent(launchId, callbackGeneration)) return;
        pending = null;
        ProcessObservation observation = inspector.inspect();
        if (kind == CheckKind.BIND) {
            if (!matchesKnownForeground()) return;
            if (observation.complete) {
                boundIdentity = findTarget(observation.identities, launch.targetPackage());
                if (boundIdentity != null) return;
            }
        } else if (boundIdentity == null) {
            return;
        } else if (observation.complete && !observation.identities.contains(boundIdentity)) {
            generation++;
            launch = null;
            boundIdentity = null;
            endLaunch.clear(launchId);
            return;
        }

        int nextCompletedChecks = completedChecks + 1;
        if (nextCompletedChecks < maxChecks) {
            schedule(kind, nextCompletedChecks);
        }
    }

    private boolean matchesKnownForeground() {
        return launch != null && launch.matchesForeground(foregroundPackage, foregroundClass);
    }

    private boolean isCurrent(String launchId, int callbackGeneration) {
        return !destroyed
                && callbackGeneration == generation
                && launch != null
                && launch.launchId().equals(launchId);
    }

    private void replaceGeneration() {
        generation++;
        cancelPending();
    }

    private void cancelPending() {
        if (pending != null) {
            pending.cancel();
            pending = null;
        }
    }

    private static ProcessIdentity findTarget(
            List<ProcessIdentity> identities, String targetPackage) {
        for (ProcessIdentity identity : identities) {
            if (targetPackage.equals(identity.packageName)) return identity;
        }
        return null;
    }

    private static boolean sameLaunch(KorriActiveLaunch left, KorriActiveLaunch right) {
        if (left == null || right == null) return left == right;
        return left.launchId().equals(right.launchId());
    }
}
