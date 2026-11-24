---
name: mautic-scenarios
description: Write webship-js scenarios for a Mautic site (the open-source marketing automation platform) of the Webship Workspace from phrases that exist — the Mautic step pack's steps by area (the session and the refusals of a role, the menus, the lists, the forms and their fields, contacts, segments and their filters, forms for visitors, landing pages and assets, emails, campaigns and the scheduled tasks, reports, the mail), the traps found on real sites, and three whole features. Use when asked to write, extend or fix scenarios for a Mautic site, or when a scenario of the site fails on a phrase.
---

# mautic-scenarios

Scenarios for a site built with the Mautic plugin (`bash cmd-mautic-project.sh <site> --install --add-users`;
`--sample-content` for the contacts, segments and the rest the pack is tested on) in a container-based workspace (DDEV
by default), tested with webship-js and `@webship-js/mautic-steps` once `bash cmd-tools-testing.sh <site>` set the
project up. Every phrase below exists in the pack or in webship-js; a scenario names no platform.

## Accounts

- `Given I am a logged in user with the "marketer" user`: `administrator` (the role Administrator: everything),
  `marketer` (the role Marketer: the marketing tools, not the users or the settings), `sales` (the role Sales: the
  contacts it owns and their notes). `Given I am not logged in` for a visitor.
- The accounts are made by the build (`cmd-tools-mautic-cli.sh <site> --add-users`); a suite never creates or deletes
  one, and never writes a password: it logs in by the handle.

## Phrases by area

| Area | Steps |
| --- | --- |
| Session | `I log in as "marketer" with the login form`, `I log in with the username "…" and the password "…"`, `the login should be refused with "Invalid login. Please verify credentials."`, `I am not logged in`, `I log out`, `I should be logged in`, `I should not be logged in`, `I should be logged in as "marketer"`, `I should be on the login page` (`… saying "…"`), `I should not be allowed to open "/s/campaigns"`, `I ask for a password reset link for "sales"`, `I set the password of "sales" on the reset page` (`… with the confirmation "…"`) |
| Menus | `I go to "Forms" in the main menu`, `the main menu should offer "Campaigns"` (`should not offer`), `I go to "Users" in the settings menu`, `the settings menu should offer "Users"` (`should not offer`), `the page heading should be "Contacts"` |
| The site's answers | `the site should say "… has been created!"`, `the site should ask "Delete this contact?"`, `I answer the confirmation with "Delete"`, `the dialog "Quick Add" should be open`, `I press "Save" in the dialog`, `no dialog should be open`, `I search everything for "Haddad"`, `the search results should list "Haddad, Lina" under "Contacts"` |
| Lists | `I open the list of contacts` (segments, forms, landing pages, assets, emails, campaigns, stages, point actions, tags, reports, users, roles, …), `I search the list for "…"`, `the list should show "…"` (`should not show`), `the list should have 2 items`, `the row of "Lina Haddad" should show "Lead"`, `I open "…" from the list`, `I choose "Delete" in the options of "…"`, `I sort the list by "Points" in descending order`, `the list should start with "Omar Saleh", "Lina Haddad"` |
| Forms of the administration | `I set "Name" to "…"` (a text, the rich text editor, a list's option, "Yes"/"No" of a switch), `I set the following fields:`, `I add "webship-test-tag" to "Tags"`, `"City" should be set to "Amman"`, `the field "Email" should show the error "is invalid."`, `I open the "Filters" tab`, `I save the form`, `I save and close the form`, `I cancel the form` |
| Contacts | `I open the contact "Lina Haddad"`, `the contact "…" should have 25 points`, `the contact "…" should have the tag "newsletter"` (`should not have`), `the contact "…" should be in the segment "…"` (`should not be`), `the contact "…" should be at the company "Example Trading"`, `the "Contact owner" of the contact "…" should be "Sales Test"`, `the history of the contact "…" should show "Form submitted"`, `I add the note "…" to the contact "…"`, `the notes of the contact "…" should list "…"`, `I remove the tag "…" from the contact "…"`, `I send the contact "…" an email with the subject "…" saying "…"` |
| Segments | `I add the filter "City" is equal to "Aqaba"`, `I add the filter "Tags" includes any of "vip"`, `I add the filter "City" from "Primary company" is equal to "…"`, `the segment "Newsletter readers" should have 2 contacts` |
| Forms for visitors | `I add a "Text: Short answer" field to the form with:`, `I add the submit action "Adjust contact's points" to the form with:`, `the form should hold the field "…"` (`the action "…"`), `I open the public form "Newsletter sign-up"`, `I fill in "Email" with "…"` (webship-js), `I send the public form`, `the public form should say "Thank you for signing up."`, `the public form field "Email" should show the error "This is required."`, `the results of the form "…" should list "…"` |
| Pages and assets | `I go to "/spring-webinar"` (webship-js), `the page should load the tracking script`, `I upload the file "webship-test-notes.txt" to the asset`, `the asset "Product brochure" should download as "product-brochure.txt"` (`… with "…"`) |
| Campaigns | `I open the campaign builder`, `I add the segment "…" as the source of the campaign`, `I add the action "Modify contact's tags" to the campaign with:`, `the campaign builder should show "…"`, `I close the campaign builder`, `the contact "…" should have the tag "…" once the scheduled tasks have run` |
| Reports | `the report should list "Newsletter sign-up" under "Title"`, `the dashboard should show the widget "Contacts Created"` (`… saying "…"`) |
| Mail | `an email with the subject "password reset" should be sent to "sales"`, `the email with the subject "…" to "…" should contain "…"`, `I open the "passwordresetconfirm" link of the email with the subject "…" to "sales"`, `no email should be sent to "…"` |
| Test content | `there is no contact "Webship test contact"` (company, segment, form, landing page, asset, email, campaign, stage, point action, tag, category), `the contact "…" has no note "…"`, `the contact "…" has no tag "…"`, `there should be a form "…"` |

## Traps found on real sites

- **Messages close themselves after four seconds.** `the site should say "…"` reads them anyway: the pack records each
  message as it comes. Check it right after the action that brings it.
- **A list remembers its last search** for the session: `I open the list of …` opens it cleared. A word before a colon
  in a search is a command of the site's search; the steps search a name with a colon as a phrase.
- **Its lists are searchable pickers**, not plain lists: `I set "Stage" to "Lead"` types and picks, as a person does.
  `I add "…" to "Tags"` makes a tag that is not there yet, at once.
- **A delete asks first**, and so does taking a tag off a contact ("Are you sure you want to remove this tag from the
  contact?"): answer with `I answer the confirmation with "…"` (the pack's step for a tag answers it itself).
- **A sales account sees only the contacts it owns**, and its menu holds only the dashboard and the contacts.
- **A segment of filters fills in the site's scheduled tasks** (the list says "Building" until then); so does a
  campaign's action. Tag such scenarios `@scheduled-tasks`. Where `bash cmd-tools-mautic-cli.sh <site>` says the
  tasks run "every 15 seconds" they run on their own; elsewhere run
  `bash cmd-tools-mautic-cli.sh <site> --scheduled-tasks --every 15` beside the suite.
- **An email's subject is copied into its empty internal name** when the subject field is left: set the subject first,
  then the name.
- **A refusal is an error status**: the browser logs "Failed to load resource" for a 403 or a 404; give those
  scenarios `@js-off`.
- **Three failed logins lock a name.** The site refuses every login of a name, as it is typed, for 30 minutes after
  three failed ones from one address, and a login that works does not set the count back. Try a wrong password with a
  name no other scenario logs in with (an account's address, `administrator@example.com`), never with the user name
  the other scenarios use; `bash cmd-tools-mautic-cli.sh <site> --tidy` lifts a lock.

## Three whole features

They pass on a site built with `--install --add-users --sample-content`:

- [`examples/session-and-access.feature`](examples/session-and-access.feature): the login, a refusal, what each role may open.
- [`examples/contacts-and-segments.feature`](examples/contacts-and-segments.feature): a contact made and removed, a note, a segment of filters.
- [`examples/forms-and-campaigns.feature`](examples/forms-and-campaigns.feature): a visitor signs up through the public form, a campaign tags a segment.

Copy them into `tests/features/` of a project built with `--sample-content` and run them:

```bash
bash cmd-tools-testing.sh <site> --run --path tests/features/contacts-and-segments.feature
```

## The book

For any automated functional testing in this work (a Gherkin feature, a step definition, choosing a
step, a test run and its failures), read the book *Automated Functional Testing Recipes* first.

- **Where.** Use the first that exists: `.claude/automated-functional-testing-recipes/` in the project,
  `~/.claude/automated-functional-testing-recipes/` (installed by webship/webship-js-ai-agent,
  webship/webship-js-skills or webship/ai-agents), or
  https://github.com/webship/webship-js-ai-agent/tree/2.0.x/automated-functional-testing-recipes
- **How.** Its `README.md` first, then the chapter that matches the task (one file per chapter,
  named by its subject), not the single complete file.
- **Which wins.** The installed webship-js package and the step pack are the source of truth for
  step phrasing. When they differ from the book, follow them and say so.
- **For a site.** Start with `ch10-authentication-authorization.md` (logins, refusals and what each role may open),
  `ch26-testing-cms-applications.md` (content made and removed, roles, a workflow across roles),
  `ch07-waiting-dynamic-content.md` (waiting on the site's own signals) and `ch09-table-list-testing.md` (lists,
  their search, their counts and their order).
