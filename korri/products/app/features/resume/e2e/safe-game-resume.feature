# Source job: docs/jobs/safe-game-resume.md
# Feature brief: korri/products/app/features/resume/brief.md
# Brief ID: resume
# Job IDs: safe-game-resume

@fixme(Safe-game-resume-not-implemented-yet)
@jtbd-safe-game-resume
Feature: Safe game resume
  The player has already chosen what they are playing.
  The launcher helps them continue safely without re-browsing the library or silently risking progress.

  Background:
    Given the launcher has a previous game named "Hades"

  @SGR-O2 @SGR-O4
  Scenario: Previous game is offered as the primary continuation action
    When I open the launcher
    Then "Hades" should be the primary continue action
    And the launcher should not auto-launch "Hades"

  @SGR-O1 @SGR-O3
  Scenario: Supported progress check runs before launch
    Given "Hades" supports a pre-launch progress safety check
    When I choose to continue "Hades"
    Then the launcher should check progress safety before launching
    And the launcher should run the launch command only after the check succeeds

  @SGR-O1
  Scenario: Unverified progress safety requires confirmation
    Given "Hades" has plausible progress risk
    And the launcher cannot verify that local progress is safe
    When I choose to continue "Hades"
    Then I should see a progress-risk confirmation
    And I should be able to cancel without launching
    And I should be able to continue anyway with risk acknowledged

  @SGR-O1
  Scenario: Last played on another device prompts when sync cannot verify safety
    Given "Hades" was last played on another device where this app is installed
    And automatic progress sync cannot verify safety
    When I choose to continue "Hades"
    Then I should see a progress-risk confirmation
    And the launcher should not run the launch command unless I continue anyway

  @SGR-O5
  Scenario: Failed launch command can be retried
    Given "Hades" is the current continue target
    And the launch command for "Hades" fails
    When the launch failure is shown
    Then I should be able to retry launching "Hades"
    And I should not need to find "Hades" again
