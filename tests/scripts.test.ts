import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

// Compiled, these tests run from dist/tests, so the package root is one folder further up.
const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');
const FUNCTIONS = path.join(PKG, 'scripts', 'functions', 'fun-mautic.sh');

// The cucumber.js webship-js scaffolds, as far as the testing hook reads it.
const SCAFFOLD = `module.exports = {
  default: {
    requireModule: ['tsx/cjs'],
    require: [
      'node_modules/webship-js/tests/step-definitions/**/*.js',          // Webship-js core step definitions.
      'tests/step-definitions/**/*.js',                                  // Your custom step definitions.
    ],
    paths: ['tests/features/**/*.feature'],
    worldParameters: {
      launchUrl: process.env.LAUNCH_URL || 'http://localhost:8080',
    },
  },
};
`;

/** What the installer leaves: the site's settings with its secret key. */
function installed(dir: string) {
  fs.mkdirSync(path.join(dir, 'mautic', 'config'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'mautic', 'config', 'local.php'), "<?php\n$parameters = array(\n  'db_driver' => 'pdo_mysql',\n  'secret_key' => 'abc',\n);\n");
}

/**
 * A project folder with the testing stack scaffolded, and the tooling folder the installer would have filled.
 * A site of this plugin has the builder's .ddev/config.mautic.yaml and an installed site (mautic/config/local.php
 * with its secret key, and the release's own app/release_metadata.json).
 */
function project(kind: 'mautic' | 'drupal') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mautic-plugin-'));
  const dir = path.join(root, 'dev', 'site1');
  fs.mkdirSync(path.join(dir, '.ddev'), { recursive: true });
  if (kind === 'mautic') {
    fs.writeFileSync(path.join(dir, '.ddev', 'config.mautic.yaml'), 'web_environment:\n  - MAUTIC_VERSION=7.2.2\n');
    installed(dir);
    fs.mkdirSync(path.join(dir, 'mautic', 'app'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'mautic', 'app', 'release_metadata.json'), '{\n    "version": "7.2.2",\n    "stability": "stable"\n}\n');
  }
  fs.writeFileSync(path.join(dir, 'cucumber.js'), SCAFFOLD);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'site1', devDependencies: { 'webship-js': '^2.0.16' } }, null, 2));
  const scripts = path.join(root, 'core', 'scripts');
  fs.mkdirSync(path.join(scripts, 'plugins', 'mautic'), { recursive: true });
  fs.copyFileSync(path.join(PKG, 'testing', 'site.feature'), path.join(scripts, 'plugins', 'mautic', 'site.feature'));
  fs.copyFileSync(path.join(PKG, 'scripts', 'mautic-site.php'), path.join(scripts, 'plugins', 'mautic', 'mautic-site.php'));
  return { root, dir, scripts };
}

/**
 * Run bash with the plugin's functions sourced and `ddev` replaced by a recorder of its calls (and of what it reads on
 * stdin: its first 2000 characters); asked whether the project runs, the recorder says it does.
 */
function bash(script: string, env: Record<string, string> = {}) {
  const fake = 'ddev() { echo "ddev $*" >> "${DDEV_LOG:-/dev/null}" ; case "$*" in "describe -j"*) echo \'{"raw":{"status":"running"}}\' ;; esac ; if [ ! -t 0 ] ; then head -c 2000 | tr "\\n" " " | sed "s/^/  stdin: /" >> "${DDEV_LOG:-/dev/null}" ; echo >> "${DDEV_LOG:-/dev/null}" ; fi ; return 0 ; }';
  return spawnSync('bash', ['-c', `${fake}\nsource ${FUNCTIONS}\n${script}`], { encoding: 'utf8', env: { ...process.env, ...env } });
}

/**
 * The payload a recorded call of mautic-site.php carried: the base64 of its JSON object (the accounts and the
 * settings), in a first line before the script on its standard input, never on its command line.
 */
function payloadOf(log: string, call: string) {
  assert.doesNotMatch(call, /SITE_PAYLOAD|password|dD\./i, 'no account on the command line');
  const lines = log.split('\n');
  const stdin = lines[lines.indexOf(call) + 1] || '';
  const m = stdin.match(/^  stdin: <\?php \$SITE_PAYLOAD = "([A-Za-z0-9+\/=]+)"; \?><\?php /);
  assert.ok(m, `the payload comes first on stdin, then the script: ${stdin.slice(0, 120)}`);
  return JSON.parse(Buffer.from(m![1], 'base64').toString('utf8'));
}

const ENV = (p: { root: string; scripts: string }, log: string) => ({ WORKSPACE_ROOT: p.root, WORKSPACE_SCRIPTS: p.scripts, doc_name: 'dev', PROJECT_NAME: 'site1', DDEV_LOG: log, account_name: 'owner1', account_mail: 'owner1@example.com', account_pass: 'Owner-pass-1' });

test('the default accounts are an administrator, a marketer and a sales account, each with the role of its name and an example address', () => {
  const r = bash('set_mautic_users ; for u in "${users[@]}" ; do n="user_${u}_name" ; m="user_${u}_mail" ; p="user_${u}_password" ; g="user_${u}_role" ; echo "${!n}|${!m}|${!p}|${!g}" ; done');
  assert.strictEqual(r.status, 0, r.stderr);
  const rows = r.stdout.trim().split('\n').map((l) => l.split('|'));
  assert.deepStrictEqual(rows.map((x) => x[0]), ['administrator', 'marketer', 'sales']);
  assert.deepStrictEqual(rows.map((x) => x[3]), ['administrator', 'marketer', 'sales']);
  for (const [name, mail, password] of rows) {
    assert.strictEqual(mail, `${name}@example.com`);
    assert.ok(password.length >= 10, 'long enough for the password rules of the site');
  }
});

test('the accounts are written by the site script with the site\'s PHP, in the site\'s folder, never in a file or on a command line', () => {
  const p = project('mautic');
  const log = path.join(p.root, 'ddev.log');
  const r = bash('set_mautic_users ; add_mautic_users', ENV(p, log));
  assert.strictEqual(r.status, 0, r.stderr + r.stdout);
  const written = fs.readFileSync(log, 'utf8');
  const call = written.split('\n').find((l) => l.startsWith('ddev exec -d /var/www/html/mautic')) as string;
  assert.strictEqual(call, 'ddev exec -d /var/www/html/mautic php -- accounts');
  const payload = payloadOf(written, call);
  assert.deepStrictEqual(payload.accounts.map((a: any) => [a.name, a.email, a.role, a.firstname, a.lastname]), [
    ['administrator', 'administrator@example.com', 'administrator', 'Administrator', 'Test'],
    ['marketer', 'marketer@example.com', 'marketer', 'Marketer', 'Test'],
    ['sales', 'sales@example.com', 'sales', 'Sales', 'Test'],
  ]);
  assert.deepStrictEqual(payload.settings, { mailer_dsn: 'smtp://localhost:1025', site_url: 'https://site1.ddev.site', cookie_secure: true }, 'the settings of a site on DDEV');
  assert.deepStrictEqual(fs.readdirSync(p.dir).filter((f) => !['.ddev', 'mautic', 'cucumber.js', 'package.json'].includes(f)), [], 'no file with a password is left in the project');
});

test('the accounts go only to an installed site', () => {
  const p = project('mautic');
  fs.rmSync(path.join(p.dir, 'mautic', 'config'), { recursive: true });
  const log = path.join(p.root, 'ddev.log');
  const r = bash('set_mautic_users ; add_mautic_users', ENV(p, log));
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /dev\/site1 is not installed: build it with --install first\./);
  assert.ok(!fs.existsSync(log), 'the container tool was never called');
});

test('the workspace account is never one of the default accounts: a list that names it leaves it out', () => {
  const p = project('mautic');
  const log = path.join(p.root, 'ddev.log');
  const r = bash('set_mautic_users ; cancel_mautic_users', { ...ENV(p, log), account_name: 'administrator' });
  assert.strictEqual(r.status, 0, r.stderr + r.stdout);
  const written = fs.readFileSync(log, 'utf8');
  const call = written.split('\n').find((l) => l.endsWith('php -- cancel')) as string;
  assert.ok(call, 'the cancel verb is called');
  assert.deepStrictEqual(payloadOf(written, call).accounts.map((a: any) => a.name), ['marketer', 'sales']);
});

test('cancelling the accounts deletes the default ones through the site script', () => {
  const p = project('mautic');
  const log = path.join(p.root, 'ddev.log');
  const r = bash('set_mautic_users ; cancel_mautic_users', ENV(p, log));
  assert.strictEqual(r.status, 0, r.stderr + r.stdout);
  const written = fs.readFileSync(log, 'utf8');
  const call = written.split('\n').find((l) => l.endsWith('php -- cancel')) as string;
  assert.deepStrictEqual(payloadOf(written, call).accounts.map((a: any) => a.name), ['administrator', 'marketer', 'sales']);
});

test('the payload of the workspace account carries it alone, as the administrator', () => {
  const r = bash('mautic_payload owner', { PROJECT_NAME: 'site1', account_name: 'owner1', account_mail: 'owner1@example.com', account_pass: 'Owner-pass-1' });
  assert.strictEqual(r.status, 0, r.stderr);
  const payload = JSON.parse(Buffer.from(r.stdout.trim(), 'base64').toString('utf8'));
  assert.deepStrictEqual(payload.accounts, [{ name: 'owner1', email: 'owner1@example.com', password: 'Owner-pass-1', role: 'administrator', firstname: 'Workspace', lastname: 'Owner' }]);
});

test('the builder refuses what it cannot build before it changes anything', () => {
  const p = project('drupal');
  const log = path.join(p.root, 'ddev.log');
  const run = (vars: string) => bash(`trim_project_name() { :; } ; drop_database() { echo DROPPED ; } ; ${vars} ; mautic_build`, ENV(p, log));
  const cases: [string, RegExp][] = [
    ['PROJECT_NAME=site2 ; MAUTIC_VERSION=4.0.0 ; INSTALL=yes', /--mautic-version takes a release number \(7\.2\.2\), not 4\.0\.0/],
    ['PROJECT_NAME=site2 ; MAUTIC_VERSION=latest ; INSTALL=yes', /--mautic-version takes a release number/],
    ['PROJECT_NAME=site2 ; PHP_VERSION=8.1 ; INSTALL=yes', /--php-version takes 8\.2 to 8\.4/],
    ['PROJECT_NAME=site2 ; ADD_USERS=yes', /--add-users needs --install/],
    ['PROJECT_NAME=site2 ; INSTALL=yes ; SAMPLE_CONTENT=yes', /--sample-content needs --install and --add-users/],
    ['PROJECT_NAME=Site_2 ; INSTALL=yes', /must be small letters, digits and dashes/],
    ['PROJECT_NAME=site2 ; INSTALL=yes ; account_pass=short', /The workspace account's password is not set/],
  ];
  for (const [vars, message] of cases) {
    const r = run(vars);
    assert.strictEqual(r.status, 1, `${vars}: ${r.stdout}`);
    assert.match(r.stdout, message);
    assert.doesNotMatch(r.stdout, /DROPPED/, `${vars}: nothing was removed`);
  }
  assert.ok(!fs.existsSync(log), 'the container tool was never called');
});

test('the builder writes the claim of the plugin: the release, and the scheduled tasks as a daemon of the web container', () => {
  const p = project('drupal');
  const r = bash(`mautic_write_claim ${p.dir} 7.2.2`);
  assert.strictEqual(r.status, 0, r.stderr);
  const config = fs.readFileSync(path.join(p.dir, '.ddev', 'config.mautic.yaml'), 'utf8');
  assert.match(config, /^web_environment:\n  - MAUTIC_VERSION=7\.2\.2$/m);
  assert.match(config, /^web_extra_daemons:\n  - name: scheduled-tasks\n    command: "bash -c 'while true; do php bin\/console mautic:segments:update --no-interaction --quiet; php bin\/console mautic:campaigns:update --no-interaction --quiet; php bin\/console mautic:campaigns:trigger --no-interaction --quiet; sleep 15; done > \/dev\/null 2>&1'"\n    directory: \/var\/www\/html\/mautic$/m);
  assert.doesNotMatch(config, /\$/, 'nothing the container tool would read as a variable of its own');
  assert.strictEqual(bash(`mautic_is_project ${p.dir} && echo yes`).stdout.trim(), 'yes', 'the project is now one of the plugin\'s');
});

test('a site is installed once its installer wrote its settings, and its release is read from its own code', () => {
  const p = project('mautic');
  assert.strictEqual(bash(`mautic_is_installed ${p.dir} && echo yes || echo no`).stdout.trim(), 'yes');
  fs.writeFileSync(path.join(p.dir, 'mautic', 'config', 'local.php'), "<?php\n$parameters = array();\n");
  assert.strictEqual(bash(`mautic_is_installed ${p.dir} && echo yes || echo no`).stdout.trim(), 'no', 'settings without a secret key: the installer did not finish');
  const r = bash('mautic_version', { WORKSPACE_ROOT: p.root, doc_name: 'dev', PROJECT_NAME: 'site1' });
  assert.strictEqual(r.stdout.trim(), '7.2.2', 'the release is read from the site\'s own code');
});

test('the console is the site\'s own, each argument quoted for the container\'s shell, with its standard input closed', () => {
  const p = project('mautic');
  const log = path.join(p.root, 'ddev.log');
  const r = bash(`cd ${p.dir} && mautic_console mautic:segments:update --list-id=2 "a b"`, ENV(p, log));
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(fs.readFileSync(log, 'utf8'), /^ddev exec -d \/var\/www\/html\/mautic php bin\/console --no-ansi --no-interaction mautic:segments:update --list-id=2 a\\ b$/m);
});

test('the testing hook adds the step pack, the users registry, the mail catcher, the managing account, the tags and a first feature, once', () => {
  const p = project('mautic');
  const log = path.join(p.root, 'ddev.log');
  const run = () => bash(`cd ${p.dir} && testing_configure_mautic ${p.dir}`, ENV(p, log));
  const r = run();
  assert.strictEqual(r.status, 0, r.stderr + r.stdout);
  const pkg = JSON.parse(fs.readFileSync(path.join(p.dir, 'package.json'), 'utf8'));
  assert.strictEqual(pkg.devDependencies['@webship-js/mautic-steps'], '^2.0.0');
  assert.strictEqual(pkg.devDependencies['webship-js'], '^2.0.16', 'what was there stays');
  const cucumber = fs.readFileSync(path.join(p.dir, 'cucumber.js'), 'utf8');
  const lines = cucumber.split('\n');
  const core = lines.findIndex((l) => l.includes('node_modules/webship-js/tests/step-definitions'));
  assert.strictEqual(lines[core + 1], "      'node_modules/@webship-js/mautic-steps/tests/step-definitions/**/*.js',", 'the pack is listed right after webship-js');
  assert.match(cucumber, /administrator: \{ username: process\.env\.MAUTIC_ADMINISTRATOR_USERNAME \|\| 'administrator', email: 'administrator@example\.com', password: process\.env\.MAUTIC_ADMINISTRATOR_PASSWORD \|\| '[^']+' \},/);
  assert.match(cucumber, /sales: \{ username: process\.env\.MAUTIC_SALES_USERNAME \|\| 'sales'/);
  assert.match(cucumber, /manager: process\.env\.MANAGER \|\| 'administrator',/);
  assert.match(cucumber, /mailUrl: process\.env\.MAIL_URL \|\| \(process\.env\.IS_DDEV_PROJECT \? 'http:\/\/127\.0\.0\.1:8025' : `\$\{\(process\.env\.LAUNCH_URL \|\| 'https:\/\/site1\.ddev\.site'\)\.replace\(\/\\\/\+\$\/, ''\)\}:8026`\),/);
  assert.match(cucumber, /tags: process\.env\.CUCUMBER_TAGS \|\| 'not @wip and not @must-fail',/);
  assert.match(cucumber, /launchUrl: process\.env\.LAUNCH_URL \|\| 'https:\/\/site1\.ddev\.site'/, 'the site\'s address, from the name of its folder, in place of the scaffold\'s');
  assert.doesNotMatch(cucumber, /owner1|Owner-pass-1/, 'the workspace account is no test user');
  // Still a module node can load, with the registry where webship-js reads it.
  const loaded = spawnSync(process.execPath, ['-e', `const c = require(${JSON.stringify(path.join(p.dir, 'cucumber.js'))}).default; console.log(JSON.stringify([c.require, Object.keys(c.worldParameters.users), c.tags, c.worldParameters.users.marketer.username, c.worldParameters.javascript.mode, c.worldParameters.javascript.ignore, c.worldParameters.manager, c.worldParameters.mailUrl]))`], { encoding: 'utf8', env: { ...process.env, IS_DDEV_PROJECT: '', LAUNCH_URL: '' } });
  assert.strictEqual(loaded.status, 0, loaded.stderr);
  const [requires, handles, tags, username, mode, ignore, manager, mailUrl] = JSON.parse(loaded.stdout);
  assert.strictEqual(requires.length, 3);
  assert.deepStrictEqual(handles, ['administrator', 'marketer', 'sales']);
  assert.match(tags, /not @must-fail/);
  assert.strictEqual(username, 'marketer');
  assert.strictEqual(mode, 'warn');
  assert.ok(new RegExp(ignore).test('Failed to load resource: the server responded with a status of 400 ()'), 'the avatar proxy\'s answer is ignored');
  assert.ok(!new RegExp(ignore).test('Failed to load resource: the server responded with a status of 500 ()'), 'an error of the site is not');
  assert.strictEqual(manager, 'administrator');
  assert.strictEqual(mailUrl, 'https://site1.ddev.site:8026');
  assert.ok(fs.existsSync(path.join(p.dir, 'tests', 'features', 'site.feature')));
  assert.match(fs.readFileSync(log, 'utf8'), /php -- accounts$/m, 'the site gets the default accounts');
  // Again, after a person changed the feature: nothing is doubled, nothing is reset.
  fs.writeFileSync(path.join(p.dir, 'tests', 'features', 'site.feature'), 'Feature: mine\n');
  assert.strictEqual(run().status, 0);
  assert.strictEqual(fs.readFileSync(path.join(p.dir, 'cucumber.js'), 'utf8'), cucumber);
  assert.strictEqual(fs.readFileSync(path.join(p.dir, 'tests', 'features', 'site.feature'), 'utf8'), 'Feature: mine\n');
});

test('the first feature of the plugin and the features of the step pack never share a name', () => {
  // The testing setup places tests/features/site.feature; the pack's own features are copied beside it.
  const placed = 'site.feature';
  assert.match(fs.readFileSync(FUNCTIONS, 'utf8'), /tests\/features\/site\.feature/);
  for (const f of fs.readdirSync(path.join(PKG, 'ai', 'skills', 'mautic-scenarios', 'examples'))) assert.notStrictEqual(f, placed, `the example ${f} would replace the first feature`);
});

test('the testing hook leaves a project of another platform alone', () => {
  const p = project('drupal');
  const r = bash(`cd ${p.dir} && testing_configure_mautic ${p.dir}`, { WORKSPACE_ROOT: p.root, WORKSPACE_SCRIPTS: p.scripts, doc_name: 'dev', PROJECT_NAME: 'site1' });
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
  assert.strictEqual(fs.readFileSync(path.join(p.dir, 'cucumber.js'), 'utf8'), SCAFFOLD);
  assert.ok(!fs.existsSync(path.join(p.dir, 'tests')));
});

test('the command-line tool refuses a project that is not a site of the plugin', () => {
  const p = project('drupal');
  const r = bash('PROJECT_NAME=site1 ; RUN="cache:clear" ; trim_project_name() { :; } ; mautic_cli_tool', { WORKSPACE_ROOT: p.root, doc_name: 'dev' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /dev\/site1 is not a Mautic site of this plugin/);
});

test('the command-line tool runs the site\'s console in the web container, its scheduled tasks in order, and tidies and adds the sample content through the site script', () => {
  const p = project('mautic');
  const log = path.join(p.root, 'ddev.log');
  const tool = (vars: string) => {
    if (fs.existsSync(log)) fs.rmSync(log);
    const r = bash(`RUN=_none_ ; ADD_USERS=no ; CANCEL_USERS=no ; SAMPLE_CONTENT=no ; TIDY=no ; SCHEDULED_TASKS=no ; EVERY=0 ; ${vars} ; trim_project_name() { :; } ; mautic_cli_tool`, ENV(p, log));
    assert.strictEqual(r.status, 0, r.stderr + r.stdout);
    return { out: r.stdout, calls: fs.readFileSync(log, 'utf8').split('\n').filter((l) => l.startsWith('ddev ') && !l.startsWith('ddev describe')) };
  };
  assert.deepStrictEqual(tool('RUN="mautic:segments:update --batch-limit=50"').calls, ['ddev exec -d /var/www/html/mautic php bin/console --no-ansi mautic:segments:update --batch-limit=50']);
  const tasks = tool('SCHEDULED_TASKS=yes');
  assert.deepStrictEqual(tasks.calls, ['mautic:segments:update', 'mautic:campaigns:update', 'mautic:campaigns:trigger'].map((t) => `ddev exec -d /var/www/html/mautic php bin/console --no-ansi --no-interaction ${t}`));
  assert.match(tasks.out, /Running the scheduled tasks once/);
  assert.deepStrictEqual(tool('TIDY=yes').calls, ['ddev exec -d /var/www/html/mautic php -- tidy', 'ddev exec -d /var/www/html/mautic php bin/console --no-ansi --no-interaction cache:pool:clear cache.rate_limiter'], 'the test content, then the record of failed logins');
  const sample = tool('SAMPLE_CONTENT=yes').calls;
  assert.strictEqual(sample[0], 'ddev exec -d /var/www/html/mautic php -- accounts content', 'the accounts first: they own the sample contacts');
  assert.strictEqual(sample.length, 4, 'then the scheduled tasks, so the segments fill');
});

test('the first feature names no platform in a step, and no password', () => {
  const feature = fs.readFileSync(path.join(PKG, 'testing', 'site.feature'), 'utf8');
  const steps = feature.split('\n').filter((l) => /^\s*(Given|When|Then|And|But) /.test(l));
  assert.ok(steps.length >= 10);
  for (const s of steps) assert.doesNotMatch(s, /mautic/i, s);
  assert.doesNotMatch(feature, /dD\.123123ddd"/);
  assert.doesNotMatch(feature, /user:add|users\/new/i, 'a suite never creates an account');
});

// ---- The runtimes: DDEV as before, and Docker Compose, Podman, Kubernetes, Lando and Docksal through the core's layer ----

const ADDRESS: Record<string, [string, string]> = {
  docker: ['http://127.0.0.1:41234', 'http://127.0.0.1:41235'],
  podman: ['http://127.0.0.1:41234', 'http://127.0.0.1:41235'],
  kubernetes: ['http://172.18.0.2:30080', 'http://172.18.0.2:30081'],
  lando: ['http://127.0.0.1:41234', 'http://127.0.0.1:41235'],
  docksal: ['http://site1.docksal.site', 'http://mail-site1.docksal.site'],
};
const ROOT: Record<string, string> = { docker: '/var/www/html', podman: '/var/www/html', kubernetes: '/var/www/html', lando: '/app', docksal: '/var/www' };

/**
 * Run the builder in a throwaway workspace with `ddev` replaced by a recorder of its calls and of what it reads on
 * stdin, and the core's layer by stand-ins: `layer` is the runtime it answers with (runtime_of, rt_url, rt_mail_url,
 * rt_claim, rt_is_platform), or '' for a core that has no layer yet. The installer's run leaves an installed site.
 */
function build(layer: string, env: Record<string, string> = {}, opts: { daemon?: boolean } = {}) {
  const p = project('drupal');
  fs.rmSync(p.dir, { recursive: true });
  const log = path.join(p.root, 'ddev.log');
  const [address, mail] = ADDRESS[layer] || ['', ''];
  const where = ROOT[layer] || '/var/www/html';
  const fake = `ddev() { echo "ddev $*" >> "${log}" ; case "$*" in "describe -j"*) echo '{"raw":{"status":"running"}}' ;; "exec pwd") echo "${where}" ;; *"unzip -q"*) mkdir -p mautic/app && echo '{"version": "7.2.2"}' > mautic/app/release_metadata.json ;; *"mautic:install"*) mkdir -p mautic/config && echo "<?php \\$parameters = array('secret_key' => 'abc');" > mautic/config/local.php ;; esac ; if [ ! -t 0 ] ; then head -c 2000 | tr "\\n" " " | sed "s/^/  stdin: /" >> "${log}" ; echo >> "${log}" ; fi ; return 0 ; }`;
  const prelude = [
    fake,
    'trim_project_name() { :; } ; drop_database() { :; } ; ddev_nodejs_version() { echo 24 ; } ; ddev_up() { ddev "$@" ; }',
    layer ? [
      `runtime_of() { echo "\${RUNTIME_ANSWER}" ; }`,
      `rt_url() { [ "\${RUNTIME_ANSWER}" == ddev ] && echo "https://\${PROJECT_NAME}.ddev.site" || echo "${address}" ; }`,
      `rt_mail_url() { echo "${mail}" ; }`,
      `rt_claim() { echo "rt_claim $* in $(basename "$PWD")" >> "${log}" ; printf 'name: site1\\nx-webship:\\n  platform: %s\\n  runtime: %s\\n' "$1" "\${RUNTIME_ANSWER}" > compose.yaml ; }`,
      'rt_is_platform() { [ -f "$1/.ddev/config.$2.yaml" ] || grep -q "^  platform: $2$" "$1/compose.yaml" 2>/dev/null ; }',
      'rt_meta() { sed -n "s/^  $1: *//p" "${2:-.}/compose.yaml" 2>/dev/null | head -1 ; }',
      opts.daemon === false ? '' : `rt_daemon() { echo "rt_daemon $1 :: $2" >> "${log}" ; case "\${RUNTIME_ANSWER}" in lando|docksal) echo "(\${RUNTIME_ANSWER}: a task beside the web server is not on \${RUNTIME_ANSWER} yet)" ;; *) printf '  daemons: %s\\n' "$1" >> compose.yaml ;; esac ; }`,
    ].join('\n') : '',
    `source ${FUNCTIONS}`,
    'mautic_build',
  ].join('\n');
  const r = spawnSync('bash', ['-c', prelude], { encoding: 'utf8', env: { ...process.env, ...ENV(p, log), INSTALL: 'yes', ADD_USERS: 'no', SAMPLE_CONTENT: 'no',
    LAUNCH: 'no', RUNTIME: '_none_', RUNTIME_ANSWER: layer || 'ddev', ...env } });
  const raw = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
  const calls = raw.trim().split('\n').filter((c) => c !== '');
  return { r, raw, calls, dir: p.dir, root: p.root };
}

/** The payload the settings verb of the site script was given: what the site is told of its runtime. */
const settingsOf = (b: { raw: string; calls: string[] }) => {
  const call = b.calls.find((c) => / php -- settings$/.test(c)) as string;
  assert.ok(call, 'the settings verb is called');
  return payloadOf(b.raw, call);
};

test('on DDEV the build is what it was: the same commands with the runtime layer and without it, its own claim file, https on the router', () => {
  const without = build('');
  const withLayer = build('ddev');
  for (const b of [without, withLayer]) {
    assert.strictEqual(b.r.status, 0, b.r.stderr + b.r.stdout);
    assert.ok(fs.existsSync(path.join(b.dir, '.ddev', 'config.mautic.yaml')), 'the claim of the plugin on DDEV');
    assert.ok(!b.calls.some((c) => c.startsWith('rt_claim') || c.startsWith('rt_daemon')), 'the layer\'s claim and task are not asked for on DDEV: the claim file carries the daemon');
    const payload = settingsOf(b);
    assert.deepStrictEqual(payload.settings, { mailer_dsn: 'smtp://localhost:1025', site_url: 'https://site1.ddev.site', cookie_secure: true });
    assert.deepStrictEqual(payload.accounts.map((a: any) => [a.name, a.role]), [['owner1', 'administrator']], 'the workspace account, the administrator');
    assert.match(b.calls.find((c) => c.includes('mautic:install')) as string, /^ddev exec -d \/var\/www\/html\/mautic php bin\/console mautic:install https:\/\/site1\.ddev\.site --force --no-interaction/);
    assert.match(b.r.stdout, /The site: https:\/\/site1\.ddev\.site\/s\/login · its mail: https:\/\/site1\.ddev\.site:8026 · its administrator: owner1/);
    assert.match(b.r.stdout, /dev site1 has been installed: Mautic 7\.2\.2\./);
    assert.doesNotMatch(b.r.stdout, /scheduled tasks .* run when you ask/, 'on DDEV a daemon runs them');
  }
  assert.deepStrictEqual(withLayer.calls, without.calls);
  assert.strictEqual(without.calls[0], 'ddev config --project-type=php --docroot=mautic --webserver-type=apache-fpm --php-version=8.3 --database=mariadb:10.11 --project-name=site1 --nodejs-version=24');
  assert.ok(!without.raw.includes('Owner-pass-1') || /SITE_PAYLOAD/.test(without.raw), 'the password travels only in the payload');
  for (const c of without.calls.filter((x) => x.startsWith('ddev '))) assert.doesNotMatch(c, /Owner-pass-1/, `no password on a command line: ${c.slice(0, 80)}`);
});

test('on Docker Compose, Podman, Kubernetes, Lando and Docksal the plugin claims the site, and the site is told the address of the runtime and its mail catcher', () => {
  const ddev = build('ddev').calls;
  for (const runtime of Object.keys(ADDRESS)) {
    const [address, mail] = ADDRESS[runtime];
    const b = build(runtime, { RUNTIME: runtime });
    assert.strictEqual(b.r.status, 0, b.r.stderr + b.r.stdout);
    assert.deepStrictEqual(b.calls.slice(0, 2), [ddev[0], 'rt_claim mautic in site1'], `${runtime}: the claim right after ddev config, in the project`);
    assert.ok(!fs.existsSync(path.join(b.dir, '.ddev')), `${runtime}: no .ddev folder on another runtime`);
    const payload = settingsOf(b);
    assert.deepStrictEqual(payload.settings, { mailer_dsn: runtime === 'lando' ? 'smtp://mailpit:1025' : 'smtp://mail:1025', site_url: address, cookie_secure: false }, runtime);
    // Where the site is in the container is asked of the runtime: the release is unpacked and installed there.
    assert.ok(b.calls.some((c) => c.startsWith('ddev exec set -e; cd /tmp') && c.includes(`-d '${ROOT[runtime]}/mautic'`)), `${runtime}: unpacked in ${ROOT[runtime]}/mautic`);
    assert.ok(b.calls.some((c) => c.startsWith(`ddev exec -d ${ROOT[runtime]}/mautic php bin/console mautic:install ${address} `)), `${runtime}: installed at its address`);
    assert.match(b.r.stdout, new RegExp(`The site: ${address.replace(/[.]/g, '\\.')}/s/login · its mail: ${mail.replace(/[.]/g, '\\.')} · its administrator: owner1`));
    // The scheduled tasks: a task beside the web server where the runtime keeps one (rt_daemon), else the tool.
    assert.strictEqual(b.calls[2], `rt_daemon scheduled-tasks :: cd mautic && while true; do php bin/console mautic:segments:update --no-interaction --quiet; php bin/console mautic:campaigns:update --no-interaction --quiet; php bin/console mautic:campaigns:trigger --no-interaction --quiet; sleep 15; done > /dev/null 2>&1`, `${runtime}: the task, right after the claim`);
    if (['lando', 'docksal'].includes(runtime)) {
      assert.match(b.r.stdout, /Its scheduled tasks \(segments, campaigns\) run when you ask: bash cmd-tools-mautic-cli\.sh site1 --scheduled-tasks/, `${runtime} keeps no task running yet`);
    } else {
      assert.match(b.r.stdout, /Its scheduled tasks \(segments, campaigns\) run every 15 seconds beside the web server\./, runtime);
    }
    assert.doesNotMatch(b.r.stdout, /ddev\.site/);
  }
  // A core whose layer has no rt_daemon yet: the tool runs the tasks when asked.
  const older = build('docker', { RUNTIME: 'docker' }, { daemon: false });
  assert.strictEqual(older.r.status, 0, older.r.stderr + older.r.stdout);
  assert.ok(!older.calls.some((c) => c.startsWith('rt_daemon')));
  assert.match(older.r.stdout, /run when you ask: bash cmd-tools-mautic-cli\.sh site1 --scheduled-tasks/);
});

test('--runtime on a workspace without the runtime layer is refused, never built on DDEV in silence', () => {
  const b = build('', { RUNTIME: 'docker' });
  assert.strictEqual(b.r.status, 1);
  assert.match(b.r.stdout, /--runtime docker needs a Webship Workspace with the container runtimes/);
  assert.deepStrictEqual(b.calls, [], 'nothing was configured or started');
  assert.ok(!fs.existsSync(b.dir), 'no folder was made');
  assert.strictEqual(build('', { RUNTIME: 'ddev' }).r.status, 0, 'asking for DDEV by name is fine there');
});

test('the builder takes --runtime, with the runtimes of the core\'s own builders', () => {
  const args = fs.readFileSync(path.join(PKG, 'scripts', 'args', 'arg-mautic.sh'), 'utf8');
  assert.match(args, /parser\.add_argument\('--runtime',\s+dest='RUNTIME',\s+default="_none_",\s+choices=\['ddev', 'docker', 'podman', 'kubernetes', 'lando', 'docksal'\],/);
});

test('a site is known on every runtime: the core\'s layer is asked for the claim when it is there', () => {
  const asked = bash('rt_is_platform() { echo "asked $1 $2" ; [ "$1" == /a/site ] ; } ; mautic_is_project /a/site ; echo "rc=$?" ; mautic_is_project /a/other ; echo "rc=$?"');
  assert.strictEqual(asked.stdout, 'asked /a/site mautic\nrc=0\nasked /a/other mautic\nrc=1\n');
  assert.strictEqual(bash(`mautic_is_project ${project('mautic').dir}`).status, 0, 'without it: the claim file, as before');
  assert.strictEqual(bash(`mautic_is_project ${project('drupal').dir}`).status, 1);
});

test('on another runtime the testing hook writes no address: the tests container hands the suite LAUNCH_URL and MAIL_URL', () => {
  const p = project('mautic');
  fs.rmSync(path.join(p.dir, '.ddev'), { recursive: true });
  fs.writeFileSync(path.join(p.dir, 'compose.yaml'), 'name: site1\nx-webship:\n  platform: mautic\n  runtime: docker\n  port: 41234\n');
  const layer = 'runtime_of() { echo docker ; } ; rt_is_platform() { grep -q "^  platform: $2$" "$1/compose.yaml" ; } ; rt_url() { echo http://127.0.0.1:41234 ; } ; ';
  const r = bash(`${layer} cd ${p.dir} && testing_configure_mautic ${p.dir}`, ENV(p, path.join(p.root, 'ddev.log')));
  assert.strictEqual(r.status, 0, r.stderr + r.stdout);
  const cucumber = fs.readFileSync(path.join(p.dir, 'cucumber.js'), 'utf8');
  assert.match(cucumber, /^ {6}mailUrl: process\.env\.MAIL_URL \|\| '',$/m);
  assert.match(cucumber, /launchUrl: process\.env\.LAUNCH_URL \|\| 'http:\/\/localhost:8080'/, 'the scaffold\'s placeholder stays');
  assert.doesNotMatch(cucumber, /ddev\.site|8026/);
  assert.match(cucumber, /manager: process\.env\.MANAGER \|\| 'administrator'/, 'the rest is as on DDEV');
});

test('the tool says the address of the runtime, and the mailbox only where it has one', () => {
  const p = project('mautic');
  const env = ENV(p, path.join(p.root, 'ddev.log'));
  const say = (layer: string) => bash(`${layer} RUN=_none_ ; ADD_USERS=no ; CANCEL_USERS=no ; SAMPLE_CONTENT=no ; TIDY=no ; SCHEDULED_TASKS=no ; trim_project_name() { :; } ; mautic_cli_tool`, env).stdout;
  assert.match(say(''), /^dev\/site1: Mautic 7\.2\.2\n {2}the site: https:\/\/site1\.ddev\.site\/s\/login\n {2}its mail: https:\/\/site1\.ddev\.site:8026\n {2}its administrator: owner1\n {2}its scheduled tasks: every 15 seconds, beside the web server$/m);
  const layer = 'runtime_of() { echo docker ; } ; rt_is_platform() { [ -f "$1/.ddev/config.$2.yaml" ] ; } ; rt_url() { echo http://127.0.0.1:41234 ; } ;';
  const docker = say(`${layer} rt_mail_url() { echo http://127.0.0.1:41235 ; } ;`);
  assert.match(docker, /^ {2}the site: http:\/\/127\.0\.0\.1:41234\/s\/login\n {2}its mail: http:\/\/127\.0\.0\.1:41235$/m);
  const older = say(layer);
  assert.match(older, /^ {2}the site: http:\/\/127\.0\.0\.1:41234\/s\/login$/m);
  assert.doesNotMatch(older, /its mail/, 'a core whose layer gives the mailbox no address: none is said');
  assert.match(older, /^ {2}its scheduled tasks: when asked \(--scheduled-tasks, or --scheduled-tasks --every 15\)$/m, 'a core without rt_meta: no task kept running');
});

test('the feature of the runtimes drives a site the plugin claims, and names no platform in a step', () => {
  const feature = fs.readFileSync(path.join(PKG, 'features', 'mautic-runtimes.feature'), 'utf8');
  const scenarios = feature.split(/\n(?=  @needs-runtime-)/).slice(1);
  assert.strictEqual(scenarios.length, 6);
  for (const s of scenarios) assert.match(s, /^  @needs-runtime-(docker|kubernetes) @needs-platform-mautic\n  Scenario: /);
  const steps = feature.split('\n').filter((l) => /^\s*(Given|When|Then|And|But) /.test(l));
  for (const s of steps) assert.doesNotMatch(s, /mautic/i, s);
  assert.doesNotMatch(feature, /ddev\.site|127\.0\.0\.1/);
  const manifest = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8')).workspacePlugin;
  assert.ok(manifest.features.includes('features/mautic-runtimes.feature'));
  assert.match(manifest.featuresSite, /^cmd-mautic-project\.sh ci-mautic( [A-Za-z0-9._=-]+)* --runtime docker$/);
});
