<?php
/**
 * The test site's side of the build, run by PHP in the web container with the site's own code:
 *
 *   { printf '<?php $SITE_PAYLOAD = "%s"; ?>' "<base64 of a JSON object>"; cat mautic-site.php; } | php -- <verbs>
 *
 * PHP reads the script on its standard input, in the folder of the site (the docroot of the release), after a first
 * line that sets $SITE_PAYLOAD: base64 of a JSON object with the accounts ({"accounts": [{"name", "email",
 * "password", "role", "firstname", "lastname"}]}) and the settings ({"settings": {"mailer_dsn": …}}). No password
 * travels on a command line or rests in a file of the project.
 *
 * Verbs, in the order they are given:
 *   settings   the settings of a test site: where its mail goes (the project's mail catcher), its sender, no
 *              statistics sent to an outside service, and secure cookies only on HTTPS
 *   accounts   the roles Marketer and Sales, and the accounts of the payload, each with its role; an account that is
 *              there already gets its names, address, password and role back
 *   cancel     delete the accounts of the payload (never another account)
 *   list       the accounts of the site, one a line
 *   content    the sample content the step pack is tested on (see content() below); what is there stays as it is
 *   tidy       remove what a test run that was stopped half way left: everything named "Webship test …"
 *   version    the release of the site
 *
 * The same script is the step pack's (site/mautic-site.php) and the Webship Workspace plugin's
 * (scripts/mautic-site.php).
 */

if (php_sapi_name() !== 'cli') {
    exit(1);
}

$root = getcwd();
if (!is_file($root.'/app/AppKernel.php')) {
    fwrite(STDERR, "Run this script in the folder of the site (where app/AppKernel.php is).\n");
    exit(1);
}

$payload = json_decode(base64_decode($SITE_PAYLOAD ?? ''), true) ?: [];
$verbs   = array_slice($argv, 1);
if (!$verbs) {
    fwrite(STDERR, "Give a verb: settings, accounts, cancel, list, content, tidy, version.\n");
    exit(1);
}

// The settings are written before the kernel boots: a booted kernel has already read config/local.php.
if (in_array('settings', $verbs, true)) {
    site_settings($root, $payload['settings'] ?? []);
    $verbs = array_values(array_diff($verbs, ['settings']));
    if (!$verbs) {
        exit(0);
    }
}

defined('IN_MAUTIC_CONSOLE') or define('IN_MAUTIC_CONSOLE', 1);
defined('MAUTIC_ROOT_DIR') or define('MAUTIC_ROOT_DIR', $root);
require $root.'/autoload.php';
foreach (['APP_ENV' => 'prod', 'APP_DEBUG' => '0'] as $name => $value) {
    putenv($name.'='.$value);
    $_SERVER[$name] = $_ENV[$name] = $value;
}
require $root.'/app/config/bootstrap.php';

$kernel = new AppKernel('prod', false);
$kernel->boot();
$container = $kernel->getContainer();
$models    = $container->get('mautic.model.factory');
$em        = $container->get('doctrine.orm.entity_manager');

// The models record who made what: the first administrator of the site acts for the script, through the token
// storage the site's own user helper reads (the container keeps that service private).
$admin = $models->getModel('user.user')->getRepository()->findOneBy([], ['id' => 'ASC']);
if ($admin) {
    $helper  = $container->get('mautic.helper.user');
    $storage = (new \ReflectionProperty($helper, 'tokenStorage'))->getValue($helper);
    $storage->setToken(new \Symfony\Component\Security\Core\Authentication\Token\UsernamePasswordToken($admin, 'main', $admin->getRoles()));
}

foreach ($verbs as $verb) {
    switch ($verb) {
        case 'accounts':
            site_accounts($models, $em, $payload['accounts'] ?? []);
            break;
        case 'cancel':
            site_cancel($models, $em, $payload['accounts'] ?? []);
            break;
        case 'list':
            site_list($models);
            break;
        case 'content':
            site_content($models, $em, $root);
            break;
        case 'tidy':
            site_tidy($models, $em);
            break;
        case 'version':
            echo 'Mautic '.$kernel->getVersion()."\n";
            break;
        default:
            fwrite(STDERR, "Unknown verb: {$verb}\n");
            exit(1);
    }
}

/**
 * Write the settings of a test site into config/local.php, keeping every value the installer wrote.
 *
 * @param array<string, mixed> $settings
 */
function site_settings(string $root, array $settings): void
{
    $file = $root.'/config/local.php';
    if (!is_file($file)) {
        fwrite(STDERR, "config/local.php is not there: install the site first.\n");
        exit(1);
    }
    $parameters = [];
    include $file;
    $defaults = [
        // The project's mail catcher (Mailpit): in the web container on DDEV, the host "mail" of another runtime.
        'mailer_dsn'        => 'smtp://localhost:1025',
        'mailer_from_name'  => 'Webship test site',
        'mailer_from_email' => 'marketing@example.com',
        // No statistics sent to an outside service from a test site.
        'stats_update_url'  => '',
    ];
    foreach (array_merge($defaults, $settings) as $key => $value) {
        $parameters[$key] = $value;
    }
    file_put_contents($file, "<?php\n\$parameters = ".var_export($parameters, true).";\n");
    echo "Settings written: ".implode(', ', array_keys(array_merge($defaults, $settings)))."\n";
}

/**
 * The two roles of the default accounts. An administrator takes the role the installer made ("Administrator").
 *
 * @return array<string, array<string, string[]>>
 */
function site_roles(): array
{
    $full = ['full'];

    return [
        // Everything a marketing team works with, but the users, the roles, the settings and the plugins.
        'Marketer' => [
            'lead:leads'                      => $full,
            'lead:notes'                      => $full,
            'lead:lists'                      => $full,
            'lead:fields'                     => ['view'],
            'lead:export'                     => ['enable'],
            'lead:imports'                    => $full,
            'asset:assets'                    => $full,
            'asset:categories'                => $full,
            'campaign:campaigns'              => $full,
            'campaign:categories'             => $full,
            'category:categories'             => $full,
            'channel:messages'                => $full,
            'dynamiccontent:dynamiccontents'  => $full,
            'email:emails'                    => $full,
            'email:categories'                => $full,
            'focus:items'                     => $full,
            'form:forms'                      => $full,
            'form:categories'                 => $full,
            'page:pages'                      => $full,
            'page:categories'                 => $full,
            'point:points'                    => $full,
            'point:triggers'                  => $full,
            'point:groups'                    => $full,
            'point:insights'                  => ['view'],
            'stage:stages'                    => $full,
            'report:reports'                  => $full,
            'tagManager:tagManager'           => $full,
            'project:project'                 => $full,
            'user:profile'                    => ['editname', 'editposition'],
        ],
        // The contacts the account owns, and their notes: nothing of the marketing tools.
        'Sales' => [
            'lead:leads'   => ['viewown', 'editown', 'create', 'deleteown'],
            'lead:notes'   => ['viewown', 'editown', 'create', 'deleteown'],
            'user:profile' => ['editname', 'editposition'],
        ],
    ];
}

/** A role by its name: the one the installer made, or one of site_roles(), made when it is not there. */
function site_role($models, $em, string $name)
{
    $roles = $models->getModel('user.role');
    $role  = $roles->getRepository()->findOneBy(['name' => $name]);
    $wanted = site_roles()[$name] ?? null;
    if (!$role) {
        if (null === $wanted) {
            // The administrator's role: the one the installer made with full access.
            $role = $roles->getRepository()->findOneBy(['isAdmin' => true], ['id' => 'ASC']);
            if (!$role) {
                fwrite(STDERR, "The site has no role \"{$name}\".\n");
                exit(1);
            }

            return $role;
        }
        $role = new \Mautic\UserBundle\Entity\Role();
        $role->setName($name);
        $role->setDescription('A role of the test accounts (the step pack and the Webship Workspace).');
        $role->setIsAdmin(false);
    }
    if (null !== $wanted) {
        // The permissions as the role form sends them, made again each time.
        foreach ($role->getPermissions() as $permission) {
            $role->removePermission($permission);
        }
        $roles->setRolePermissions($role, $wanted);
        $roles->saveEntity($role);
    }

    return $role;
}

/**
 * The accounts of the payload, each with its role. An account that is there already gets its names, address,
 * password and role back.
 *
 * @param array<int, array<string, string>> $accounts
 */
function site_accounts($models, $em, array $accounts): void
{
    $users = $models->getModel('user.user');
    foreach ($accounts as $account) {
        $name = (string) ($account['name'] ?? '');
        if ('' === $name) {
            continue;
        }
        $roleName = ['administrator' => 'Administrator', 'marketer' => 'Marketer', 'sales' => 'Sales'][$account['role'] ?? ''] ?? ($account['role'] ?? 'Sales');
        $role     = site_role($models, $em, $roleName);
        $user     = $users->getRepository()->findOneBy(['username' => $name]) ?: new \Mautic\UserBundle\Entity\User();
        $user->setUsername($name);
        $user->setEmail((string) ($account['email'] ?? $name.'@example.com'));
        $user->setFirstName((string) ($account['firstname'] ?? ucfirst($name)));
        $user->setLastName((string) ($account['lastname'] ?? 'Test'));
        $user->setRole($role);
        $user->setIsPublished(true);
        $user->setPassword($users->checkNewPassword($user, (string) $account['password']));
        $users->saveEntity($user);
        echo "Account {$name}: {$role->getName()}\n";
    }
}

/**
 * Delete the accounts of the payload. The contacts they own stay, without an owner.
 *
 * @param array<int, array<string, string>> $accounts
 */
function site_cancel($models, $em, array $accounts): void
{
    $users = $models->getModel('user.user');
    foreach ($accounts as $account) {
        $user = $users->getRepository()->findOneBy(['username' => (string) ($account['name'] ?? '')]);
        if (!$user) {
            continue;
        }
        if ($user->isAdmin() && 1 === count($users->getRepository()->findBy(['role' => $user->getRole()]))) {
            echo "Account {$user->getUsername()} kept: the site's only administrator.\n";
            continue;
        }
        $users->deleteEntity($user);
        echo "Account {$account['name']} deleted\n";
    }
}

/** The accounts of the site, one a line: user name, address, role. */
function site_list($models): void
{
    foreach ($models->getModel('user.user')->getRepository()->findBy([], ['id' => 'ASC']) as $user) {
        printf("  %-16s %-32s %s\n", $user->getUsername(), $user->getEmail(), $user->getRole() ? $user->getRole()->getName() : '');
    }
}

/** A user by user name, or null. */
function site_user($models, string $name)
{
    return $models->getModel('user.user')->getRepository()->findOneBy(['username' => $name]);
}

/**
 * The sample content the step pack is tested on. Each piece is looked for by its name first, and made only when it is
 * not there, so a second run adds what a first one missed and changes nothing else.
 */
function site_content($models, $em, string $root): void
{
    $leads     = $models->getModel('lead.lead');
    $companies = $models->getModel('lead.company');

    // Two stages a contact can be in.
    $stages = [];
    foreach ([['Lead', 10], ['Customer', 50]] as [$stageName, $weight]) {
        $stage = $em->getRepository(\Mautic\StageBundle\Entity\Stage::class)->findOneBy(['name' => $stageName]);
        if (!$stage) {
            $stage = new \Mautic\StageBundle\Entity\Stage();
            $stage->setName($stageName);
            $stage->setWeight($weight);
            $stage->setIsPublished(true);
            $models->getModel('stage')->saveEntity($stage);
            echo "Stage {$stageName}\n";
        }
        $stages[$stageName] = $stage;
    }

    // A company two contacts work for.
    $company = $companies->getRepository()->findOneBy(['name' => 'Example Trading']);
    if (!$company) {
        $company = new \Mautic\LeadBundle\Entity\Company();
        $companies->setFieldValues($company, ['companyname' => 'Example Trading', 'companycity' => 'Amman', 'companyemail' => 'info@example.com', 'companywebsite' => 'https://example.com'], true);
        $companies->saveEntity($company);
        echo "Company Example Trading\n";
    }

    // The contacts. The owners are the default accounts: a sales account sees only the contacts it owns.
    $contacts = [
        ['Lina', 'Haddad', 'lina.haddad@example.com', 'Amman', 25, 'sales', ['newsletter'], 'Lead', true],
        ['Omar', 'Saleh', 'omar.saleh@example.com', 'Irbid', 40, 'marketer', ['newsletter', 'vip'], 'Customer', true],
        ['Maya', 'Nasser', 'maya.nasser@example.com', 'Amman', 5, 'marketer', [], 'Lead', false],
        ['Karim', 'Aziz', 'karim.aziz@example.com', 'Aqaba', 15, 'sales', ['vip'], null, false],
        ['Sara', 'Khalil', 'sara.khalil@example.com', 'Zarqa', 0, null, [], null, false],
    ];
    foreach ($contacts as [$first, $last, $email, $city, $points, $owner, $tags, $stageName, $atCompany]) {
        $lead = $leads->getRepository()->findOneBy(['email' => $email]);
        if ($lead) {
            // A contact that is there stays as it is, but gets its owner back: cancelling the default accounts leaves
            // their contacts without one, and adding them again makes new accounts.
            $user = $owner ? site_user($models, $owner) : null;
            if ($user && (!$lead->getOwner() || $lead->getOwner()->getId() !== $user->getId())) {
                $lead->setOwner($user);
                $leads->saveEntity($lead);
                echo "Contact {$first} {$last}: its owner {$owner} again\n";
            }
            continue;
        }
        $lead = new \Mautic\LeadBundle\Entity\Lead();
        $leads->setFieldValues($lead, ['firstname' => $first, 'lastname' => $last, 'email' => $email, 'city' => $city, 'country' => 'Jordan'], true);
        $lead->setPoints($points);
        if ($owner && ($user = site_user($models, $owner))) {
            $lead->setOwner($user);
        }
        if ($stageName) {
            $lead->setStage($stages[$stageName]);
        }
        $leads->saveEntity($lead);
        if ($tags) {
            $leads->modifyTags($lead, $tags);
        }
        if ($atCompany) {
            $companies->addLeadToCompany([$company->getId()], $lead);
        }
        echo "Contact {$first} {$last}\n";
    }

    // Two segments, built by the site's scheduled job (mautic:segments:update).
    $lists = $models->getModel('lead.list');
    $newsletterTag = $em->getRepository(\Mautic\LeadBundle\Entity\Tag::class)->findOneBy(['tag' => 'newsletter']);
    $segments = [
        ['Newsletter readers', 'newsletter-readers', [['glue' => 'and', 'field' => 'tags', 'object' => 'lead', 'type' => 'tags', 'operator' => 'in', 'properties' => ['filter' => [$newsletterTag ? $newsletterTag->getId() : 0]]]]],
        ['Amman contacts', 'amman-contacts', [['glue' => 'and', 'field' => 'city', 'object' => 'lead', 'type' => 'text', 'operator' => '=', 'properties' => ['filter' => 'Amman']]]],
    ];
    foreach ($segments as [$segmentName, $alias, $filters]) {
        if ($lists->getRepository()->findOneBy(['alias' => $alias])) {
            continue;
        }
        $segment = new \Mautic\LeadBundle\Entity\LeadList();
        $segment->setName($segmentName);
        $segment->setPublicName($segmentName);
        $segment->setAlias($alias);
        $segment->setFilters($filters);
        $segment->setIsGlobal(true);
        $segment->setIsPublished(true);
        $lists->saveEntity($segment);
        echo "Segment {$segmentName}\n";
    }

    // A triggered email a form or a campaign sends.
    $emails = $models->getModel('email');
    if (!$emails->getRepository()->findOneBy(['name' => 'Welcome email'])) {
        $email = new \Mautic\EmailBundle\Entity\Email();
        $email->setName('Welcome email');
        $email->setSubject('Welcome to our newsletter');
        $email->setEmailType('template');
        $email->setLanguage('en');
        $email->setTemplate('mautic_code_mode');
        $email->setCustomHtml('<!DOCTYPE html><html><head><title>Welcome to our newsletter</title></head><body><h1>Welcome, {contactfield=firstname}!</h1><p>Thank you for reading our newsletter.</p></body></html>');
        $email->setIsPublished(true);
        $emails->saveEntity($email);
        echo "Email Welcome email\n";
    }

    // A landing page, at /spring-webinar.
    $pages = $models->getModel('page.page');
    if (!$pages->getRepository()->findOneBy(['alias' => 'spring-webinar'])) {
        $page = new \Mautic\PageBundle\Entity\Page();
        $page->setTitle('Spring webinar');
        $page->setAlias('spring-webinar');
        $page->setLanguage('en');
        $page->setTemplate('mautic_code_mode');
        $page->setCustomHtml('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Spring webinar</title></head><body><main><h1>Spring webinar</h1><p>Join our free webinar on marketing automation.</p></main></body></html>');
        $page->setIsPublished(true);
        $pages->saveEntity($page);
        echo "Landing page Spring webinar\n";
    }

    // A file to download, at /asset/<its alias>.
    $assets = $models->getModel('asset.asset');
    if (!$assets->getRepository()->findOneBy(['title' => 'Product brochure'])) {
        $folder = $root.'/media/files';
        if (!is_dir($folder)) {
            mkdir($folder, 0775, true);
        }
        $file = 'product-brochure-'.substr(sha1((string) microtime(true)), 0, 12).'.txt';
        $text = "Product brochure\n\nA sample file of the test site: what the product does, in one page.\n";
        file_put_contents($folder.'/'.$file, $text);
        $asset = new \Mautic\AssetBundle\Entity\Asset();
        $asset->setTitle('Product brochure');
        $asset->setAlias('product-brochure');
        $asset->setStorageLocation('local');
        $asset->setPath($file);
        $asset->setOriginalFileName('product-brochure.txt');
        $asset->setMime('text/plain');
        $asset->setExtension('txt');
        $asset->setSize(strlen($text));
        $asset->setLanguage('en');
        $asset->setIsPublished(true);
        $assets->saveEntity($asset);
        echo "Asset Product brochure\n";
    }

    // A form: a visitor who signs up gets the newsletter tag and ten points.
    $forms = $models->getModel('form.form');
    if (!$forms->getRepository()->findOneBy(['alias' => 'newsletter'])) {
        $form = new \Mautic\FormBundle\Entity\Form();
        $form->setName('Newsletter sign-up');
        $form->setAlias('newsletter');
        $form->setFormType('standalone');
        $form->setPostAction('message');
        $form->setPostActionProperty('Thank you for signing up.');
        $form->setIsPublished(true);
        $forms->setFields($form, [
            'new_email'     => ['label' => 'Email', 'alias' => 'email', 'type' => 'email', 'isRequired' => true, 'mappedObject' => 'contact', 'mappedField' => 'email', 'leadField' => 'email', 'showLabel' => true, 'saveResult' => true],
            'new_firstname' => ['label' => 'First name', 'alias' => 'first_name', 'type' => 'text', 'isRequired' => false, 'mappedObject' => 'contact', 'mappedField' => 'firstname', 'leadField' => 'firstname', 'showLabel' => true, 'saveResult' => true],
            'new_submit'    => ['label' => 'Sign up', 'alias' => 'submit', 'type' => 'button', 'properties' => ['type' => 'submit'], 'showLabel' => true, 'saveResult' => false],
        ]);
        $forms->setActions($form, [
            'new_tags'   => ['name' => 'Add the newsletter tag', 'type' => 'lead.changetags', 'properties' => ['add_tags' => ['newsletter'], 'remove_tags' => []]],
            'new_points' => ['name' => 'Ten points for signing up', 'type' => 'lead.pointschange', 'properties' => ['operator' => 'plus', 'points' => 10, 'group' => null]],
        ]);
        $forms->saveEntity($form);
        echo "Form Newsletter sign-up (/form/{$form->getId()})\n";
    }
}

/** Remove what a test run that was stopped half way left behind: everything named "Webship test …". */
function site_tidy($models, $em): void
{
    $removed = 0;
    $byName = [
        ['lead.list', 'name'], ['lead.company', 'name'], ['form.form', 'name'], ['page.page', 'title'], ['asset.asset', 'title'],
        ['email', 'name'], ['campaign', 'name'], ['point', 'name'], ['stage', 'name'], ['category', 'title'],
    ];
    foreach ($byName as [$model, $field]) {
        $repository = $models->getModel($model)->getRepository();
        $query = $repository->createQueryBuilder('e')->where("e.{$field} LIKE :name")->setParameter('name', 'Webship test%')->getQuery();
        foreach ($query->getResult() as $entity) {
            $models->getModel($model)->deleteEntity($entity);
            ++$removed;
        }
    }
    // Contacts the suite made: a first or last name that starts "Webship test", or an address of the suite's own.
    $leads = $models->getModel('lead.lead');
    $query = $leads->getRepository()->createQueryBuilder('l')
        ->where('l.firstname LIKE :name OR l.lastname LIKE :name OR l.email LIKE :address')
        ->setParameter('name', 'Webship test%')->setParameter('address', 'webship-test%')
        ->getQuery();
    foreach ($query->getResult() as $lead) {
        $leads->deleteEntity($lead);
        ++$removed;
    }
    // Tags the suite made.
    foreach ($em->getRepository(\Mautic\LeadBundle\Entity\Tag::class)->createQueryBuilder('t')->where('t.tag LIKE :tag')->setParameter('tag', 'webship-test%')->getQuery()->getResult() as $tag) {
        $em->remove($tag);
        ++$removed;
    }
    // Notes the suite wrote.
    foreach ($em->getRepository(\Mautic\LeadBundle\Entity\LeadNote::class)->createQueryBuilder('n')->where('n.text LIKE :text')->setParameter('text', '%Webship test%')->getQuery()->getResult() as $note) {
        $em->remove($note);
        ++$removed;
    }
    $em->flush();
    echo "Removed {$removed} piece(s) of test content.\n";
}
