# Source job: docs/jobs/safe-game-resume.md
# Feature brief: product/apps/portal/features/resume/brief.md
# Brief ID: resume
# Job IDs: safe-game-resume
#
# MVP coverage status (see docs/brainstorms/2026-05-02-personal-mvp-scope-requirements.md):
#   - SGR-R6 (launch on confirm) and SGR-R7 (retry after failure) are
#     implemented in code and covered by real-implementation unit/handler/hook
#     tests (no mocks: real Bun.spawn against tools/testing/fake-game.sh, real
#     RPC roundtrip via withRpcServer, real RocknixSource over withTempLibrary).
#   - The Playwright BDD scenarios below are tagged @fixme until the BDD-time
#     ROCKNIX library fixture infrastructure lands. See
#     docs/solutions/integration-issues/2026-05-02-bdd-fixture-deferred.md.
#   - Multi-device scenarios (SGR-R3 / SGR-R4 / SGR-R5) are tagged
#     @fixme(MVP-deferred-multi-device) — vacuously satisfied for the
#     personal MVP per the resume brief.

@jtbd-safe-game-resume
Feature: Safe game resume
  The player has already chosen what they are playing.
  The launcher helps them continue safely without re-browsing the library or silently risking progress.

  Background:
    Given the launcher has a previous game named "Hades"

  @SGR-O2 @SGR-O4
  @fixme(MVP-bdd-fixture-deferred)
  Scenario: Previous game is offered as the primary continuation action
    When I open the launcher
    Then "Hades" should be the primary continue action
    And the launcher should not auto-launch "Hades"

  @SGR-R6
  @fixme(MVP-bdd-fixture-deferred)
  Scenario: Confirm on the resume target launches the configured launch command
    When I open the launcher
    And I confirm "Hades"
    Then the launch command for "Hades" should run

  @SGR-O5 @SGR-R7
  @fixme(MVP-bdd-fixture-deferred)
  Scenario: Failed launch command can be retried from the failure banner
    Given the launch command for "Hades" fails
    When I open the launcher
    And I confirm "Hades"
    Then I should see a launch failure banner for "Hades"
    When I retry from the failure banner
    Then the launch command for "Hades" should run again

  @SGR-O1 @SGR-O3
  @fixme(MVP-deferred-multi-device)
  Scenario: Supported progress check runs before launch
    Given "Hades" supports a pre-launch progress safety check
    When I choose to continue "Hades"
    Then the launcher should check progress safety before launching
    And the launcher should run the launch command only after the check succeeds

  @SGR-O1
  @fixme(MVP-deferred-multi-device)
  Scenario: Unverified progress safety requires confirmation
    Given "Hades" has plausible progress risk
    And the launcher cannot verify that local progress is safe
    When I choose to continue "Hades"
    Then I should see a progress-risk confirmation
    And I should be able to cancel without launching
    And I should be able to continue anyway with risk acknowledged

  @SGR-O1
  @fixme(MVP-deferred-multi-device)
  Scenario: Last played on another device prompts when sync cannot verify safety
    Given "Hades" was last played on another device where this app is installed
    And automatic progress sync cannot verify safety
    When I choose to continue "Hades"
    Then I should see a progress-risk confirmation
    And the launcher should not run the launch command unless I continue anyway
