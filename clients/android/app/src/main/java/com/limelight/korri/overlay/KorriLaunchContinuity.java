package com.limelight.korri.overlay;

import android.app.ActivityManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;

/** Binds a matched launch to one process and requires positive evidence before ending it. */
public final class KorriLaunchContinuity {
    public interface ProcessInspector {
        ProcessObservation inspect();
    }

    public interface Scheduler {
        void schedule(Runnable callback);
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

    private final ProcessInspector inspector;
    private final Scheduler scheduler;
    private final EndLaunch endLaunch;
    private final int maxChecks;
    private KorriActiveLaunch launch;
    private ProcessIdentity boundIdentity;
    private boolean checking;
    private int generation;

    public KorriLaunchContinuity(
            ProcessInspector inspector, Scheduler scheduler, EndLaunch endLaunch, int maxChecks) {
        if (maxChecks < 1) throw new IllegalArgumentException("maxChecks must be positive");
        this.inspector = inspector;
        this.scheduler = scheduler;
        this.endLaunch = endLaunch;
        this.maxChecks = maxChecks;
    }

    public void updateSession(KorriActiveLaunch next) {
        if (sameLaunch(launch, next)) return;
        generation++;
        checking = false;
        boundIdentity = null;
        launch = next;
    }

    public void updateForeground(String packageName, String className) {
        if (launch == null) return;
        if (launch.matchesForeground(packageName, className)) {
            generation++;
            checking = false;
            if (boundIdentity == null) {
                ProcessObservation observation = inspector.inspect();
                if (observation.complete) {
                    boundIdentity = findTarget(observation.identities, launch.targetPackage());
                }
            }
            return;
        }
        if (boundIdentity != null && !checking) {
            checking = true;
            int checkGeneration = ++generation;
            scheduleCheck(checkGeneration, 0);
        }
    }

    public boolean hasBoundIdentity(String launchId, int pid) {
        return launch != null
                && launch.launchId().equals(launchId)
                && boundIdentity != null
                && boundIdentity.pid == pid;
    }

    private void scheduleCheck(int checkGeneration, int completedChecks) {
        scheduler.schedule(() -> checkLiveness(checkGeneration, completedChecks));
    }

    private void checkLiveness(int checkGeneration, int completedChecks) {
        if (checkGeneration != generation || launch == null || boundIdentity == null) return;
        ProcessObservation observation = inspector.inspect();
        if (observation.complete && !observation.identities.contains(boundIdentity)) {
            String endedLaunchId = launch.launchId();
            generation++;
            checking = false;
            launch = null;
            boundIdentity = null;
            endLaunch.clear(endedLaunchId);
            return;
        }
        int nextCompletedChecks = completedChecks + 1;
        if (nextCompletedChecks < maxChecks) {
            scheduleCheck(checkGeneration, nextCompletedChecks);
        } else {
            checking = false;
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
