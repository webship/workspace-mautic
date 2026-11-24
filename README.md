# @webship.co/workspace-mautic

Mautic, the open-source marketing automation platform, for the [Webship Workspace](https://github.com/webship/workspace)
dashboard: a builder that makes a real Mautic site in containers, from its release package, installed with the site's
own command-line installer, served by Apache, its mail sent to the project's mail catcher and its scheduled tasks
(the segments, then the campaigns) kept running; a tool that runs the site's console; the default accounts and their
roles; optional sample content; the [Mautic step pack](https://github.com/webship/mautic-steps) wired into the
workspace's testing setup; and its AI items — two agents, a skill, a command and two prompts — each listed in the
workspace folder of its kind.

The workspace is container-based (DDEV by default): a site is a row like any other, so the row menus the core draws
(start, stop, launch, clone, remove, tests) work on it unchanged. The plugin claims its sites with a file of its own
(`.ddev/config.mautic.yaml`, which also runs the scheduled tasks), so the Tests menu of the row offers the plugin's
test users (see [The default accounts](#the-default-accounts)).

It is made from the reference platform plugin, `@webship.co/workspace-wordpress`. Every call it makes to the
containers is a plain verb of the container tool (`config`, `start`, `exec`, `describe`, `launch`), the way the
workspace's own builders call it.

## Use it

```bash
cd ~/workspace
bash core/scripts/plugins.sh --require @webship.co/workspace-mautic --with-needs   # npm install into the dashboard
bash core/scripts/plugins.sh --activate mautic --with-needs                        # plugins.mautic in settings.yml
bash core/scripts/plugins.sh --install mautic                                      # commands, functions, args, AI items
bash core/scripts/plugins.sh --configure mautic                                    # nothing to configure: it has no settings file
```

The same four steps are buttons on the dashboard's **Settings → Plugins** page. `--install` is idempotent.
`--uninstall` removes what it placed; an AI item you edited stays. `--remove mautic` then takes the package out of
the dashboard.

Everything the plugin carries lands in the folder it belongs to, when that folder is an active workspace folder:

| What | Lands in |
| --- | --- |
| `cmd-mautic-project.sh`, `cmd-tools-mautic-cli.sh` | every active sites folder: `dev/`, `test/`, `sandboxes/`, `demos/` |
| The agents `mautic-site-builder`, `mautic-tester` | `ai-agents/` |
| The skill `mautic-scenarios` | `ai-skills/` |
| The command `/mautic-test` | `ai-commands/` |
| The prompts `mautic-build-and-test`, `mautic-scenarios-for-an-area` | `ai-prompts/` |

There they are listed like any other item of the folder, and installed into Claude Code from there.

## What it needs

A workspace starts empty, so the manifest says what else this plugin needs (`needs`):

- one sites folder, for the builder and the tool: `dev`, `test`, `sandboxes`, `demos` (`dev` is the one added when none is there). The folder also carries `cmd-tools-testing.sh` and the Users tools this plugin's hooks answer to.
- `ai-agents`, `ai-skills`, `ai-commands` and `ai-prompts`: the AI folders its agents, its skill, its command and its prompts are placed in.

`--require` says so, `--activate` and `--install` stop until the workspace has them, and `--with-needs` adds what is missing first:

```bash
bash core/scripts/plugins.sh --activate mautic --with-needs   # dev and the four AI folders are required, activated and installed first
bash core/scripts/plugins.sh --install mautic
```

Everything the builder runs for a site runs in containers, through the container tool the workspace already needs:
PHP, the database and the site are the containers'; the release package is fetched, checked and unpacked there too.
On the machine it uses Python 3 (which the workspace's own argument parsing already needs). The plugin asks for no
command of its own on the machine.

## What the package holds

| Path | What it is |
| --- | --- |
| `commands/cmd-mautic-project.sh` | The builder, in the Build list as **Mautic (marketing automation)**, installed into every sites folder |
| `commands/cmd-tools-mautic-cli.sh` | The site's tool: what the site is and its accounts, a command of its console, its scheduled tasks, the sample content, the test content a stopped run left, the default accounts |
| `scripts/functions/fun-mautic.sh` | The bash functions behind both, sourced by bootstrap once installed; the names the core's tools look for (`set_mautic_users`, `add_mautic_users`, `cancel_mautic_users`, `testing_configure_mautic`) |
| `scripts/args/arg-mautic.sh`, `arg-mautic-cli.sh` | Their argparse; the Build form draws the builder's flags from the first |
| `scripts/mautic-site.php` | The site's side of the build (the step pack's own script), run with the site's PHP and the site's own code in the web container: the settings a test run needs, the accounts and their roles, the sample content, the clean-up of test content |
| `testing/site.feature` | The first feature a site gets when testing is set up |
| `ai/agents/mautic-site-builder.md` | The agent that builds and maintains sites with these commands |
| `ai/agents/mautic-tester.md` | The agent that writes and runs scenarios with the Mautic step pack |
| `ai/skills/mautic-scenarios/` | The skill: the step pack's phrases by area, the traps found on real sites, three example features |
| `ai/commands/mautic-test.md` | The slash command `/mautic-test <site>`: set up, match every step, run, report |
| `ai/prompts/mautic-build-and-test.md`, `mautic-scenarios-for-an-area.md` | Two prompts: whole launch commands for a new session |
| `src/index.ts` | `register(api)`: what the assistant is told about Mautic here |
| `features/mautic.feature` | Scenarios for the dashboard's own browser suite |
| `features/mautic-runtimes.feature` | The row, the test users and the pages of a site built on Docker Compose and on Kubernetes |

The `workspacePlugin` block in `package.json` is the manifest the installer reads.

## What is different from the reference

A Mautic site is a PHP application like the reference's, with no project type of its own in the container tool. The
plugin keeps the shape of the reference and changes only this:

| | WordPress (the reference) | Mautic |
| --- | --- | --- |
| Project | `--project-type=wordpress`, nginx and PHP | `--project-type=php --docroot=mautic --webserver-type=apache-fpm --database=mariadb:10.11`: Apache serves the site with the release's own rules |
| Recognised by | The project type | The file `.ddev/config.mautic.yaml`: the release in the environment of the web container, the scheduled tasks, and the plugin's claim on the project |
| The runtime | PHP of the web image | PHP at `--php-version` (8.3 by default; the release takes 8.2 to 8.4) |
| Getting the code | `wp core download` | The release package of the publisher, fetched in the web container and checked against the SHA-256 sum its publisher gives for it |
| Install | `wp core install` | The site's own command-line installer (`bin/console mautic:install`), with the workspace account as its administrator |
| Set up for testing | Nothing | Its mail goes to the project's mail catcher, no statistics are sent to an outside service, and on a runtime without HTTPS its cookies are not marked secure |
| Scheduled tasks | None | The segments, then the campaigns, every 15 seconds beside the web server; once at the end of the build |
| Database | The container tool's MariaDB | The same, at 10.11 |
| Mail | The container tool's mail catcher | The same: the site sends over SMTP to it (`https://<name>.ddev.site:8026`) |
| Accounts | WP-CLI | The site's own models, through the plugin's script, the accounts on its standard input; the roles Marketer and Sales with their permissions |
| The CLI | WP-CLI | The site's `bin/console`, through `cmd-tools-mautic-cli.sh --run` |
| Removing it | `ddev delete` | The same |
| Tests menu of the row | Reads the project type | The plugin's claim: the plugin's test users (`mautic`) |

No public domain, no hosted service and no account anywhere: on DDEV the site answers at `https://<name>.ddev.site`
through the container tool's router; on the other runtimes at the address the build prints (see [Runtimes](#runtimes)).
Only the open-source release, with no paid add-on and no marketplace package.

## The commands

Run them from a sites folder. `--help` is safe on both.

### Build a site

```bash
cd ~/workspace/dev
bash cmd-mautic-project.sh mysite --install --add-users                       # a site with its accounts
bash cmd-mautic-project.sh mydemo --install --add-users --sample-content      # with the sample contacts, segments and form
bash cmd-mautic-project.sh myold --install --add-users --php-version 8.2      # on another PHP the release takes
```

| Flag | What it does |
| --- | --- |
| `--install` | Run the site's installer, with the workspace account as its administrator, and set the site up for testing. Without it the site shows its installer |
| `--add-users` | With `--install`: add the default accounts and their roles |
| `--sample-content` | With `--install --add-users`: the content the step pack is tested on — the company "Example Trading", the stages "Lead" and "Customer", five contacts (with owners, points, tags and cities), the segments "Newsletter readers" and "Amman contacts", the email "Welcome email", the landing page "Spring webinar", the asset "Product brochure" and the form "Newsletter sign-up" (which tags the contact and gives it 10 points) |
| `--mautic-version <x.y.z>` | The release: `7.2.2` by default |
| `--php-version <x.y>` | The PHP of the web container: `8.3` by default; the release takes `8.2` to `8.4` |
| `--runtime <name>` | The container runtime to build on: `ddev` (the default), `docker`, `podman`, `kubernetes`, `lando` or `docksal`. See [Runtimes](#runtimes) |
| `--launch` | Open the site when it is ready |

On DDEV the site answers at `https://mysite.ddev.site` (the administration at `/s/login`) and its mail catcher at
`https://mysite.ddev.site:8026`. A project of the same name is deleted first. The site is in `mautic/` of the project.

A build takes about five minutes, most of it the download. Check the free memory and disk first (`free -g`,
`df -h /`), and build one site at a time on a machine others use.

### Runtimes

```bash
bash cmd-mautic-project.sh mysite --install --add-users                        # DDEV, the default
bash cmd-mautic-project.sh mysite --install --add-users --runtime docker       # Docker Compose
bash cmd-mautic-project.sh mysite --install --add-users --runtime kubernetes   # a Kubernetes cluster
```

Without `--runtime` a build takes `container.runtime` of the workspace's `settings.yml`, then DDEV.
It needs a Webship Workspace with the container runtimes
([webship/workspace#694](https://github.com/webship/workspace/issues/694)); on an older one the
builder refuses `--runtime` and builds on DDEV only.

| | DDEV | Docker Compose | Podman | Kubernetes | Lando | Docksal |
| --- | --- | --- | --- | --- | --- | --- |
| Build and install, with the default accounts and the sample content | Not yet run | Yes | Not yet run | Not yet run | Not yet run | Not yet run |
| The pages, and the login of each account in its role | Not yet run | Yes | Not yet run | Not yet run | Not yet run | Not yet run |
| `cmd-tools-mautic-cli.sh`: what the site is, `--run`, the accounts | Not yet run | Yes | Not yet run | Not yet run | Not yet run | Not yet run |
| Test users, cancelled and added with the core's tools | Not yet run | Yes | Not yet run | Not yet run | Not yet run | Not yet run |
| The scheduled tasks beside the web server | Not yet run | Yes, through `rt_daemon` | Not yet run | Not yet run | Not on Lando yet: the tool runs them | Not on Docksal yet: the tool runs them |
| The mail the site sends, in the runtime's mail catcher | Not yet run | Yes | Not yet run | Not yet run | Not yet run | Not yet run |
| Export and import the database | Not yet run | Yes | Not yet run | Not yet run | Not yet run | Not yet run |
| The testing setup and the suite, with the pack's examples | Not yet run | Not yet run | Not yet run | Not yet run | Not yet run | Not yet run |
| The row in the dashboard, and remove | Not yet run | Not yet run | Not yet run | Not yet run | Not yet run | Not yet run |

"Yes" means it was run on a real site of that runtime, in a throwaway workspace with the core of `1.0.x` after 1.0.30.

| Runtime | The site's address | What the project carries |
| --- | --- | --- |
| DDEV | `https://mysite.ddev.site`, its mail at `:8026` | `.ddev/config.yaml`, and `.ddev/config.mautic.yaml`: the claim of the plugin and the scheduled tasks |
| Docker Compose, Podman | `http://127.0.0.1:<port>`, printed by the build | `compose.yaml` (with `platform: mautic`: the claim, and `daemons: scheduled-tasks`), `.webship/runtime/Dockerfile`, `.webship/daemons/scheduled-tasks.sh` |
| Kubernetes | `http://<node address>:<port>`, printed by the build | The same, and `k8s/` (the namespace `ws-mysite`) |
| Lando | `http://127.0.0.1:<port>`, printed by the build | `.lando.yml`, with the claim |
| Docksal | `http://mysite.docksal.site` | `.docksal/`, with the claim |

What differs from DDEV:

- **The claim** is `platform: mautic` in the `x-webship:` block of the project's file (the core's `rt_claim`), in
  place of `.ddev/config.mautic.yaml`. The tools and the row's Tests menu read it.
- **The site is told the runtime's address:** plain HTTP on the site's port, so its cookies are not marked secure.
  Its mail goes over SMTP to the mail catcher of the project's stack (`mail`, Lando's `mailpit`).
- **The database** needs nothing new: `db` / `db` / `db` on the host `db`, on every runtime.
- **The scheduled tasks** run beside the web server on Docker Compose, Podman and Kubernetes, as a task of the
  project (the core's `rt_daemon`, [webship/workspace#825](https://github.com/webship/workspace/issues/825), in the
  core after 1.0.30). On Lando and Docksal, and with an older core, the tool runs them when asked:
  `bash cmd-tools-mautic-cli.sh mysite --scheduled-tasks` (once) or `--scheduled-tasks --every 15` (until stopped).
  `bash cmd-tools-mautic-cli.sh mysite` says which holds for a site.
- **The suite** runs in the Workspace's tests container, which hands it the site's address (`LAUNCH_URL`) and its
  mailbox (`MAIL_URL`); the testing setup writes no address into `cucumber.js` there.
- **Not there yet:** HTTPS and a host name are DDEV's (Docksal's own proxy gives a host name, on plain HTTP).

The same commands work on every runtime: `cmd-tools-mautic-cli.sh`, `cmd-tools-add-users.sh`,
`cmd-tools-testing.sh`.

### Work on a site

```bash
bash cmd-tools-mautic-cli.sh mysite                                    # what the site is: release, addresses, accounts, scheduled tasks
bash cmd-tools-mautic-cli.sh mysite --run "cache:clear"                # a command of the site's console, in the web container
bash cmd-tools-mautic-cli.sh mysite --run "mautic:segments:update"
bash cmd-tools-mautic-cli.sh mysite --run "list"                       # the commands the site's console has
bash cmd-tools-mautic-cli.sh mysite --scheduled-tasks                  # the segments, then the campaigns, once
bash cmd-tools-mautic-cli.sh mysite --scheduled-tasks --every 15       # again and again, until stopped
bash cmd-tools-mautic-cli.sh mysite --sample-content                   # the sample content, on a site without it
bash cmd-tools-mautic-cli.sh mysite --tidy                             # remove the test content a stopped run left ("Webship test …"), lift a login lock
bash cmd-tools-mautic-cli.sh mysite --add-users                        # the default accounts and their roles
bash cmd-tools-mautic-cli.sh mysite --cancel-users                     # delete them again
```

`--run` hands its words to `bin/console` in the site's folder. A new release of the site is a new build
(`--mautic-version`): the plugin does not update a site in place.

### The default accounts

| Account | Address | Role | Handle in the tests |
| --- | --- | --- | --- |
| `administrator` | `administrator@example.com` | Administrator: every part of the site, its users and its settings | `administrator` |
| `marketer` | `marketer@example.com` | Marketer: contacts, companies, segments, components, channels, campaigns, points, stages and reports; not the users, the roles or the settings | `marketer` |
| `sales` | `sales@example.com` | Sales: the contacts it owns and their notes | `sales` |

Each account has the password of the workspace's other default lists and logs in with its user name. They are made
by the plugin's script through the site's own models, the accounts on PHP's standard input (never on a command line
or in a file); an account that is there already gets its names, its address, its password and its role back.
Cancelling deletes them; the contacts they own stay, without an owner. An account of your own, and the workspace
account, stay when the default accounts are added or cancelled. They are for local sites and for tests.

The row's Tests menu offers **Add the test users** and **Cancel the test users** for a site this plugin claims: they
run the same list as

```bash
bash cmd-tools-add-users.sh mysite mautic       # the core's tool, with the plugin's list
bash cmd-tools-cancel-users.sh mysite mautic
```

### Test a site

```bash
bash cmd-tools-testing.sh mysite                  # webship-js, the step pack, the users registry, a first feature
bash cmd-tools-testing.sh mysite --run            # run the suite in the container
bash cmd-tools-testing.sh mysite --run --path tests/features/site.feature
```

`cmd-tools-testing.sh` is the workspace's own. For a site it also adds `@webship-js/mautic-steps` to `package.json`,
lists its step definitions in `cucumber.js` after webship-js's own, writes the mail catcher, the account that removes
test content (`administrator`), the users registry (the handles above, overridable with `MAUTIC_<HANDLE>_USERNAME` and
`MAUTIC_<HANDLE>_PASSWORD`), the browser messages setting, the tags that keep the pack's assertions that must fail out
of a normal run, and the site's address in place of the starter's `http://localhost:8080`. It places
`tests/features/site.feature` when the project has none, and makes sure the default accounts are on the site. Run it
again and it adds what is missing and keeps what you changed.

Until `@webship-js/mautic-steps` is on npm, give the testing setup its tarball (`npm pack` of the pack) with
`bash cmd-tools-testing.sh mysite --add-steps <path to the tarball>`, then run the setup again.

A scenario of your own reads like this one, from the step pack's phrases (the skill `mautic-scenarios` lists them by
area):

```gherkin
Feature: Segments
  @scheduled-tasks
  Scenario: A segment of filters fills once the scheduled tasks ran, then is removed
    Given there is no segment "Webship test segment"
    And I am a logged in user with the "marketer" user
    When I open the list of segments
    And I click "New"
    And I set "Name" to "Webship test segment"
    And I add the filter "City" is equal to "Aqaba"
    And I save and close the form
    Then the site should say "Webship test segment (webship-test-segment) has been created!"
    And the segment "Webship test segment" should have 1 contact
    And there is no segment "Webship test segment"
```

`tests/features/site.feature` passes on a site built with `--install --add-users`, with or without the sample
content, and the features of the step pack pass on a site built with `--sample-content`. The pack's features have
names of their own (`contacts.feature`, `segments.feature`, …): copying them beside `site.feature` replaces nothing.
The scenarios tagged `@scheduled-tasks` wait for the site's scheduled tasks: see [Runtimes](#runtimes) for where they
run on their own.

## The AI items

`ai/` in the package holds one folder per kind, the manifest's `ai` block names each item, and `--install` places it
in the workspace folder of that kind.

| Kind | Item | Use it to |
| --- | --- | --- |
| Agent | `mautic-site-builder` | Build, maintain or remove a site with the commands above, in containers only |
| Agent | `mautic-tester` | Set the testing stack up, look at the site in the Playwright MCP browser first, write scenarios from the pack's steps and run them; it never creates an account in a suite and never writes a platform name into a step phrase |
| Skill | `mautic-scenarios` | Write a scenario from phrases that exist: the pack's steps by area, the handles of the users registry, the traps found on real sites, and three features that pass on a site with the sample content and the default accounts |
| Command | `/mautic-test <site> [feature or @tag]` | Run the suite of a site from inside a session: set up when missing, match every step, run, report what failed and why |
| Prompt | `mautic-build-and-test` | Start a session that builds a site, says what it is, sets the testing stack up and runs the first feature |
| Prompt | `mautic-scenarios-for-an-area` | Start a session that writes and runs the scenarios of one area of a site |

After `--install` each is in its folder on the dashboard. **Install** there puts an agent, a skill or a command into
Claude Code (`~/.claude/agents`, `~/.claude/skills`, `~/.claude/commands`), or from the command line:

```bash
cd ~/workspace/ai-agents   && bash cmd-tools-ai-items.sh mautic-tester --install
cd ~/workspace/ai-skills   && bash cmd-tools-ai-items.sh mautic-scenarios --install
cd ~/workspace/ai-commands && bash cmd-tools-ai-items.sh mautic-test --install
```

A prompt is not installed: it is the whole `claude …` launch command of a new session, and the dashboard's **New
screen** form lists it as a template. By hand, fill the placeholders in and run the command of the file from the
folder it names.

The items are written for any AI CLI, with Claude Code as the default shape: the frontmatter and the file layout are
Claude Code's, the body of each item is plain Markdown that names no tool or feature of one CLI, a command says in
words what its arguments are, and the text between the triple quotes of a prompt can be given to another AI CLI as it
is.

Every step phrase the items show is checked against the definitions of the step pack and of webship-js
(`tests/fixtures/step-definitions.txt`), and every command and flag against the plugin's own.

## Develop it

```bash
npm install     # builds dist/ (TypeScript)
npm run lint
npm test        # the manifest, the commands, the AI items, the functions against a scaffolded project
```

CI runs the same on Node.js 24 and 26, parses every shell script, and runs the plugin's `features/mautic.feature`
against a dashboard with this plugin installed, with one real site built on Docker Compose
(`webship/workspace/.github/workflows/plugin-browser-suite.yml`).

The Mautic name is a trademark of its owner; this plugin is not affiliated with or endorsed by them.

## License

ISC (see `LICENSE`).
