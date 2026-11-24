Feature: The session, and what each role may open
  As the administrator of the site
  I want each account to log in, and to see and open only what its role allows
  So that a sales person works with their own contacts, and nobody but the administrators changes the settings

  Scenario: The marketer logs in through the login form
    Given I am not logged in
    When I log in as "marketer" with the login form
    Then I should be logged in as "marketer"
    And the page heading should be "Dashboard"

  # The site refuses every login of a name, as it is typed, for half an hour after three failed ones, and a login that
  # works does not set the count back: the wrong password is tried with an address no other scenario logs in with.
  Scenario: A wrong password is refused
    Given I am not logged in
    When I log in with the username "administrator@example.com" and the password "Wrong-password-1"
    Then the login should be refused with "Invalid login. Please verify credentials."
    And I should not be logged in

  Scenario: A sales account has only its contacts
    Given I am a logged in user with the "sales" user
    Then the main menu should offer "Contacts"
    And the main menu should not offer "Campaigns"
    When I open the list of contacts
    Then the list should show "Lina Haddad"
    But the list should not show "Omar Saleh"

  @js-off
  Scenario: A marketer may not open the users
    Given I am a logged in user with the "marketer" user
    Then the settings menu should not offer "Users"
    And I should not be allowed to open "/s/users"
