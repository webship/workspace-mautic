#!/usr/bin/env bash

# Installed by the Mautic plugin (plugins.sh --install mautic); __WORKSPACE__ is the workspace it was installed into.
#
# The console (bin/console) of one Mautic site of this workspace, in the project's web container: say what the site
# is, run a command of the console, add or cancel the default accounts, add the sample content, take away what a
# stopped test run left, run the site's scheduled tasks. Nothing here runs on the host.

# Bootstrap.
# Find the workspace tooling from this script, so a fresh clone needs no setup.
WORKSPACE_SCRIPTS="${WORKSPACE_SCRIPTS:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../core/scripts" && pwd)}";
source ${WORKSPACE_SCRIPTS}/bootstrap.sh || exit 1 ;

# Load workspace settings.
eval $(parse_yaml ${WORKSPACE_CONFIG}/workspace.__WORKSPACE__.settings.yml);

# Distribution.
distribution_name="mautic";

ARGPARSE_DESCRIPTION="Run the console of a Mautic site of __WORKSPACE__: status, a command, the default accounts, the sample content, the scheduled tasks"
# The args file comes with the plugin: core/scripts/plugins/mautic/ is where plugins.sh --install puts it.
source ${WORKSPACE_SCRIPTS}/plugins/mautic/args/arg-mautic-cli.sh || exit 1 ;

shift $#;

mautic_cli_tool ;
