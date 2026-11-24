Feature: The site answers, its login works and its accounts log in
  As the owner of the site
  I want the login, the menus and each default account to work, each in its role
  So that a build that came out broken is caught before anything else is tested

  # Placed by the workspace's testing setup as a starting point: it is yours to change.
  # The accounts are the default ones (cmd-tools-mautic-cli.sh --add-users); a scenario logs in by a handle of the
  # users registry in cucumber.js, so no password is written here. It passes on a site built with --install
  # --add-users, with or without --sample-content: it reads only what the installer and the accounts make. It tries
  # no wrong password: the site refuses every login of a name for half an hour after three failed ones.

  @critical
  Scenario: A visitor is sent to the login page
    Given I am not logged in
    Then I should not be allowed to open "/s/dashboard"
    And I should be on the login page

  Scenario Outline: The <account> account logs in through the login form
    Given I am not logged in
    When I log in as "<account>" with the login form
    Then I should be logged in as "<account>"

    Examples:
      | account       |
      | administrator |
      | marketer      |
      | sales         |

  Scenario: Each account gets the parts of the site of its role
    Given I am a logged in user with the "administrator" user
    Then the settings menu should offer "Users"
    Given I am a logged in user with the "marketer" user
    Then the main menu should offer "Campaigns"
    And the settings menu should not offer "Users"
    Given I am a logged in user with the "sales" user
    Then the main menu should offer "Contacts"
    And the main menu should not offer "Campaigns"
    And I should not be allowed to open "/s/campaigns"
