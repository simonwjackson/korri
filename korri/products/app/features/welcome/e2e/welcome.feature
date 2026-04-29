@smoke
Feature: Welcome page
  Scenario: Viewing the starter page
    When I open "/"
    Then I should see "React, Tailwind, TanStack Router, and Effect RPC."
