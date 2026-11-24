Feature: The Mautic plugin on the dashboard
  Once the plugin is activated and installed, the sites folders offer the Mautic builder, each AI folder lists the
  items of its kind the plugin ships, and the Plugins page lists the plugin with its steps.

  # Settings lists every plugin that was added; the package and what the plugin ships are on its own page.
  Scenario: Settings lists the plugin, and its own page names its package and what it ships
    Given I am on "/settings"
     Then I should see "Mautic"
     When I go to "/settings/plugin/mautic"
     Then I should see "@webship.co/workspace-mautic"
      And I should see "cmd-mautic-project.sh"
      And I should see "mautic-site-builder"

  Scenario: A sites folder offers the Mautic builder
    Given I am on "/dev"
     Then "option[value='cmd-mautic-project.sh']" should be attached

  # The AI folders are searched by name: with every plugin on, a folder lists more than one page of items.
  Scenario: The AI Agents folder lists the agents the plugin ships
    Given I am on "/ai-agents?q=mautic-"
     Then I should see "mautic-site-builder"
      And I should see "mautic-tester"

  Scenario: The AI Skills folder lists the skill the plugin ships
    Given I am on "/ai-skills?q=mautic-scenarios"
     Then I should see "mautic-scenarios"

  Scenario: The AI Commands folder lists the command the plugin ships
    Given I am on "/ai-commands?q=mautic-test"
     Then I should see "mautic-test"

  Scenario: The AI Prompts folder lists the prompts the plugin ships
    Given I am on "/ai-prompts?q=mautic-"
     Then I should see "mautic-build-and-test"
      And I should see "mautic-scenarios-for-an-area"
