// Replace only the isolated test package with normal lib/main.dart after tests.
// No production package, release signing, credential embedding or data clearing.
if (process.env.REZONA_PHASE5_QA !== '1') throw Error('Explicit Phase5 QA flag required');
const fs = require('node:fs'),
  path = require('node:path'),
  { createHash } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  mobile = path.resolve(root, '../AboEssaMobile/apps/admin_app');
const out = path.join(root, 'docs/benchmarks/phase5/device'),
  buildFile = path.join(out, 'build.json');
const serial = '2b6f28b2',
  pkg = 'com.singlestore.admin_app.phase5qa',
  adb = 'C:/Users/3ma/AppData/Local/Android/sdk/platform-tools/adb.exe';
const hash = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function shell(args) {
  const r = spawnSync(adb, ['-s', serial, ...args], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw Error(r.stderr || r.stdout);
  return r.stdout.trim();
}
(async () => {
  if (shell(['shell', 'getprop', 'ro.product.model']) !== '23073RPBFG')
    throw Error('Unexpected QA device');
  const testBuild = JSON.parse(fs.readFileSync(buildFile, 'utf8'));
  const capture = JSON.parse(fs.readFileSync(path.join(out, 'capture.json'), 'utf8'));
  const restore = JSON.parse(fs.readFileSync(path.join(out, 'restore.json'), 'utf8'));
  if (
    !capture.passed ||
    !(restore.passed || restore.corePassed) ||
    capture.installedSha256 !== testBuild.apk.sha256 ||
    restore.installedSha256 !== testBuild.apk.sha256
  )
    throw Error('Matching native core-workflow evidence required before replacing test target');
  if (!restore.passed)
    console.log(
      'Core workflow passed; legacy benchmark remains incomplete. Normal preview is isolated QA only.',
    );
  const apk = path.join(mobile, 'build/app/outputs/flutter-apk/app-debug.apk');
  if (hash(apk) !== testBuild.apk.sha256) throw Error('Unexpected test APK content');
  const archive = `D:/rezona-phase5-qa/test-${testBuild.apk.sha256.slice(0, 16)}.apk`;
  if (fs.existsSync(archive)) {
    if (hash(archive) !== testBuild.apk.sha256) throw Error('Archive conflict; not overwriting');
  } else fs.copyFileSync(apk, archive);
  testBuild.archivedApk = archive;
  fs.writeFileSync(buildFile, JSON.stringify(testBuild, null, 2));
  const defs = Object.fromEntries(
    Object.entries(
      JSON.parse(fs.readFileSync('D:/rezona-phase5-qa/device-defines.json', 'utf8')),
    ).filter(([k]) => !k.startsWith('PHASE5_')),
  );
  if (defs.API_BASE_URL !== 'http://127.0.0.1:58463' || defs.APP_ENV !== 'local')
    throw Error('Unexpected QA configuration');
  const encoded = Object.entries(defs)
    .map(([k, v]) => Buffer.from(`${k}=${v}`).toString('base64'))
    .join(',');
  const args = [
    '/d',
    '/c',
    path.join(mobile, 'android/gradlew.bat'),
    '--no-daemon',
    '-Ptarget-platform=android-arm,android-arm64,android-x64',
    '-Ptarget=lib/main.dart',
    '-Pbase-application-name=android.app.Application',
    `-Pdart-defines=${encoded}`,
    '-Pdart-obfuscation=false',
    '-Ptrack-widget-creation=true',
    '-Ptree-shake-icons=false',
    'assembleDebug',
  ];
  const log = path.join(out, `preview-build-${Date.now()}.log`);
  await new Promise((resolve, reject) => {
    const c = spawn('cmd.exe', args, {
      cwd: path.join(mobile, 'android'),
      env: { ...process.env, REZONA_PHASE5_QA: '1' },
      windowsHide: true,
    });
    const append = (d) => {
      fs.appendFileSync(log, d);
      if (/BUILD SUCCESSFUL|FAILURE|failed/.test(d.toString())) process.stdout.write(d);
    };
    c.stdout.on('data', append);
    c.stderr.on('data', append);
    c.on('error', reject);
    c.on('exit', (code) =>
      code === 0 ? resolve() : reject(Error(`Preview build exited ${code}`)),
    );
  });
  const badging = spawnSync(
    'C:/Users/3ma/AppData/Local/Android/sdk/build-tools/36.0.0/aapt.exe',
    ['dump', 'badging', apk],
    { encoding: 'utf8', windowsHide: true },
  );
  if (badging.status !== 0 || !badging.stdout.includes(`package: name='${pkg}'`))
    throw Error('Refusing to install unexpected package');
  const artifactSha = hash(apk);
  console.log(shell(['install', '-r', apk]));
  shell(['reverse', 'tcp:58463', 'tcp:58463']);
  shell(['shell', 'am', 'force-stop', pkg]);
  shell(['shell', 'am', 'start', '-n', `${pkg}/com.singlestore.admin_app.MainActivity`]);
  const result = {
    time: new Date().toISOString(),
    package: pkg,
    entryPoint: 'lib/main.dart',
    mode: 'normal admin UI / debug / isolated USB loopback',
    testArtifactArchived: archive,
    previewSha256: artifactSha,
    previewBytes: fs.statSync(apk).size,
    qaCredentialsEmbedded: false,
    automatedIntakeTestEntryPoint: false,
    installationSucceeded: true,
    launchRequestAccepted: true,
    uiVerified: false,
    log: path.relative(root, log).replaceAll('\\', '/'),
  };
  fs.writeFileSync(path.join(out, 'preview.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
