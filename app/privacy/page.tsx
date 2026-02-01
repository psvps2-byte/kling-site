import LegalShell from "../components/LegalShell";

export default function PrivacyPage() {
  return (
    <LegalShell
      title={{ uk: "Політика конфіденційності", en: "Privacy Policy" }}
    >
      {{
        uk: (
          <>
            <p>
              Ми поважаємо вашу конфіденційність та зобовʼязуємося захищати
              персональні дані користувачів сервісу VILNA.
            </p>

            <p>
              Ми можемо збирати такі дані: адресу електронної пошти, технічну
              інформацію про пристрій та браузер, а також інформацію, необхідну
              для обробки платежів.
            </p>

            <p>
              Оплата обробляється платіжним провайдером. Ми не зберігаємо дані
              банківських карток користувачів.
            </p>

            <p>
              Зібрані дані використовуються виключно для надання послуг,
              покращення роботи сервісу та звʼязку з користувачем.
            </p>

            <p>
              Користуючись сервісом, ви погоджуєтесь з цією Політикою
              конфіденційності.
            </p>
          </>
        ),
        en: (
          <>
            <p>
              We respect your privacy and are committed to protecting the
              personal data of VILNA service users.
            </p>

            <p>
              We may collect the following data: email address, technical
              information about your device and browser, and information
              required to process payments.
            </p>

            <p>
              Payments are processed by a payment provider. We do not store
              users’ card details.
            </p>

            <p>
              Collected data is used only to provide the service, improve the
              platform, and communicate with users.
            </p>

            <p>
              By using the service, you agree to this Privacy Policy.
            </p>
          </>
        ),
      }}
    </LegalShell>
  );
}
