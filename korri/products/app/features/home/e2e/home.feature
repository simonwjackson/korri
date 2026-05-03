# Source job: docs/jobs/safe-game-resume.md
# Feature brief: korri/products/app/features/home/brief.md
# Brief ID: home
# Job IDs: safe-game-resume
#
# MVP coverage status (see docs/brainstorms/2026-05-02-personal-mvp-scope-requirements.md):
#   The home page is now sourced from the app.library.list RPC (Unit 8 of
#   docs/plans/2026-05-02-001-feat-personal-mvp-rocknix-launch-plan.md).
#   The scenarios below assert on specific game names (Crystalline Drift,
#   Ember Circuit) that came from the in-repo games fixture; against the
#   real RPC they require a BDD-time ROCKNIX library fixture configured
#   with those names. Marked @fixme until that fixture infrastructure
#   lands. See docs/solutions/integration-issues/2026-05-02-bdd-fixture-deferred.md.
#
#   The home's data flow (RPC → render → loading/error/empty/populated) is
#   covered by real-implementation unit + handler tests; the launch
#   composition (focus → confirm → spawn → failure banner → retry) is
#   covered by use-library-launch-controller.test.tsx.

@home @shift
@fixme(MVP-bdd-fixture-deferred)
Feature: Shift home surface
  The Shift home is the player's entry point. It puts the resume target front
  and centre, accepts directional focus across the rail, surfaces the
  available actions, and never launches anything on its own.

  @HOME-R1 @HOME-R2 @HOME-R3
  Scenario: Resume target is visible and focused at home entry without auto-launch
    When I open "/"
    Then I should see "Crystalline Drift"
    And the resume tile should be focused
    And the launcher should still be at "/"

  @HOME-R4
  Scenario: Caption updates when focus moves to another tile
    When I open "/"
    And I move focus to the tile named "Ember Circuit"
    Then the home caption should show "Ember Circuit"

  @HOME-R5
  Scenario: HUD displays the expected affordances
    When I open "/"
    Then I should see "Options"
    And I should see "Close"
    And I should see "Continue"
