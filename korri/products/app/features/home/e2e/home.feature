# Source job: docs/jobs/safe-game-resume.md
# Feature brief: korri/products/app/features/home/brief.md
# Brief ID: home
# Job IDs: safe-game-resume

@home @shift
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
