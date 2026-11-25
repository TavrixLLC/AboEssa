(() => {
  'use strict';
  const form = document.querySelector('#deletion-form');
  const phone = document.querySelector('#phone');
  const password = document.querySelector('#password');
  const button = document.querySelector('#submit-button');
  const status = document.querySelector('#form-status');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.className = 'status';
    if (!form.reportValidity()) return;
    if (!window.confirm('هل أنت متأكد؟ حذف الحساب نهائي ولا يمكن التراجع عنه.')) return;

    button.disabled = true;
    status.textContent = 'جارٍ حذف الحساب…';
    try {
      const response = await fetch('/api/auth/customer/delete-account-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        cache: 'no-store',
        body: JSON.stringify({ phone: phone.value.trim(), password: password.value }),
      });
      password.value = '';
      if (!response.ok) {
        throw new Error('request_failed');
      }
      form.reset();
      form.hidden = true;
      status.className = 'status success';
      status.textContent = 'تم حذف حساب ريزونا وبياناته الشخصية بنجاح.';
      form.insertAdjacentElement('afterend', status);
    } catch (_) {
      status.className = 'status error';
      status.textContent = 'تعذر حذف الحساب. تحقق من رقم الهاتف وكلمة المرور ثم حاول مرة أخرى.';
    } finally {
      button.disabled = false;
    }
  });
})();
