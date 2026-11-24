#!/usr/bin/env bash

# workspace-name: Mautic (marketing automation)

# Installed by the Mautic plugin (plugins.sh --install mautic); __WORKSPACE__ is the workspace it was installed into.
#
# Build a Mautic site in containers (DDEV by default): the release package (its SHA-256 sum checked) unpacked in
# mautic/, the docroot of a PHP project served by Apache. With --install it is installed with its own command-line
# installer on the project's database, the workspace account as its administrator, and set up for testing; with
# --add-users it also gets the default accounts; with --sample-content the contacts, segments, forms and the rest the
# step pack is tested on. On DDEV it is at https://<name>.ddev.site, its scheduled tasks running as a daemon of the
# project; with --runtime docker, podman, kubernetes, lando or docksal it is built on that runtime, at the address the
# build prints.

# Bootstrap.
# Find the workspace tooling from this script, so a fresh clone needs no setup.
WORKSPACE_SCRIPTS="${WORKSPACE_SCRIPTS:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../core/scripts" && pwd)}";
source ${WORKSPACE_SCRIPTS}/bootstrap.sh || exit 1 ;

# Load workspace settings.
eval $(parse_yaml ${WORKSPACE_CONFIG}/workspace.__WORKSPACE__.settings.yml);

# Distribution.
distribution_name="mautic";
distribution_title="Mautic";
distribution_webroot="mautic";

ARGPARSE_DESCRIPTION="Build a ${distribution_title} site in __WORKSPACE__"
# The args file comes with the plugin: core/scripts/plugins/mautic/ is where plugins.sh --install puts it.
source ${WORKSPACE_SCRIPTS}/plugins/mautic/args/arg-mautic.sh || exit 1 ;

shift $#;

mautic_build ;
