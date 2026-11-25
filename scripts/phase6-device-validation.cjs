if (process.env.REZONA_PHASE6_QA !== '1') throw Error('Explicit Phase 6 QA flag required');
const fs = require('node:fs'),
  path = require('node:path'),
  { createHash } = require('node:crypto'),
  { spawn, spawnSync } = require('node:child_process');
const stage = process.argv[2];
if (!['build', 'test', 'preview'].includes(stage)) throw Error('Choose build/test/preview');
const root = path.resolve(__dirname, '..'),
  mobile = path.resolve(root, '../AboEssaMobile/apps/admin_app');
const out = path.join(root, 'docs/benchmarks/phase6/device');
fs.mkdirSync(out, { recursive: true });
const log = path.join(out, `${stage}-${Date.now()}.log`),
  adb = 'C:/Users/3ma/AppData/Local/Android/sdk/platform-tools/adb.exe';
const serial = '2b6f28b2',
  pkg = 'com.singlestore.admin_app.phase6qa';
const apk = path.join(mobile, 'build/app/outputs/flutter-apk/app-debug.apk');
let output = '';
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function append(data) {
  const s = data
    .toString()
    .replace(/http:\/\/127\.0\.0\.1:\d+\/[^\s]+/g, '[local VM URI redacted]');
  output += s;
  fs.appendFileSync(log, s);
  for (const line of s.split(/\r?\n/))
    if (
      /PHASE6_DEVICE_RESULT|Success|BUILD SUCCESSFUL|failed|FAILURE|Error|EXCEPTION|test passed/.test(
        line,
      )
    )
      console.log(line);
}
function shell(args, allow = false) {
  const r = spawnSync(adb, ['-s', serial, ...args], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0 && !allow) throw Error(r.stderr || r.stdout);
  return r.stdout.trim();
}
function command(exe, args, cwd = mobile) {
  return new Promise((resolve, reject) => {
    const c = spawn('cmd.exe', ['/d', '/c', exe, ...args], {
      cwd,
      windowsHide: true,
      env: {
        ...process.env,
        REZONA_PHASE6_QA: '1',
        REZONA_PHASE5_QA: '0',
        JAVA_HOME: 'C:/Program Files/Android/Android Studio/jbr',
      },
    });
    c.stdout.on('data', append);
    c.stderr.on('data', append);
    c.on('error', reject);
    c.on('exit', (code) => (code === 0 ? resolve() : reject(Error('Command exited ' + code))));
  });
}
function verifyPackage() {
  const r = spawnSync(
    'C:/Users/3ma/AppData/Local/Android/sdk/build-tools/36.0.0/aapt.exe',
    ['dump', 'badging', apk],
    { encoding: 'utf8', windowsHide: true },
  );
  if (r.status !== 0 || !r.stdout.includes(`package: name='${pkg}'`))
    throw Error('Unexpected APK: refusing install');
}
(async () => {
  if (stage !== 'build') {
    if (shell(['shell', 'getprop', 'ro.product.model']) !== '23073RPBFG')
      throw Error('Unexpected QA tablet');
    shell(['reverse', 'tcp:58473', 'tcp:58473']);
  }
  if (stage === 'build' || stage === 'preview') {
    const raw = JSON.parse(fs.readFileSync('D:/rezona-phase6-qa/device-defines.json', 'utf8'));
    if (raw.API_BASE_URL !== 'http://127.0.0.1:58473' || raw.AI_RECOGNITION_ENABLED !== 'true')
      throw Error('Unexpected QA config');
    if (stage === 'preview') {
      const old = JSON.parse(fs.readFileSync(path.join(out, 'build.json'), 'utf8'));
      if (hash(apk) !== old.sha256) throw Error('Archive must match tested APK');
      const archive = `D:/rezona-phase6-qa/test-${old.sha256.slice(0, 16)}.apk`;
      if (fs.existsSync(archive)) {
        if (hash(archive) !== old.sha256) throw Error('Archive conflict');
      } else fs.copyFileSync(apk, archive);
    }
    const defs = Object.fromEntries(
      Object.entries(raw).filter(([k]) => stage !== 'preview' || !k.startsWith('PHASE5_')),
    );
    const encoded = Object.entries(defs)
      .map(([k, v]) => Buffer.from(`${k}=${v}`).toString('base64'))
      .join(',');
    await command(
      path.join(mobile, 'android/gradlew.bat'),
      [
        process.env.PHASE6_OFFLINE_BUILD === '1' ? '--offline' : '--no-daemon',
        ...(process.env.PHASE6_OFFLINE_BUILD === '1'
          ? ['--init-script', path.join(root, 'scripts/phase6-qa.init.gradle')]
          : []),
        '-Ptarget-platform=android-arm64',
        `-Ptarget=${stage === 'preview' ? 'lib/main.dart' : 'integration_test/phase6_recognition_device_test.dart'}`,
        '-Pbase-application-name=android.app.Application',
        `-Pdart-defines=${encoded}`,
        '-Pdart-obfuscation=false',
        '-Ptrack-widget-creation=true',
        '-Ptree-shake-icons=false',
        'assembleDebug',
      ],
      path.join(mobile, 'android'),
    );
    verifyPackage();
    const result = {
      time: new Date().toISOString(),
      package: pkg,
      entryPoint:
        stage === 'preview'
          ? 'lib/main.dart'
          : 'integration_test/phase6_recognition_device_test.dart',
      mode: 'debug QA only; no release/WAN/live AI',
      sha256: hash(apk),
      bytes: fs.statSync(apk).size,
      sourceHashes: Object.fromEntries(
        fs
          .readdirSync(path.join(mobile, 'lib/features/product_intake'))
          .filter((f) => f.endsWith('.dart'))
          .map((f) => [f, hash(path.join(mobile, 'lib/features/product_intake', f))]),
      ),
      passed: true,
    };
    fs.writeFileSync(
      path.join(out, stage === 'build' ? 'build.json' : 'preview.json'),
      JSON.stringify(result, null, 2),
    );
    if (stage === 'build') {
      console.log('Built and verified Phase 6 test-only APK; no installation yet.');
      return;
    }
    console.log(shell(['install', '-r', apk]));
    shell(['shell', 'am', 'force-stop', pkg]);
    shell(['shell', 'am', 'start', '-n', `${pkg}/com.singlestore.admin_app.MainActivity`]);
    console.log('Normal Phase 6 QA preview launched; no automatic stock test entrypoint.');
    return;
  }
  verifyPackage();
  const built = JSON.parse(fs.readFileSync(path.join(out, 'build.json'), 'utf8'));
  if (hash(apk) !== built.sha256) throw Error('Build hash changed');
  console.log(shell(['install', '-r', apk]));
  const installed = shell(['shell', 'pm', 'path', pkg]).replace(/^package:/, '');
  if (
    !installed.includes('/' + pkg + '-') ||
    shell(['shell', 'sha256sum', installed]).split(/\s+/)[0] !== built.sha256
  )
    throw Error('Installed QA hash mismatch');
  shell(['shell', 'am', 'force-stop', pkg]);
  shell(['shell', 'am', 'start', '-n', `${pkg}/com.singlestore.admin_app.MainActivity`]);
  let uri;
  for (let i = 0; i < 100; i++) {
    const pid = shell(['shell', 'pidof', pkg], true);
    if (pid) {
      const lines = shell(['logcat', `--pid=${pid}`, '-d', '-v', 'raw', '-s', 'flutter:I']);
      uri = lines.match(
        /The Dart VM service is listening on (http:\/\/127\.0\.0\.1:\d+\/\S+)/,
      )?.[1];
    }
    if (uri) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!uri) throw Error('QA VM service not found');
  const parsed = new URL(uri),
    port = shell(['forward', 'tcp:0', `tcp:${parsed.port}`]);
  try {
    await command('C:/Users/3ma/develop/flutter/bin/flutter.bat', [
      'drive',
      `--use-existing-app=http://127.0.0.1:${port}${parsed.pathname}`,
      '--driver=test_driver/phase6_driver.dart',
      '--no-pub',
      '-d',
      serial,
    ]);
  } finally {
    shell(['forward', '--remove', `tcp:${port}`]);
  }
  const marker = output.split(/\r?\n/).find((l) => l.includes('PHASE6_DEVICE_RESULT '));
  const observed = marker
    ? JSON.parse(marker.slice(marker.indexOf('PHASE6_DEVICE_RESULT ') + 21))
    : null;
  const result = {
    time: new Date().toISOString(),
    package: pkg,
    serial,
    sha256: built.sha256,
    observed,
    passed: observed?.passed === true,
  };
  fs.writeFileSync(path.join(out, 'test.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) throw Error('No successful physical test evidence');
})().catch((error) => {
  const result = {
    time: new Date().toISOString(),
    stage,
    passed: false,
    error: error.message,
    note: 'No uninstall/data-clear fallback; originals untouched',
  };
  fs.writeFileSync(
    path.join(out, `${stage}-failure-${Date.now()}.json`),
    JSON.stringify(result, null, 2),
  );
  console.error(error.message);
  process.exitCode = 1;
});
