Feature: Contacts and segments
  As a marketer
  I want to add contacts, note what we know of them, and group them in segments
  So that every person we talk to is one record, in the right groups

  Scenario: A new contact, with a tag, then removed
    Given there is no contact "Webship test contact"
    And there is no tag "webship-test-tag"
    And I am a logged in user with the "marketer" user
    When I open the list of contacts
    And I click "New"
    And I set "First Name" to "Webship test"
    And I set "Last Name" to "contact"
    And I set "Email" to "webship-test-contact@example.com"
    And I add "webship-test-tag" to "Tags"
    And I save and close the form
    Then the site should say "Webship test contact has been created!"
    And the contact "Webship test contact" should have the tag "webship-test-tag"
    And there is no contact "Webship test contact"
    And there is no tag "webship-test-tag"

  Scenario: A note on a contact
    Given the contact "Omar Saleh" has no note "Webship test"
    And I am a logged in user with the "marketer" user
    When I add the note "Webship test: sent the brochure" to the contact "Omar Saleh"
    Then the notes of the contact "Omar Saleh" should list "Webship test: sent the brochure"
    And the contact "Omar Saleh" has no note "Webship test"

  @scheduled-tasks
  Scenario: A segment of filters fills once the scheduled tasks ran
    Given there is no segment "Webship test segment"
    And I am a logged in user with the "marketer" user
    When I open the list of segments
    And I click "New"
    And I set "Name" to "Webship test segment"
    And I add the filter "City" is equal to "Aqaba"
    And I save and close the form
    Then the segment "Webship test segment" should have 1 contact
    And there is no segment "Webship test segment"
