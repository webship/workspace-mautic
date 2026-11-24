#!/usr/bin/env bash

argparse "$@" <<ARGEOF || exit 1
parser.add_argument('PROJECT_NAME',
                    help='The Mautic project in this workspace.')
parser.add_argument('-r', '--run',
                    default="_none_",
                    help='A command of the site\'s console (bin/console), with its arguments, run in the web container. Example: --run "mautic:segments:update"')
parser.add_argument('-a', '--add-users',
                    action='store_true',
                    default=False,
                    help='Add the default accounts and their roles. An account that is already there gets its names, address, password and role back.')
parser.add_argument('-c', '--cancel-users',
                    action='store_true',
                    default=False,
                    help='Delete the default accounts (never the workspace account, the administrator the installer made); the contacts they own stay, without an owner, until the accounts and the sample content are added again (--add-users, then --sample-content).')
parser.add_argument('-s', '--sample-content',
                    action='store_true',
                    default=False,
                    help='Add the sample content the step pack is tested on (and the default accounts, which own its contacts). What is there already stays as it is; a sample contact gets its owner back.')
parser.add_argument('-t', '--tidy',
                    action='store_true',
                    default=False,
                    help='Remove what a test run that was stopped half way left behind: everything named "Webship test", the tags and addresses "webship-test-", and the record of failed logins (which locks an account out for 30 minutes after three).')
parser.add_argument('-k', '--scheduled-tasks',
                    action='store_true',
                    default=False,
                    help='Run the site\'s scheduled tasks (the segments, then the campaigns) once; with --every, again and again until stopped.')
parser.add_argument('-e', '--every',
                    default="0",
                    help='With --scheduled-tasks: run them every so many seconds, until stopped (Ctrl+C). Example: --every 15')
ARGEOF
