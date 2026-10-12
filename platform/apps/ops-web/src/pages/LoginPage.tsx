import { useState } from 'react';
import { Button, Input, MessagePlugin } from 'tdesign-react';
import { Field, Fields } from '../components/Field';
import { ApiError, login } from '../lib/api';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await login(email, password, totp);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'TOTP_REQUIRED') setNeedTotp(true);
      MessagePlugin.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="box">
        <h2>Ship Operations</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          สำหรับทีมปฏิบัติการและผู้ดูแลระบบ
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Fields>
          <Field label="อีเมล">
            <Input value={email} onChange={(v) => setEmail(String(v))} autocomplete="username" />
          </Field>
          <Field label="รหัสผ่าน">
            <Input type="password" value={password} onChange={(v) => setPassword(String(v))} autocomplete="current-password" />
          </Field>
          {needTotp && (
            <Field label="รหัส 2FA (6 หลัก)">
              <Input value={totp} onChange={(v) => setTotp(String(v))} maxlength={6} />
            </Field>
          )}
          <Button type="submit" theme="primary" block loading={busy}>
            เข้าสู่ระบบ
          </Button>
          </Fields>
        </form>
      </div>
    </div>
  );
}
