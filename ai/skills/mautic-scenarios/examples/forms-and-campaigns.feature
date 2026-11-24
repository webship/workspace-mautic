Feature: A visitor signs up, and a campaign follows up
  As a marketer
  I want a form that brings visitors in as contacts, and a campaign that acts on a segment
  So that people who show interest are known and handled the same way

  Scenario: A visitor signs up through the public form and becomes a contact
    Given there is no contact "webship-test-signup@example.com"
    And I am not logged in
    When I open the public form "Newsletter sign-up"
    And I fill in "Email" with "webship-test-signup@example.com"
    And I fill in "First name" with "Webship test signup"
    And I send the public form
    Then the public form should say "Thank you for signing up."
    Given I am a logged in user with the "marketer" user
    Then the contact "webship-test-signup@example.com" should have 10 points
    And the contact "webship-test-signup@example.com" should have the tag "newsletter"
    And there is no contact "webship-test-signup@example.com"

  @scheduled-tasks
  Scenario: A campaign tags the contacts of a segment
    Given there is no campaign "Webship test campaign"
    And the contact "Karim Aziz" has no tag "webship-test-onboarded"
    And there is no segment "Webship test Aqaba"
    And I am a logged in user with the "marketer" user
    When I open the list of segments
    And I click "New"
    And I set "Name" to "Webship test Aqaba"
    And I add the filter "City" is equal to "Aqaba"
    And I save and close the form
    Then the segment "Webship test Aqaba" should have 1 contact
    When I open the list of campaigns
    And I click "New"
    And I set "Name" to "Webship test campaign"
    And I open the campaign builder
    And I add the segment "Webship test Aqaba" as the source of the campaign
    And I add the action "Modify contact's tags" to the campaign with:
      | Name     | Webship test: tag the contacts |
      | Add tags | webship-test-onboarded         |
    And I close the campaign builder
    And I set "Active" to "Yes"
    And I save and close the form
    Then the contact "Karim Aziz" should have the tag "webship-test-onboarded" once the scheduled tasks have run
    And there is no campaign "Webship test campaign"
    And there is no segment "Webship test Aqaba"
    And there is no tag "webship-test-onboarded"
