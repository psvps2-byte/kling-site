import LegalShell from "../components/LegalShell";

export default function TermsPage() {
  return (
    <LegalShell
      title={{ uk: "Умови користування", en: "Terms & Conditions" }}
    >
      {{
        uk: (
          <>
            <p>
              VILNA — це онлайн-сервіс для генерації зображень та відео за допомогою
              штучного інтелекту.
            </p>

            <p>
              Користувач купує внутрішні бали, які можуть бути використані
              виключно всередині сервісу для створення контенту.
            </p>

            <p>
              Бали не є грошовими коштами та не можуть бути передані третім особам.
            </p>

            <p>
              Користувач несе відповідальність за контент, який створює за
              допомогою сервісу, та зобовʼязується не використовувати сервіс для
              створення заборонених матеріалів.
            </p>

            <p>
              Адміністрація сервісу залишає за собою право змінювати умови роботи
              сервісу без попереднього повідомлення.
            </p>
          </>
        ),
        en: (
          <>
            <p>
              VILNA is an online service for generating images and videos using
              artificial intelligence.
            </p>

            <p>
              Users purchase internal points that can be used only within the
              service to generate content.
            </p>

            <p>
              Points are not money and cannot be transferred to third parties.
            </p>

            <p>
              Users are responsible for the content they generate and agree not
              to use the service for prohibited or illegal materials.
            </p>

            <p>
              The service administration reserves the right to change these
              terms without prior notice.
            </p>
          </>
        ),
      }}
    </LegalShell>
  );
}
