/**
 * Mautic for Webship Workspace: a platform plugin.
 *
 * What the package carries is placed by the installer from the manifest: the builder and the command-line tool in
 * the sites folders, their functions and argparse under core/scripts/plugins/mautic/ (with mautic-site.php, which the
 * builder runs with the site's PHP, and the first feature of a site), and its AI items (ai/ in this package) in the
 * folder of their kind: the agents in AI Agents, the skill in AI Skills, the command in AI Commands, the prompts in AI
 * Prompts. The dashboard needs nothing drawn for it: the builder is in the Build list because it is a
 * cmd-*-project.sh, the row menus are the core's, the AI items are listed like any other. What register() adds is
 * what the assistant is told.
 *
 * Everything the dashboard is asked for goes through `api`; this package requires nothing from the dashboard's own
 * files, so it can be installed from npm and removed without a trace.
 */

import type { PluginApi } from '@webship.co/workspace-plugin-api';

/**
 * The plugin's name. A site is a PHP project of the container tool: the plugin claims it with
 * .ddev/config.mautic.yaml (on DDEV) or `platform: mautic` (on another runtime), and the core's tools call its
 * functions under mautic.
 */
export const PLATFORM = 'mautic';

/** The commands the installer places in every sites folder. */
export const COMMANDS = ['cmd-mautic-project.sh', 'cmd-tools-mautic-cli.sh'];

/** The agents the installer places in the AI Agents folder. */
export const AGENTS = ['mautic-site-builder', 'mautic-tester'];

/** The skill the installer places in the AI Skills folder (a folder each, with its SKILL.md). */
export const SKILLS = ['mautic-scenarios'];

/** The slash command the installer places in the AI Commands folder. */
export const AI_COMMANDS = ['mautic-test'];

/** The prompts the installer places in the AI Prompts folder: each a whole launch command for a new session. */
export const PROMPTS = ['mautic-build-and-test', 'mautic-scenarios-for-an-area'];

/** What the assistant is told about Mautic in this workspace. */
export function assistantContext(): string {
  return [
    'Mautic (a plugin, @webship.co/workspace-mautic), the open-source marketing automation platform: a site is built with',
    '`bash cmd-mautic-project.sh <name> --install --add-users` from a sites folder (dev, test, sandboxes, demos):',
    'the release package (7.2.2 by default, `--mautic-version`), its sum checked, installed with the site\'s own command-line installer,',
    'in a PHP project served by Apache in containers: on DDEV by default, at https://<name>.ddev.site, its mail caught at https://<name>.ddev.site:8026, its scheduled tasks (segments, campaigns) running every 15 seconds,',
    'or with `--runtime docker`, `podman`, `kubernetes`, `lando` or `docksal` on that runtime, at the address the build prints, with its mailbox (the scheduled tasks run beside the web server on Docker Compose, Podman and Kubernetes too; on Lando and Docksal `cmd-tools-mautic-cli.sh <name> --scheduled-tasks` runs them);',
    '`--install` makes the workspace account its administrator, `--add-users` adds the default accounts (administrator with the role Administrator, marketer with the role Marketer: the marketing tools, sales with the role Sales: the contacts it owns), each @example.com;',
    '`--sample-content` adds the contacts, company, stages, segments, email, landing page, asset and form the step pack is tested on.',
    '`bash cmd-tools-mautic-cli.sh <name>` says what the site is and lists its accounts; `--run "<command>"` runs the site\'s console (bin/console) in the container,',
    '`--scheduled-tasks` runs the segments and the campaigns once (`--every 15` again and again), `--sample-content` adds the sample content later, `--tidy` removes the test content a stopped run left, `--add-users` and `--cancel-users` manage the default accounts.',
    '`bash cmd-tools-testing.sh <name>` sets up webship-js with the Mautic step pack; `--run` runs the suite.',
    `For Mautic work, hand over to the agents ${AGENTS.map((a) => `\`${a}\``).join(' and ')}.`,
    `The plugin also places the skill ${SKILLS.map((a) => `\`${a}\``).join(', ')} (the step pack's phrases, by area) in ai-skills/,`,
    `the command ${AI_COMMANDS.map((a) => `\`/${a} <site>\``).join(', ')} in ai-commands/ and the prompts ${PROMPTS.map((a) => `\`${a}\``).join(' and ')} in ai-prompts/.`,
    'Never run PHP, Composer or the site\'s console on the host for a project; removing the project removes its database too.',
  ].join(' ');
}

export function register(api: PluginApi): void {
  api.addAssistantContext(assistantContext);
}
