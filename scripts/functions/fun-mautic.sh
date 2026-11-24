#!/usr/bin/env bash

# Mautic for the Webship Workspace: build a Mautic site (the open-source marketing automation platform) from its
# release package, run its console, add its default accounts and its sample content, run its scheduled tasks, and
# wire its step pack into the testing setup.
#
# Placed by `plugins.sh --install mautic` in core/scripts/plugins/mautic/functions/, where bootstrap sources it after
# the core's own functions. Everything runs in containers (DDEV by default), never on the host: the release package
# is fetched and checked in the web container, unpacked in mautic/ (the docroot of a PHP project served by Apache,
# with the release's own rules) and installed with its own command-line installer on the project's database; the
# project's mail catcher takes its mail. The open-source release itself: no account anywhere, no hosted service, no
# statistics sent out.
#
# Every container call is a plain verb of the container tool (config, start, exec, describe, launch), so the
# workspace's runtime layer can carry it to another runtime.
#
# The runtimes: a site is built on DDEV, or with --runtime on Docker Compose, Podman, Kubernetes, Lando or Docksal.
# The commands are the same on each: `ddev <verb>` is DDEV itself on a DDEV project, and on another runtime the core's
# layer (fun-runtime.sh) gives the verb its meaning there. What differs is behind mautic_runtime: the address
# (mautic_url) and what the site is told of it (plain HTTP on a port: no secure cookie), the host of the mail catcher,
# where the project is in its container (mautic_container_root), the claim of the plugin on the project, and how the
# site's scheduled tasks keep running: a daemon of the claim file on DDEV, the core's rt_daemon on Docker Compose,
# Podman and Kubernetes (webship/workspace#825); on Lando and Docksal, and on a core without rt_daemon, this plugin's
# tool runs them when asked (cmd-tools-mautic-cli.sh <name> --scheduled-tasks).
#
# The container tool has no project type for Mautic, so a site of this plugin is recognised by the claim of the plugin
# on the project: on DDEV a file (.ddev/config.mautic.yaml, written by the builder, which also runs the site's
# scheduled tasks), on another runtime `platform: mautic` in the x-webship block of the project's file (the core's
# rt_claim). Four names are the ones the core's tools look for:
#   set_mautic_users          the default accounts                (cmd-tools-add-users.sh <project> mautic)
#   add_mautic_users          create them with the site's code    (the same tool, and --add-users of the builder)
#   cancel_mautic_users       delete them                         (cmd-tools-cancel-users.sh <project> mautic)
#   testing_configure_mautic  the step pack in the testing stack  (cmd-tools-testing.sh <project>)

# The step pack a site is tested with, and the release line it is required at.
readonly MAUTIC_STEPS_PACKAGE='@webship-js/mautic-steps';
readonly MAUTIC_STEPS_VERSION='^2.0.0';

# The release the builder installs when none is asked for, and the PHP of the web container (the release takes 8.2
# and later; 8.3 is the newest the container images of every runtime carry).
readonly MAUTIC_DEFAULT_VERSION='7.2.2';
readonly MAUTIC_DEFAULT_PHP='8.3';

# The site's folder in the project: the docroot.
readonly MAUTIC_DOCROOT='mautic';

# The site's scheduled tasks, in the order the site needs them: the segments, then the campaigns.
readonly MAUTIC_TASKS='mautic:segments:update mautic:campaigns:update mautic:campaigns:trigger';

# The default accounts, the ones a scenario logs in as: an administrator, a marketer (the marketing tools, not the
# users or the settings) and a sales account (the contacts it owns). Accounts are configuration, created once on the
# site; a test suite never creates or deletes one. The administrator the installer makes with --install is the
# workspace account and is not in this list.
function set_mautic_users() {
  users=(administrator marketer sales);
  local user ;
  for user in "${users[@]}" ; do
    printf -v "user_${user}_name" '%s' "${user}" ;
    printf -v "user_${user}_mail" '%s' "${user}@example.com" ;
    printf -v "user_${user}_password" '%s' 'dD.123123ddd' ;
    printf -v "user_${user}_role" '%s' "${user}" ;
  done
}

# The runtime of the project in this folder, or of a new build (--runtime, else the workspace's setting, else
# DDEV). A core without the runtime layer has DDEV only.
function mautic_runtime() {
  if declare -f runtime_of > /dev/null ; then runtime_of ; else echo 'ddev' ; fi
}

# The address of the site in this folder: https://<name>.ddev.site on DDEV, http://127.0.0.1:<port> on Docker
# Compose, Podman and Lando, the node's address and a port on Kubernetes, http://<name>.docksal.site on Docksal.
# Asked after `ddev config`.
function mautic_url() {
  if declare -f rt_url > /dev/null ; then rt_url ; else echo "https://${PROJECT_NAME}.ddev.site" ; fi
}

# The address of the mailbox that catches the site's mail: port 8026 of a DDEV project; on another runtime the one
# the core's layer gives it (rt_mail_url), or nothing on a core whose layer gives it none.
function mautic_mail_url() {
  if [ "$(mautic_runtime)" == 'ddev' ] ; then echo "$(mautic_url):8026" ;
  elif declare -f rt_mail_url > /dev/null ; then rt_mail_url ; fi
}

# Where the site's mail goes, as its mailer reads it: the project's mail catcher over SMTP, at its host on each
# runtime (in the web container on DDEV, the service `mail` of the stack, Lando's `mailpit`).
function mautic_mailer_dsn() {
  case "$(mautic_runtime)" in
    ddev) echo 'smtp://localhost:1025' ;;
    lando) echo 'smtp://mailpit:1025' ;;
    *) echo 'smtp://mail:1025' ;;
  esac
}

# Is this folder a site of this plugin? The claim of the plugin says so, which the core's rt_is_platform reads on
# every runtime: .ddev/config.mautic.yaml on DDEV (the builder leaves it there), `platform: mautic` in the project's
# file on another runtime.
function mautic_is_project() {
  if declare -f rt_is_platform > /dev/null ; then rt_is_platform "$1" mautic ; return $? ; fi
  [ -f "$1/.ddev/config.mautic.yaml" ] ;
}

# Is the site of a folder installed? Its installer writes mautic/config/local.php with the site's secret key.
function mautic_is_installed() {
  grep -qs "'secret_key'" "${1:-.}/${MAUTIC_DOCROOT}/config/local.php" ;
}

# Go to the project a tool was asked about, or say why not.
function mautic_enter_project() {
  local project_path="${WORKSPACE_ROOT}/${doc_name}/${PROJECT_NAME}";
  if [ ! -d "${project_path}" ] ; then
    echo "No project ${PROJECT_NAME} in ${WORKSPACE_ROOT}/${doc_name}." ;
    return 1 ;
  fi
  if ! mautic_is_project "${project_path}" ; then
    echo "${doc_name}/${PROJECT_NAME} is not a Mautic site of this plugin (it has no .ddev/config.mautic.yaml, and its runtime's file does not say platform: mautic)." ;
    return 1 ;
  fi
  cd "${project_path}" || return 1 ;
}

# Where the site is in the container of the project the shell is in: /var/www/html/mautic on DDEV; on another
# runtime the container is asked where the project is (/var/www/html on Docker Compose, Podman and Kubernetes, /app on
# Lando, /var/www on Docksal).
function mautic_container_root() {
  local base='/var/www/html' ;
  if [ "$(mautic_runtime)" != 'ddev' ] ; then
    base="$(ddev exec pwd 2>/dev/null < /dev/null | tr -d '\r' | tail -1)" ;
    base="${base:-/var/www/html}" ;
  fi
  printf '%s' "${base}/${MAUTIC_DOCROOT}" ;
}

# The payload of the site script: base64 of a JSON object with the accounts and the settings. `owner` gives the
# workspace account only (the administrator the installer made); else the default accounts (the list set_mautic_users
# loads), without the workspace account. The rows travel to Python in the environment, never on a command line.
function mautic_payload() {
  local rows="" user name mail password role ;
  if [ "$1" == 'owner' ] ; then
    rows="${account_name}|${account_mail:-${account_name}@example.com}|${account_pass}|administrator|Workspace|Owner"$'\n' ;
  else
    for user in "${users[@]}" ; do
      name="user_${user}_name"; mail="user_${user}_mail"; password="user_${user}_password"; role="user_${user}_role";
      # The workspace account is the administrator the installer made: never one of the default accounts.
      [ "${!name}" == "${account_name}" ] && continue ;
      rows="${rows}${!name}|${!mail}|${!password}|${!role:-sales}|${!name^}|Test"$'\n' ;
    done
  fi
  local url secure='true' ;
  url="$(mautic_url)" ;
  [ "${url%%://*}" == 'https' ] || secure='false' ;
  MAUTIC_ROWS="${rows}" MAUTIC_URL="${url}" MAUTIC_DSN="$(mautic_mailer_dsn)" MAUTIC_SECURE="${secure}" python3 -c '
import base64, json, os
accounts = []
for row in os.environ["MAUTIC_ROWS"].splitlines():
    if row.strip():
        name, email, password, role, first, last = row.split("|", 5)
        accounts.append({"name": name, "email": email, "password": password, "role": role, "firstname": first, "lastname": last})
settings = {"mailer_dsn": os.environ["MAUTIC_DSN"], "site_url": os.environ["MAUTIC_URL"], "cookie_secure": os.environ["MAUTIC_SECURE"] == "true"}
print(base64.b64encode(json.dumps({"accounts": accounts, "settings": settings}).encode()).decode())' ;
}

# Run verbs of mautic-site.php with the site's PHP in the web container, in the site's folder, the payload on a first
# line before the script on PHP's standard input: no password on a command line, in a file of the project, or in what
# a failed run prints. $1 is the payload's kind (owner, or accounts); the rest the verbs.
function mautic_site() {
  local kind="$1" ; shift ;
  local script="${WORKSPACE_SCRIPTS}/plugins/mautic/mautic-site.php" ;
  if [ ! -f "${script}" ] ; then
    echo "mautic-site.php is not in ${WORKSPACE_SCRIPTS}/plugins/mautic: install the plugin (plugins.sh --install mautic)." ;
    return 1 ;
  fi
  { printf '<?php $SITE_PAYLOAD = "%s"; ?>' "$(mautic_payload "${kind}")"; cat "${script}"; } \
    | ddev exec -d "$(mautic_container_root)" "php -- $*" ;
}

# The site's own console (bin/console), in the web container. Every argument is quoted for the container's shell.
function mautic_console() {
  local line='php bin/console --no-ansi --no-interaction' arg ;
  for arg in "$@" ; do
    line="${line} $(printf '%q' "${arg}")" ;
  done
  ddev exec -d "$(mautic_container_root)" "${line}" < /dev/null ;
}

# The loop that keeps the site's scheduled tasks running, every 15 seconds, from the site's folder: the segments, then
# the campaigns. Its output goes nowhere: a task that fails runs again 15 seconds later.
function mautic_tasks_loop() {
  local task line='' ;
  for task in ${MAUTIC_TASKS} ; do
    line="${line}php bin/console ${task} --no-interaction --quiet; " ;
  done
  printf '%s' "while true; do ${line}sleep 15; done > /dev/null 2>&1" ;
}

# Does the project in this folder keep the site's scheduled tasks running by itself? On DDEV the daemon of the claim
# file does; on Docker Compose, Podman and Kubernetes the task the build gave the runtime (rt_daemon), when the core
# has it; on Lando and Docksal not yet.
function mautic_tasks_kept() {
  case "$(mautic_runtime)" in
    ddev) return 0 ;;
    docker|podman|kubernetes)
      declare -f rt_meta > /dev/null || return 1 ;
      case ",$(rt_meta daemons "${1:-$PWD}" 2>/dev/null)," in *",scheduled-tasks,"*) return 0 ;; esac ;
      return 1 ;;
    *) return 1 ;;
  esac
}

# Run the site's scheduled tasks once: the segments, then the campaigns.
function mautic_scheduled_tasks() {
  local task status=0 ;
  for task in ${MAUTIC_TASKS} ; do
    mautic_console "${task}" > /dev/null 2>&1 || { echo "  ${task} did not finish." ; status=1 ; } ;
  done
  return ${status} ;
}

# Write the project's file for the site on DDEV: the overlay of the container tool that says which release it holds,
# and runs the site's scheduled tasks every 15 seconds as a daemon of the web container. It is also the claim of the
# plugin on the project: the core's tools take the test users of a project of the "php" type from the plugin whose
# file it carries.
function mautic_write_claim() {
  local project_path="$1" version="$2" ;
  mkdir -p "${project_path}/.ddev" || return 1 ;
  cat > "${project_path}/.ddev/config.mautic.yaml" <<YAMLEOF
# The Mautic site of this project: its release, and its scheduled tasks (the segments, then the campaigns) every 15
# seconds. Written by the Mautic builder of the workspace (cmd-mautic-project.sh); build again rather than editing by
# hand.
web_environment:
  - MAUTIC_VERSION=${version}
web_extra_daemons:
  - name: scheduled-tasks
    command: "bash -c '$(mautic_tasks_loop)'"
    directory: /var/www/html/${MAUTIC_DOCROOT}
YAMLEOF
}

# The release the site runs, as its own code says it.
function mautic_version() {
  sed -n "s/.*\"version\": *\"\([0-9][0-9.]*\)\".*/\1/p" "${WORKSPACE_ROOT}/${doc_name}/${PROJECT_NAME}/${MAUTIC_DOCROOT}/app/release_metadata.json" 2>/dev/null | head -n 1 ;
}

# Is the project running? Asked of the container tool.
function mautic_is_running() {
  ddev describe -j 2>/dev/null | grep -q '"status":"running"' ;
}

# The SHA-256 sum of a release package, as its publisher gives it: the digest of the release's asset on GitHub
# (api.github.com/repos/mautic/mautic/releases/tags/<release>). A release named here needs no call to that API, which a
# shared machine or a CI runner can find rate-limited; the sum of another release is asked of it.
function mautic_known_sum() {
  case "$1" in
    7.2.2) echo 'e156b290bf4a17f3e5ec05966715a43c8956504efd0df0752cdc13048030a191' ;;
  esac
}

# Fetch the release package in the web container, check it against the SHA-256 sum its publisher gives for it (the
# digest of the release's asset: the one this plugin knows, else the one the release's API gives), and unpack it in
# mautic/.
function mautic_download() {
  local version="$1" root="$2" ;
  local package="https://github.com/mautic/mautic/releases/download/${version}/${version}.zip" ;
  local api="https://api.github.com/repos/mautic/mautic/releases/tags/${version}" ;
  ddev exec "set -e; cd /tmp && curl -sSfL --retry 3 -o mautic.zip '${package}' \
    && SUM='$(mautic_known_sum "${version}")' \
    && if [ -z \"\$SUM\" ]; then curl -sSfL --retry 5 --retry-all-errors --retry-delay 15 -H 'Accept: application/vnd.github+json' -o mautic-release.json '${api}' \
         && SUM=\$(php -r '\$r = json_decode(file_get_contents(\"mautic-release.json\"), true); foreach (\$r[\"assets\"] as \$a) { if (\$a[\"name\"] === \"${version}.zip\") { echo substr(\$a[\"digest\"], 7); } }'); fi \
    && test -n \"\$SUM\" && echo \"\$SUM  mautic.zip\" | sha256sum -c - \
    && mkdir -p '${root}' && unzip -q -o mautic.zip -d '${root}' && rm -f mautic.zip mautic-release.json" < /dev/null ;
}

# Install the site with its own command-line installer ($1: its address, $2: where it is in the container): the
# project's database, the workspace account as its administrator. The installer is given a password of one use, which
# the site script replaces with the workspace account's (read on its standard input, never on a command line).
function mautic_install() {
  local url="$1" root="$2" ;
  ddev exec -d "${root}" "php bin/console mautic:install $(printf '%q' "${url}") --force --no-interaction \
    --db_driver=pdo_mysql --db_host=db --db_port=3306 --db_name=db --db_user=db --db_password=db --db_backup_tables=false \
    --admin_firstname=Workspace --admin_lastname=Owner --admin_username=$(printf '%q' "${account_name}") \
    --admin_email=$(printf '%q' "${account_mail:-${account_name}@example.com}") \
    --admin_password=\"\$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20)Aa1!\"" < /dev/null || return 1 ;
  # The settings of a test site, read once the site's cache is cleared; then the workspace account's own password.
  mautic_site owner settings < /dev/null || return 1 ;
  mautic_console cache:clear > /dev/null || return 1 ;
  mautic_site owner accounts < /dev/null ;
}

# Build a site from nothing: the project and the release; with --install the installer, the workspace account as its
# administrator and the settings a test run needs; with --add-users the default accounts; with --sample-content the
# test content of the step pack.
function mautic_build() {
  trim_project_name ;
  local base_url mail_url runtime root ;
  runtime="$(mautic_runtime)" ;
  if [ "${RUNTIME:-_none_}" != '_none_' ] && [ "${RUNTIME}" != "${runtime}" ] ; then
    echo "--runtime ${RUNTIME} needs a Webship Workspace with the container runtimes (webship/workspace#694): update the workspace, or build on DDEV. Nothing was changed." ;
    exit 1 ;
  fi
  local version="${MAUTIC_VERSION:-${site_mautic_version:-${MAUTIC_DEFAULT_VERSION}}}" ;
  local php_version="${PHP_VERSION:-${site_php_version:-${MAUTIC_DEFAULT_PHP}}}" ;
  local project_path="${WORKSPACE_ROOT}/${doc_name}/${PROJECT_NAME}" ;

  if ! [[ "${version}" =~ ^[5-9]\.[0-9]+\.[0-9]+$ ]] ; then
    echo "--mautic-version takes a release number (7.2.2), not ${version}. Nothing was changed." ;
    exit 1 ;
  fi
  if ! [[ "${php_version}" =~ ^8\.[2-4]$ ]] ; then
    echo "--php-version takes 8.2 to 8.4 (the release takes 8.2 and later; 8.4 is the newest every runtime's image carries), not ${php_version}. Nothing was changed." ;
    exit 1 ;
  fi
  if [ "${ADD_USERS}" == 'yes' ] && [ "${INSTALL}" != 'yes' ] ; then
    echo "--add-users needs --install: the default accounts go into the site --install makes." ;
    exit 1 ;
  fi
  if [ "${SAMPLE_CONTENT}" == 'yes' ] && [ "${ADD_USERS}" != 'yes' ] ; then
    echo "--sample-content needs --install and --add-users: the sample contacts are owned by the default accounts." ;
    exit 1 ;
  fi
  if [ ${#PROJECT_NAME} -gt 40 ] || ! [[ "${PROJECT_NAME}" =~ ^[a-z0-9][a-z0-9-]*$ ]] ; then
    echo "The project name ${PROJECT_NAME} must be small letters, digits and dashes (its address and its container take it). Nothing was changed." ;
    exit 1 ;
  fi
  if [ "${INSTALL}" == 'yes' ] && [ ${#account_pass} -lt 8 ] ; then
    echo "The workspace account's password is not set (core/config/settings.yml): --install makes it the site's administrator. Nothing was changed." ;
    exit 1 ;
  fi

  cd ${WORKSPACE_ROOT}/${doc_name} || exit 1 ;

  # A project of the same name goes first, with its database.
  drop_database ;
  rm -rf "${PROJECT_NAME}" ;
  mkdir -p "${PROJECT_NAME}/${MAUTIC_DOCROOT}" ;
  cd "${project_path}" || exit 1 ;

  # A PHP project served by Apache (the release's own rules) from mautic/, with the project's database (MariaDB 10.11)
  # and the Node.js of the workspace for a test suite run in the web container.
  ddev config --project-type=php --docroot="${MAUTIC_DOCROOT}" --webserver-type=apache-fpm --php-version="${php_version}" \
    --database=mariadb:10.11 --project-name=${PROJECT_NAME} --nodejs-version=$(ddev_nodejs_version) < /dev/null || exit 1 ;
  # The claim of the plugin on the project: its own file on DDEV (with the scheduled tasks), the core's rt_claim on
  # another runtime.
  if [ "${runtime}" == 'ddev' ] ; then
    mautic_write_claim "${project_path}" "${version}" || exit 1 ;
  else
    rt_claim mautic || exit 1 ;
    # The site's scheduled tasks beside the web server, where the runtime keeps a task running (webship/workspace#825):
    # from the project's root in the container, in the site's folder.
    if declare -f rt_daemon > /dev/null ; then
      rt_daemon scheduled-tasks "cd ${MAUTIC_DOCROOT} && $(mautic_tasks_loop)" || exit 1 ;
    fi
  fi

  echo "Starting the project." ;
  ddev_up start -y < /dev/null || exit 1 ;
  # The address is the runtime's to say, once the project is configured: never a written ddev.site.
  base_url="$(mautic_url)" ;
  mail_url="$(mautic_mail_url)" ;
  root="$(mautic_container_root)" ;
  echo "Fetching Mautic ${version} and checking its SHA-256 sum." ;
  mautic_download "${version}" "${root}" || { echo "The release package did not come, or its sum did not match." ; exit 1 ; } ;

  if [ "${INSTALL}" == 'yes' ] ; then
    echo "Installing it, with the workspace account ${account_name} as its administrator." ;
    mautic_install "${base_url}" "${root}" || { echo "The installer did not finish." ; exit 1 ; } ;
    if [ "${ADD_USERS}" == 'yes' ] ; then
      set_mautic_users ;
      add_mautic_users || exit 1 ;
      if [ "${SAMPLE_CONTENT}" == 'yes' ] ; then
        cd "${project_path}" || exit 1 ;
        mautic_site accounts content < /dev/null || exit 1 ;
      fi
      users=() ;
    fi
    cd "${project_path}" || exit 1 ;
    # The segments and the campaigns once now, so the site's first pages find them built.
    mautic_scheduled_tasks ;
    echo "${doc_name} ${PROJECT_NAME} has been installed: Mautic $(mautic_version)." ;
    echo "The site: ${base_url}/s/login${mail_url:+ · its mail: ${mail_url}} · its administrator: ${account_name}" ;
    if mautic_tasks_kept "${project_path}" ; then
      echo "Its scheduled tasks (segments, campaigns) run every 15 seconds beside the web server." ;
    else
      echo "Its scheduled tasks (segments, campaigns) run when you ask: bash cmd-tools-mautic-cli.sh ${PROJECT_NAME} --scheduled-tasks (once), or with --every 15 (until you stop it)." ;
    fi
  else
    echo "${doc_name} ${PROJECT_NAME} is ready, not installed: Mautic $(mautic_version) at ${base_url} shows its installer." ;
    echo "Build it again with --install (and --add-users) to install it with the workspace account as its administrator." ;
  fi

  if [ "${LAUNCH}" == 'yes' ] ; then
    ddev launch ;
  fi

  cd ${WORKSPACE_ROOT}/${doc_name};
}

# Create the default accounts with the site's own code, and the roles Marketer and Sales they take: an account that is
# already there gets its names, address, password and role back. The list is loaded by the caller (set_mautic_users):
# the core's add_users, the builder, the tool.
function add_mautic_users() {
  mautic_enter_project || return 1 ;
  if ! mautic_is_installed . ; then
    echo "${doc_name}/${PROJECT_NAME} is not installed: build it with --install first." ;
    return 1 ;
  fi
  local user user_name user_mail user_password user_role ;
  for user in "${users[@]}" ; do
    user_name="user_${user}_name"; user_mail="user_${user}_mail";
    user_password="user_${user}_password"; user_role="user_${user}_role";

    echo " ---------------------------------------------------------------- ";
    echo "      User name: ${!user_name}";
    echo "      User mail: ${!user_mail}";
    echo "  User password: ${!user_password}";
    echo "      User role: ${!user_role:-sales}";
    echo " ================================================================= ";
  done
  mautic_site accounts accounts < /dev/null ;
  local status=$? ;
  cd ${WORKSPACE_ROOT}/${doc_name};
  return ${status} ;
}

# Delete the default accounts (never the workspace account, the administrator the installer made). The contacts they
# own stay, without an owner.
function cancel_mautic_users() {
  mautic_enter_project || return 1 ;
  local user user_name ;
  for user in "${users[@]}" ; do
    user_name="user_${user}_name";
    echo " ---------------------------------------------------------------- ";
    echo "      User name: ${!user_name}";
    echo " ================================================================= ";
  done
  mautic_site accounts cancel < /dev/null ;
  local status=$? ;
  cd ${WORKSPACE_ROOT}/${doc_name};
  return ${status} ;
}

# What cmd-tools-mautic-cli.sh does: the first of --run, --add-users, --cancel-users, --sample-content, --tidy,
# --scheduled-tasks that was asked for; with none of them, what the site is.
function mautic_cli_tool() {
  trim_project_name ;
  mautic_enter_project || exit 1 ;

  if ! mautic_is_running ; then
    ddev start -y < /dev/null || exit 1 ;
  fi

  if ! mautic_is_installed . ; then
    echo "${doc_name}/${PROJECT_NAME}: Mautic $(mautic_version), not installed (build it again with --install)." ;
    exit 0 ;
  fi

  if [ ! "${RUN}" == '_none_' ] ; then
    ddev exec -d "$(mautic_container_root)" "php bin/console --no-ansi ${RUN}" < /dev/null ;
    exit $? ;
  fi

  set_mautic_users ;
  local status=0 ;
  if [ "${ADD_USERS}" == 'yes' ] ; then
    add_mautic_users ; status=$? ;
  elif [ "${CANCEL_USERS}" == 'yes' ] ; then
    cancel_mautic_users ; status=$? ;
  elif [ "${SAMPLE_CONTENT}" == 'yes' ] ; then
    mautic_site accounts accounts content < /dev/null ; status=$? ;
    [ ${status} -eq 0 ] && mautic_scheduled_tasks ;
  elif [ "${TIDY}" == 'yes' ] ; then
    mautic_site accounts tidy < /dev/null ; status=$? ;
    # The site's record of failed logins too: it locks an account out for 30 minutes after three.
    mautic_console cache:pool:clear cache.rate_limiter > /dev/null || status=1 ;
  elif [ "${SCHEDULED_TASKS}" == 'yes' ] ; then
    if [ "${EVERY:-0}" -gt 0 ] 2>/dev/null ; then
      echo "Running the scheduled tasks every ${EVERY} seconds (${MAUTIC_TASKS}); stop with Ctrl+C." ;
      while true ; do mautic_scheduled_tasks ; sleep "${EVERY}" ; done ;
    fi
    echo "Running the scheduled tasks once: ${MAUTIC_TASKS}." ;
    mautic_scheduled_tasks ; status=$? ;
  else
    echo "${doc_name}/${PROJECT_NAME}: Mautic $(mautic_version)" ;
    echo "  the site: $(mautic_url)/s/login" ;
    [ -n "$(mautic_mail_url)" ] && echo "  its mail: $(mautic_mail_url)" ;
    echo "  its administrator: ${account_name}" ;
    if mautic_tasks_kept "${PWD}" ; then
      echo "  its scheduled tasks: every 15 seconds, beside the web server" ;
    else
      echo "  its scheduled tasks: when asked (--scheduled-tasks, or --scheduled-tasks --every 15)" ;
    fi
    echo "" ;
    echo "Accounts:" ;
    mautic_site accounts list < /dev/null ; status=$? ;
  fi
  cd ${WORKSPACE_ROOT}/${doc_name};
  exit ${status} ;
}

# The step pack in the testing stack of a site. The core's testing_configure calls this in the project folder once
# webship-js is scaffolded and before the dependencies are installed; for a project that is not one of this plugin's it
# changes nothing.
#
# It adds the pack to package.json, lists its step definitions in cucumber.js after webship-js's own, gives cucumber.js
# the tags that keep the pack's assertions that must fail out of a normal run, the mail catcher, the account that
# removes test content (administrator), the browser messages setting, and the users registry of the default accounts
# (a handle a scenario reads, mapped to an account; never the workspace account), and writes a first feature when the
# project has none of its own. Every part is skipped when it is already there, so a second run adds what the first
# missed and never resets a suite.
function testing_configure_mautic() {
  local project_path="$1";
  mautic_is_project "${project_path}" || return 0 ;
  if [ ! -f "${project_path}/cucumber.js" ] || [ ! -f "${project_path}/package.json" ] ; then
    echo "  Mautic: cucumber.js is not here yet — run the testing setup again once webship-js is scaffolded." ;
    return 1 ;
  fi

  echo "Adding the Mautic step pack (${MAUTIC_STEPS_PACKAGE} ${MAUTIC_STEPS_VERSION}).";
  set_mautic_users ;
  local registry="" user user_name user_mail user_password ;
  for user in "${users[@]}" ; do
    user_name="user_${user}_name"; user_mail="user_${user}_mail"; user_password="user_${user}_password";
    registry="${registry}${user}|${!user_name}|${!user_mail}|${!user_password}"$'\n' ;
  done

  # The builder names the project after its folder: its address follows.
  local site_name ;
  site_name="$(basename "${project_path}")" ;

  # On DDEV the site's address is written into cucumber.js, for a run that is given no LAUNCH_URL. On another runtime
  # no address is written: the Workspace's tests container hands the suite LAUNCH_URL and MAIL_URL.
  local address='' ;
  [ "$(cd "${project_path}" && mautic_runtime)" == 'ddev' ] && address="$(cd "${project_path}" && PROJECT_NAME="${site_name:-${PROJECT_NAME}}" mautic_url)" ;

  python3 - "${project_path}" "${MAUTIC_STEPS_PACKAGE}" "${MAUTIC_STEPS_VERSION}" 'MAUTIC' "${registry}" "${address}" <<'PYEOF' || return 1
import json, re, sys

project, pack, version, prefix, registry, address = sys.argv[1:7]

# package.json: the pack as a dev dependency, at the release line this plugin was proven on.
pkg_file = project + '/package.json'
pkg = json.load(open(pkg_file))
if pack not in pkg.get('dependencies', {}) and pack not in pkg.get('devDependencies', {}):
    pkg.setdefault('devDependencies', {})[pack] = version
    open(pkg_file, 'w').write(json.dumps(pkg, indent=4) + '\n')
    print('  package.json: %s %s' % (pack, version))

cucumber_file = project + '/cucumber.js'
src = open(cucumber_file).read()
before = src

if ('node_modules/%s/' % pack) not in src:
    line = "'node_modules/%s/tests/step-definitions/**/*.js'," % pack
    core = re.search(r"^([ \t]*)'node_modules/webship-js/tests/step-definitions/[^']*',.*$", src, re.M)
    opening = re.search(r"^([ \t]*)require:[ \t]*\[[ \t]*$", src, re.M)
    if core:
        src = src[:core.end()] + '\n' + core.group(1) + line + src[core.end():]
    elif opening:
        src = src[:opening.end()] + '\n' + opening.group(1) + '  ' + line + src[opening.end():]
    else:
        sys.exit("  cucumber.js has no require list this can add to. Add this line to it:\n    " + line)
    print('  cucumber.js: the step definitions of %s' % pack)

if not re.search(r"^[ \t]*tags:", src, re.M):
    default = re.search(r"^([ \t]*)default:[ \t]*\{[ \t]*$", src, re.M)
    if default:
        pad = default.group(1) + '  '
        block = [
            pad + "// The pack's assertions that must fail are no part of a normal run.",
            pad + "tags: process.env.CUCUMBER_TAGS || 'not @wip and not @must-fail',",
        ]
        src = src[:default.end()] + '\n' + '\n'.join(block) + src[default.end():]
        print('  cucumber.js: the tags that keep the assertions that must fail out of a normal run')

world = re.search(r"^([ \t]*)worldParameters:[ \t]*\{[ \t]*$", src, re.M)
if not world:
    sys.exit("  cucumber.js has no worldParameters block to add the users registry to.")
pad = world.group(1) + '  '
additions = []
base = "(process.env.LAUNCH_URL || '%s').replace(/\\/+$/, '')" % address
if not re.search(r"^[ \t]*mailUrl:", src, re.M) and not address:
    additions += [
        pad + "// The project's mail catcher: the Workspace's tests container says where it is (MAIL_URL).",
        pad + "mailUrl: process.env.MAIL_URL || '',",
    ]
elif not re.search(r"^[ \t]*mailUrl:", src, re.M):
    additions += [
        pad + "// The project's mail catcher: in the web container (where the testing setup runs the suite) on its own port, else through the router.",
        pad + "mailUrl: process.env.MAIL_URL || (process.env.IS_DDEV_PROJECT ? 'http://127.0.0.1:8025' : `${%s}:8026`)," % base,
    ]
if not re.search(r"^[ \t]*manager:", src, re.M):
    additions += [
        pad + "// The account that prepares and removes test content for the Given steps, in a browser of its own: a handle of `users`.",
        pad + "manager: process.env.MANAGER || 'administrator',",
    ]
if not re.search(r"^[ \t]*javascript:", src, re.M):
    additions += [
        pad + "// Browser messages. Ignored: the avatar of the account logged in comes from an outside avatar service, whose image",
        pad + "// proxy answers 400 for the default picture of a site it cannot reach: not the site's fault. The scenarios of a",
        pad + "// refusal the site answers with an error status (403, 404) carry @js-off.",
        pad + "javascript: { mode: process.env.WEBSHIP_JS_ERROR_MODE || 'warn', levels: ['error'], ignore: '^Failed to load resource: the server responded with a status of 400 \\\\(\\\\)$', beforeScenario: false, afterScenario: true },",
    ]
if not re.search(r"^[ \t]*users:[ \t]*\{", src, re.M):
    rows = [r.split('|') for r in registry.splitlines() if r.strip()]
    additions += [
        pad + "// The users registry: a handle a scenario reads, mapped to an account of the site (the default accounts:",
        pad + "// cmd-tools-mautic-cli.sh --add-users). Override one with %s_<HANDLE>_USERNAME and %s_<HANDLE>_PASSWORD." % (prefix, prefix),
        pad + "users: {",
    ]
    for handle, username, email, password in rows:
        env = '%s_%s' % (prefix, handle.upper())
        additions.append(pad + "  %s: { username: process.env.%s_USERNAME || '%s', email: '%s', password: process.env.%s_PASSWORD || '%s' }," % (handle, env, username, email, env, password))
    additions.append(pad + "},")
    print('  cucumber.js: the users registry (%s)' % ', '.join(r[0] for r in rows))
if additions:
    src = src[:world.end()] + '\n' + '\n'.join(additions) + src[world.end():]
    print('  cucumber.js: the mail catcher, the managing account and the browser messages setting')

# The address the suite opens when LAUNCH_URL is not set: the placeholder of the scaffold becomes the site's.
placeholder = "process.env.LAUNCH_URL || 'http://localhost:8080'"
if placeholder in src and address:
    src = src.replace(placeholder, "process.env.LAUNCH_URL || '%s'" % address)
    print('  cucumber.js: the address of the site (%s)' % address)

if src != before:
    open(cucumber_file, 'w').write(src)
PYEOF

  # A first feature, when the project has none for the site yet.
  local feature="${WORKSPACE_SCRIPTS}/plugins/mautic/site.feature" ;
  if [ -f "${feature}" ] && [ ! -f "${project_path}/tests/features/site.feature" ] ; then
    mkdir -p "${project_path}/tests/features" && cp "${feature}" "${project_path}/tests/features/site.feature" \
      && echo "  tests/features/site.feature: a first feature for the site" ;
  fi

  # The scenarios log in as the default accounts: make sure an installed site has them.
  if mautic_is_installed "${project_path}" && ( cd "${project_path}" && PROJECT_NAME="${site_name}" add_mautic_users > /dev/null 2>&1 ) ; then
    echo "  the default accounts are on the site (${users[*]})" ;
  elif mautic_is_installed "${project_path}" ; then
    echo "  The default accounts could not be written: is the project running (start it from ${project_path})?" ;
  fi
}
