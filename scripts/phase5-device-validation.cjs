// Explicit install -r only: NEVER use flutter test's automatic install/cleanup.
// Restore launches the SAME installed APK after force-stop, without reinstall.
if (process.env.REZONA_PHASE5_QA !== '1') throw Error('Explicit Phase 5 QA flag required');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs'),
  path = require('node:path');
const { createHash } = require('node:crypto');
const stage = process.argv[2];
if (!['build', 'capture', 'restore'].includes(stage))
  throw Error('Choose build, capture or restore');
const root = path.resolve(__dirname, '..'),
  mobile = path.resolve(root, '../AboEssaMobile/apps/admin_app');
const adb = 'C:/Users/3ma/AppData/Local/Android/sdk/platform-tools/adb.exe',
  serial = '2b6f28b2',
  pkg = 'com.singlestore.admin_app.phase5qa';
const flutter = 'C:/Users/3ma/develop/flutter/bin/flutter.bat';
const out = path.join(root, 'docs/benchmarks/phase5/device');
fs.mkdirSync(out, { recursive: true });
const log = path.join(out, `${stage}-${Date.now()}.log`);
let output = '';
function append(data) {
  const s = data
    .toString()
    .replace(/http:\/\/127\.0\.0\.1:\d+\/[^\s]+/g, '[local VM URI redacted]')
    .replace(/(Idempotency-Key[:=]\s*)[^,}\s]+/gi, '$1[redacted]');
  output += s;
  fs.appendFileSync(log, s);
  for (const line of s.split(/\r?\n/))
    if (
      /PHASE5_DEVICE_RESULT|Success|Built |failed|Error|EXCEPTION|test passed|All tests passed|Phase5 native/.test(
        line,
      )
    )
      console.log(line);
}
function shell(args, allowFailure = false) {
  const r = spawnSync(adb, ['-s', serial, ...args], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0 && !allowFailure)
    throw Error(r.stderr || r.stdout || `ADB command failed: ${args[0]}`);
  return r.stdout;
}
function command(args, executable = flutter, cwd = mobile) {
  return new Promise((resolve, reject) => {
    const c = spawn('cmd.exe', ['/d', '/c', executable, ...args], {
      cwd,
      env: { ...process.env, REZONA_PHASE5_QA: '1' },
      windowsHide: true,
    });
    c.stdout.on('data', append);
    c.stderr.on('data', append);
    c.on('exit', (code) =>
      code === 0 ? resolve() : reject(Error(`Build/driver command exited ${code}`)),
    );
    c.on('error', reject);
  });
}
(async () => {
  const model = shell(['shell', 'getprop', 'ro.product.model']).trim();
  if (model !== '23073RPBFG') throw Error('Unexpected physical device');
  shell(['reverse', 'tcp:58463', 'tcp:58463']);
  if (stage === 'capture' || stage === 'build') {
    if (process.env.PHASE5_SKIP_BUILD === '1') {
      append('Using previously built QA test APK; package verified below.\n');
    } else if (
      process.env.PHASE5_OFFLINE_BUILD === '1' ||
      process.env.PHASE5_GRADLE_DIRECT === '1'
    ) {
      const defines = {
        ...JSON.parse(fs.readFileSync('D:/rezona-phase5-qa/device-defines.json', 'utf8')),
        PHASE5_DEVICE_STAGE: 'auto',
      };
      const encoded = Object.entries(defines)
        .map(([k, v]) => Buffer.from(`${k}=${v}`).toString('base64'))
        .join(',');
      await command(
        [
          ...(process.env.PHASE5_OFFLINE_BUILD === '1' ? ['--offline'] : ['--no-daemon']),
          '-Ptarget-platform=android-arm,android-arm64,android-x64',
          '-Ptarget=integration_test/phase5_intake_device_test.dart',
          '-Pbase-application-name=android.app.Application',
          `-Pdart-defines=${encoded}`,
          '-Pdart-obfuscation=false',
          '-Ptrack-widget-creation=true',
          '-Ptree-shake-icons=false',
          'assembleDebug',
        ],
        path.join(mobile, 'android/gradlew.bat'),
        path.join(mobile, 'android'),
      );
    } else
      await command([
        'build',
        'apk',
        '--debug',
        '--no-pub',
        '-t',
        'integration_test/phase5_intake_device_test.dart',
        '--dart-define-from-file=D:/rezona-phase5-qa/device-defines.json',
        '--dart-define=PHASE5_DEVICE_STAGE=auto',
      ]);
    const apk = path.join(mobile, 'build/app/outputs/flutter-apk/app-debug.apk');
    const badging = spawnSync(
      'C:/Users/3ma/AppData/Local/Android/sdk/build-tools/36.0.0/aapt.exe',
      ['dump', 'badging', apk],
      { encoding: 'utf8', windowsHide: true },
    );
    if (badging.status !== 0 || !badging.stdout.includes(`package: name='${pkg}'`))
      throw Error('Refusing to install an unexpected APK package');
    if (process.env.PHASE5_SKIP_BUILD !== '1') {
      const sourceFiles = [
        ...fs
          .readdirSync(path.join(mobile, 'lib/features/product_intake'))
          .filter((f) => f.endsWith('.dart'))
          .map((f) => path.join(mobile, 'lib/features/product_intake', f)),
        path.join(mobile, 'integration_test/phase5_intake_device_test.dart'),
        path.join(mobile, 'android/app/build.gradle.kts'),
      ];
      const hash = (f) => ({
        file: path.relative(path.resolve(root, '..'), f).replaceAll('\\', '/'),
        sha256: createHash('sha256').update(fs.readFileSync(f)).digest('hex'),
      });
      fs.writeFileSync(
        path.join(out, 'build.json'),
        JSON.stringify(
          {
            time: new Date().toISOString(),
            package: pkg,
            mode: 'debug test-only, not store/release',
            apk: { ...hash(apk), bytes: fs.statSync(apk).size },
            sources: sourceFiles.map(hash),
            passed: true,
          },
          null,
          2,
        ),
      );
    }
    if (stage === 'build') {
      console.log('Built and verified separate QA APK; no installation attempted.');
      return;
    }
    if (process.env.PHASE5_ALREADY_INSTALLED !== '1') append(shell(['install', '-r', apk]));
  }
  if (!shell(['shell', 'pm', 'list', 'packages', pkg]).includes(`package:${pkg}`))
    throw Error('QA package not installed; stopped without deletion');
  const installedPath = shell(['shell', 'pm', 'path', pkg])
    .trim()
    .replace(/^package:/, '');
  if (!/^\/data\/app\/.+\/com\.singlestore\.admin_app\.phase5qa-.+\/base\.apk$/.test(installedPath))
    throw Error('Unexpected installed QA path');
  const installedSha256 = shell(['shell', 'sha256sum', installedPath]).trim().split(/\s+/)[0];
  const built = JSON.parse(fs.readFileSync(path.join(out, 'build.json'), 'utf8'));
  if (installedSha256 !== built.apk.sha256)
    throw Error('Installed QA artifact differs from current tested build');
  if (process.env.PHASE5_ATTACH_RUNNING !== '1') {
    shell(['shell', 'am', 'force-stop', pkg]);
    const component = shell(['shell', 'cmd', 'package', 'resolve-activity', '--brief', pkg])
      .trim()
      .split(/\r?\n/)
      .at(-1);
    if (!component.startsWith(pkg + '/')) throw Error('Unexpected activity');
    shell(['shell', 'am', 'start', '-n', component]);
  }
  let uri;
  for (let i = 0; i < 100; i++) {
    const pid = shell(['shell', 'pidof', pkg], true).trim();
    if (pid) {
      const lines = shell(['logcat', `--pid=${pid}`, '-d', '-v', 'raw', '-s', 'flutter:I']);
      uri = lines.match(
        /The Dart VM service is listening on (http:\/\/127\.0\.0\.1:\d+\/\S+)/,
      )?.[1];
    }
    if (uri) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!uri) throw Error('QA Dart VM service not found');
  const parsed = new URL(uri),
    port = shell(['forward', 'tcp:0', `tcp:${parsed.port}`]).trim();
  let driverExitFailed = false;
  try {
    await command([
      'drive',
      `--use-existing-app=http://127.0.0.1:${port}${parsed.pathname}`,
      '--driver=test_driver/phase5_driver.dart',
      '--no-pub',
      '-d',
      serial,
    ]);
  } catch (error) {
    driverExitFailed = true;
    console.error(error.message);
  } finally {
    shell(['forward', '--remove', `tcp:${port}`]);
  }
  const marker = output.split(/\r?\n/).find((l) => l.includes('PHASE5_DEVICE_RESULT '));
  const observed = marker
    ? JSON.parse(marker.slice(marker.indexOf('PHASE5_DEVICE_RESULT ') + 21))
    : null;
  const result = {
    time: new Date().toISOString(),
    stage,
    device: { serial, model },
    package: pkg,
    installedSha256,
    mode: 'debug, physical, isolated USB loopback (not WAN)',
    log: path.relative(root, log).replaceAll('\\', '/'),
    observed,
    corePassed:
      observed?.phase5CorePassed === true || (stage === 'capture' && observed?.passed === true),
    driverExitFailed,
    passed: !driverExitFailed && observed?.passed === true && observed.stage === stage,
  };
  fs.writeFileSync(path.join(out, `${stage}.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
})().catch((e) => {
  const failure = {
    time: new Date().toISOString(),
    stage,
    package: pkg,
    passed: false,
    error: e.message,
    log: path.relative(root, log).replaceAll('\\', '/'),
    note: 'No uninstall or data-clear fallback in this runner',
  };
  fs.writeFileSync(
    path.join(out, `${stage}-failure-${Date.now()}.json`),
    JSON.stringify(failure, null, 2),
  );
  console.error(e.message);
  process.exitCode = 1;
});
