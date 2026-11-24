#!/usr/bin/env bash

argparse "$@" <<ARGEOF || exit 1
parser.add_argument('PROJECT_NAME',
                    help='The name of the project: its folder, and its name on the container runtime (on DDEV its host name too).')
parser.add_argument('--runtime',
                    dest='RUNTIME',
                    default="_none_",
                    choices=['ddev', 'docker', 'podman', 'kubernetes', 'lando', 'docksal'],
                    help='The container runtime to build on: ddev (the default, or container.runtime of settings.yml), docker (Docker Compose), podman, kubernetes, lando or docksal.')
parser.add_argument('-i', '--install',
                    action='store_true',
                    default=False,
                    help='Install the site with its own command-line installer, the workspace account as its administrator, and set it up for testing.')
parser.add_argument('-a', '--add-users',
                    action='store_true',
                    default=False,
                    help='With --install, add the default accounts (administrator, marketer, sales) and their roles: the ones the test scenarios log in as.')
parser.add_argument('-s', '--sample-content',
                    action='store_true',
                    default=False,
                    help='With --install and --add-users, add the sample content the step pack is tested on: contacts, a company, two stages, two segments, an email, a landing page, an asset and a form.')
parser.add_argument('-v', '--mautic-version',
                    default="",
                    help='The release of the site: 7.2.2 by default. Example: --mautic-version 7.2.1')
parser.add_argument('-p', '--php-version',
                    default="",
                    help='The PHP of the web container: 8.3 by default (8.2 to 8.4). Example: --php-version 8.2')
parser.add_argument('-l', '--launch',
                    action='store_true',
                    default=False,
                    help='Open the site in a browser when it is ready.')
ARGEOF
