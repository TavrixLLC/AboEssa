import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const legalFile = (name: string) =>
  readFileSync(resolve(__dirname, '../../public/legal', name), 'utf8');

describe('public legal pages', () => {
  it.each(['account-deletion.html', 'privacy-policy.html'])(
    '%s identifies the same app as the Play listing',
    (name) => {
      const html = legalFile(name);
      expect(html).toContain('ريزونا');
      expect(html).toContain('REZONA');
      expect(html).toContain('com.tavrix.aboessa_customer_app');
      expect(html).toContain('/legal/legal.css?v=20261109');
      expect(html).not.toMatch(/شناشيل|Shanashil/i);
    },
  );

  it('does not retain the old brand initial in the shared stylesheet', () => {
    const css = legalFile('legal.css');
    expect(css).toContain('content: "R"');
    expect(css).not.toContain('content: "ش"');
  });

  it('keeps the public deletion form and explicit instructions available', () => {
    const html = legalFile('account-deletion.html');
    expect(html).toContain('id="deletion-form"');
    expect(html).toContain('id="deletion-steps"');
    expect(html).toContain('minlength="1" maxlength="128"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('/legal/account-deletion.js?v=20261109');
  });

  it('retains password reauthentication and the irreversible-delete prompt', () => {
    const script = legalFile('account-deletion.js');
    expect(script).toContain('/api/auth/customer/delete-account-request');
    expect(script).toContain('window.confirm(');
    expect(script).toContain('password: password.value');
    expect(script).toContain('حساب ريزونا');
    expect(script).not.toMatch(/شناشيل|Shanashil/i);
  });
});
