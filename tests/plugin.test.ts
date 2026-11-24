import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

import { register, assistantContext, PLATFORM, COMMANDS, AGENTS } from '../src/index';

// Compiled, these tests run from dist/tests, so the package root is one folder further up.
const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');
const read = (f: string) => fs.readFileSync(path.join(PKG, f), 'utf8');
const manifest = JSON.parse(read('package.json')).workspacePlugin;

test('the manifest names the platform, and every file it names ships', () => {
  assert.strictEqual(manifest.name, PLATFORM);
  const named = [...manifest.commands.files, ...manifest.scripts.functions, ...manifest.scripts.args, ...manifest.scripts.machine,
    ...manifest.ai.agents, ...manifest.ai.skills, ...manifest.ai.commands, ...manifest.ai.prompts, ...manifest.features];
  for (const f of named) assert.ok(fs.existsSync(path.join(PKG, f)), `${f} is in the package`);
  assert.deepStrictEqual(manifest.commands.files.map((f: string) => path.basename(f)), COMMANDS);
  assert.deepStrictEqual(manifest.ai.agents.map((f: string) => path.basename(f, '.md')), AGENTS);
  assert.deepStrictEqual(manifest.commands.types, ['sites'], 'the commands go to sites folders only');
  const files: string[] = JSON.parse(read('package.json')).files;
  for (const f of named) assert.ok(files.includes(f.split('/')[0]), `${f} is published with the package`);
  // The machine files land side by side in core/scripts/plugins/mautic/: no two may share a name.
  const names = manifest.scripts.machine.map((f: string) => path.basename(f));
  assert.strictEqual(new Set(names).size, names.length, 'the machine files have names of their own');
  assert.match(manifest.featuresSite, /^cmd-mautic-project\.sh ci-mautic --install --add-users --runtime docker$/, 'CI builds one real site on Docker Compose');
});

test('every command finds the workspace by itself, names its folder, and sources its args from where the installer puts them', () => {
  for (const f of manifest.commands.files) {
    const src = read(f);
    assert.match(src, /^#!\/usr\/bin\/env bash/, `${f} is a bash script`);
    assert.match(src, /WORKSPACE_SCRIPTS="\$\{WORKSPACE_SCRIPTS:-\$\(cd "\$\(dirname "\$\{BASH_SOURCE\[0\]\}"\)\/\.\.\/core\/scripts" && pwd\)\}"/, `${f} locates the tooling from its own path`);
    assert.match(src, /workspace\.__WORKSPACE__\.settings\.yml/, `${f} loads the settings of the folder it is installed into`);
    assert.match(src, /source \$\{WORKSPACE_SCRIPTS\}\/plugins\/mautic\/args\/arg-[a-z-]+\.sh \|\| exit 1 ;/, `${f} reads its arguments from the plugin's args`);
    assert.match(src, /^distribution_name="mautic";$/m, `${f}: the user list of the core's tools is mautic`);
    const last = src.trim().split('\n').pop() as string;
    assert.match(read('scripts/functions/fun-mautic.sh'), new RegExp(`^function ${last.replace(/ ;$/, '')}\\(\\)`, 'm'), `${f} ends by calling a function the plugin defines`);
  }
  assert.match(read('commands/cmd-mautic-project.sh'), /^# workspace-name: Mautic \(marketing automation\)$/m, 'the builder carries the name the Build list shows');
  assert.doesNotMatch(read('commands/cmd-tools-mautic-cli.sh'), /^# workspace-name:/m, 'a tool is not a builder');
});

test('every shell script parses', () => {
  for (const f of [...manifest.commands.files, ...manifest.scripts.functions, ...manifest.scripts.args]) {
    const r = spawnSync('bash', ['-n', path.join(PKG, f)], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, `${f}: ${r.stderr}`);
  }
});

test('the site script is PHP the site can run, with every verb the functions call, and works with the site\'s own models', () => {
  const src = read('scripts/mautic-site.php');
  for (const verb of ['accounts', 'cancel', 'list', 'content', 'tidy', 'version']) assert.match(src, new RegExp(`case '${verb}':`), `mautic-site.php has the verb ${verb}`);
  assert.match(src, /in_array\('settings', \$verbs, true\)/, 'the settings are written before the kernel boots');
  assert.match(src, /^<\?php\n/, 'a PHP script, read on standard input after its payload');
  assert.match(src, /php_sapi_name\(\) !== 'cli'/, 'it runs on the command line only');
  assert.match(src, /new AppKernel\('prod', false\)/, 'it boots the site\'s own kernel');
  for (const model of ["getModel('user.user')", "getModel('user.role')", "getModel('lead.lead')", "getModel('lead.list')", "getModel('form.form')", "getModel('page.page')", "getModel('asset.asset')", "getModel('email')"]) {
    assert.ok(src.includes(model), `it uses the site's ${model}`);
  }
  assert.match(src, /setRolePermissions\(\$role, \$wanted\)/, 'the roles get their permissions as the role form sends them');
  assert.match(src, /'stats_update_url'\s+=> ''/, 'no statistics sent to an outside service');
  assert.doesNotMatch(src, /dD\.123123ddd/, 'no password in the script: the accounts come in its payload');
  const fns = read('scripts/functions/fun-mautic.sh');
  for (const m of fns.matchAll(/mautic_site (?:owner|accounts) ([a-z ]+?) ?[<;|]/g)) {
    for (const verb of m[1].trim().split(/\s+/)) assert.ok(verb === 'settings' || new RegExp(`case '${verb}':`).test(src), `the functions call the verb ${verb}, which the script has`);
  }
});

test('the claim file is the plugin\'s own name, and a real overlay of the container tool: the release, and the scheduled tasks as a daemon', () => {
  const src = read('scripts/functions/fun-mautic.sh');
  assert.match(src, /\.ddev\/config\.mautic\.yaml/, 'the file the core reads as the plugin\'s claim (#490): config.<plugin>.yaml');
  const yaml = (src.match(/config\.mautic\.yaml" <<YAMLEOF\n([\s\S]*?)\nYAMLEOF/) || [])[1] || '';
  assert.match(yaml, /^web_environment:\n  - MAUTIC_VERSION=\$\{version\}$/m, 'the release the project holds, in the environment of its web container');
  assert.match(yaml, /^web_extra_daemons:\n  - name: scheduled-tasks\n    command: "bash -c '\$\(mautic_tasks_loop\)'"$/m, 'the site\'s scheduled tasks, a daemon of the web container: the same loop as on the other runtimes');
  assert.match(src, /^readonly MAUTIC_TASKS='mautic:segments:update mautic:campaigns:update mautic:campaigns:trigger';$/m, 'the segments, then the campaigns');
  assert.doesNotMatch(yaml.replace(/\$\{(version|MAUTIC_DOCROOT)\}|\$\(mautic_tasks_loop\)/g, ''), /\$/, 'no shell variable lands in the overlay (the three above are filled in when it is written): the container tool would read it as its own');
  assert.match(src, /rt_daemon scheduled-tasks "cd \$\{MAUTIC_DOCROOT\} && \$\(mautic_tasks_loop\)"/, 'on another runtime the same loop, through the core\'s rt_daemon');
  assert.match(src, /^function set_mautic_users\(\) \{/m, 'the claim names a plugin with a user list: set_<plugin>_users');
});

test('the functions carry the names the core\'s tools look for, and build the site the official way', () => {
  const src = read('scripts/functions/fun-mautic.sh');
  for (const fn of ['set_mautic_users', 'add_mautic_users', 'cancel_mautic_users', 'testing_configure_mautic', 'mautic_build', 'mautic_cli_tool']) {
    assert.match(src, new RegExp(`^function ${fn}\\(\\) \\{`, 'm'), `${fn} is defined`);
  }
  assert.doesNotMatch(src, /^function build_mautic\(\)/m, 'the core\'s own example function is not redefined');
  assert.match(src, /--project-type=php --docroot="\$\{MAUTIC_DOCROOT\}" --webserver-type=apache-fpm/, 'a PHP project served by Apache: the container tool has no type for the site');
  assert.match(src, /--database=mariadb:10\.11/, 'the database the release asks for at least');
  assert.match(src, /github\.com\/mautic\/mautic\/releases\/download\/\$\{version\}\/\$\{version\}\.zip/, 'the release package of the publisher');
  assert.match(src, /sha256sum -c -/, 'checked against the sum the publisher gives');
  assert.match(src, /php bin\/console mautic:install/, 'the site\'s own command-line installer');
  assert.match(src, /--admin_username=\$\(printf '%q' "\$\{account_name\}"\)/, 'the workspace account is the administrator the installer makes');
  assert.doesNotMatch(src, /--admin_password=[^\\]*\$\{account_pass\}/, 'the workspace account\'s password never goes on a command line');
  assert.match(src, /--nodejs-version=\$\(ddev_nodejs_version\)/, 'the build runs the Node.js of the workspace rule');
  assert.doesNotMatch(src, /ddev stop -y/, 'ddev stop takes no -y');
  // The runtimes: the address is the runtime's to say, and the layer chooses the tool.
  assert.doesNotMatch(src.replace(/^\s*#.*$/gm, '').replace(/echo "https:\/\/\$\{PROJECT_NAME\}\.ddev\.site"/, ''), /ddev\.site/, 'ddev.site only as the answer of a core with no layer');
  assert.doesNotMatch(src.replace(/^\s*#.*$/gm, ''), /\b(docker|podman|kubectl|lando|fin) |command ddev/, 'only `ddev <verb>`: the layer chooses');
});

test('every container call is a plain verb of the container tool, and no file of the tool is read where a verb exists', () => {
  const src = read('scripts/functions/fun-mautic.sh');
  const code = src.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  const verbs = new Set([...code.matchAll(/(?<![\w."'-])ddev ([a-z-]+)/g)].map((m) => m[1]));
  for (const verb of verbs) assert.ok(['config', 'exec', 'start', 'describe', 'launch'].includes(verb), `ddev ${verb} is a plain verb the runtime layer carries`);
  assert.doesNotMatch(code, /docker (exec|run|compose|inspect|ps)/, 'no call past the container tool');
  assert.doesNotMatch(code, /supervisorctl/, 'no daemon of the web image is driven');
  assert.doesNotMatch(code, /\.ddev\/config\.yaml/, 'the project\'s own file of the container tool is not read: the project is named after its folder');
  // The one file of the tool the plugin writes is its claim, which the core asks for by that name.
  const files = new Set([...code.matchAll(/\.ddev\/([A-Za-z0-9._-]+)/g)].map((m) => m[1]));
  assert.deepStrictEqual([...files], ['config.mautic.yaml']);
});

test('each agent is a definition the AI Agents folder can list: named after its file, described, on the fable model', () => {
  for (const f of manifest.ai.agents) {
    const src = read(f);
    const head = src.split('\n---\n')[0];
    assert.match(head, /^---\n/, `${f} opens with frontmatter`);
    assert.match(head, new RegExp(`^name: ${path.basename(f, '.md')}$`, 'm'));
    assert.match(head, /^description: .{80,}$/m, `${f} says when to use it`);
    assert.match(head, /^model: fable$/m);
    assert.match(head, /^tools:\n(  - \S+\n?)+/m);
    assert.match(src, /cmd-tools-testing\.sh|cmd-mautic-project\.sh/, `${f} names the plugin's commands`);
  }
  const tester = read('ai/agents/mautic-tester.md');
  assert.match(tester, /Never create or delete an account in a suite/);
  assert.match(tester, /No platform name in a step phrase/);
  assert.match(tester, /Playwright MCP browser first/);
});

test('register() adds the assistant context and nothing else', () => {
  const calls: string[] = [];
  const api: any = { name: 'mautic', addAssistantContext: (fn: () => string) => calls.push(fn()) };
  register(api);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0], assistantContext());
  for (const c of COMMANDS) assert.ok(calls[0].includes(c), `the assistant is told about ${c}`);
  for (const a of AGENTS) assert.ok(calls[0].includes(a), `the assistant is told about ${a}`);
});

test('the docs say container-based, name only what ships, and carry no personal value', () => {
  const docs = ['README.md', ...manifest.ai.agents, 'scripts/functions/fun-mautic.sh'];
  for (const f of docs) {
    const src = read(f);
    assert.doesNotMatch(src, /DDEV-only/i, `${f}: the workspace is container-based, DDEV by default`);
    assert.doesNotMatch(src, /\/home\/(?!YOUR_USER)[a-z]/, `${f} carries no personal path`);
    const mails = src.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[a-z]{2,}/g) || [];
    for (const m of mails) assert.match(m, /@example\.(com|org)$/, `${f}: ${m} is not an example address`);
  }
  for (const c of COMMANDS) assert.ok(read('README.md').includes(c), `the README lists ${c}`);
});

test('the builder starts the project once, with its standard input closed, and never restarts it', () => {
  const src = read('scripts/functions/fun-mautic.sh');
  assert.doesNotMatch(src.replace(/^\s*#.*$/gm, ''), /\brestart\b/, 'nothing is restarted while a build runs');
  assert.match(src, /ddev_up start -y < \/dev\/null/, 'the project is started once, with its standard input closed');
  for (const line of src.split('\n').filter((l) => /^\s*ddev exec /.test(l) && !/\\$/.test(l) && !/<<|\|/.test(l))) {
    assert.match(line, /< \/dev\/null/, `a container call closes its standard input: ${line.trim().slice(0, 80)}`);
  }
});
