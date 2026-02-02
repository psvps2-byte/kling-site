import LegalShell from "../components/LegalShell";

export default function PricingPage() {
  return (
    <LegalShell
      title={{ uk: "Тарифи", en: "Pricing" }}
      email="contact.vilna.pro@gmail.com"
    >
      {{
        uk: (
          <>
            <p>
              VILNA — онлайн-сервіс для генерації зображень та відео за допомогою
              штучного інтелекту. Оплата здійснюється шляхом придбання внутрішніх
              балів, які використовуються всередині сервісу для створення
              контенту.
            </p>

            <h3>Пакети балів</h3>

            <ul>
              <li>
                <b>Starter</b> — $7 — <b>140 балів</b>
              </li>
              <li>
                <b>Plus</b> — $20 — <b>440 балів</b>
              </li>
              <li>
                <b>Pro</b> — $50 — <b>1200 балів</b>
              </li>
              <li>
                <b>Max</b> — $100 — <b>2600 балів</b>
              </li>
              <li>
                <b>Ultra</b> — $200 — <b>5600 балів</b>
              </li>
            </ul>

            <h3>Що входить у послугу</h3>
            <ul>
              <li>генерація зображень за текстовим описом;</li>
              <li>генерація відео за текстовим описом;</li>
              <li>збереження результатів у кабінеті користувача.</li>
            </ul>

            <p>
              <b>Важливо:</b> Бали є внутрішньою одиницею сервісу та не є
              грошовими коштами. Бали не можуть бути передані третім особам або
              обміняні на готівку.
            </p>
          </>
        ),
        en: (
          <>
            <p>
              VILNA is an online service for generating images and videos using
              artificial intelligence. Payments are made by purchasing internal
              credits that can be used only within the service to create
              content.
            </p>

            <h3>Credit packages</h3>

            <ul>
              <li>
                <b>Starter</b> — $7 — <b>140 credits</b>
              </li>
              <li>
                <b>Plus</b> — $20 — <b>440 credits</b>
              </li>
              <li>
                <b>Pro</b> — $50 — <b>1200 credits</b>
              </li>
              <li>
                <b>Max</b> — $100 — <b>2600 credits</b>
              </li>
              <li>
                <b>Ultra</b> — $200 — <b>5600 credits</b>
              </li>
            </ul>

            <h3>What the service includes</h3>
            <ul>
              <li>image generation from text prompts;</li>
              <li>video generation from text prompts;</li>
              <li>saving results in the user account.</li>
            </ul>

            <p>
              <b>Important:</b> Credits are an internal unit of the service and
              are not money. Credits cannot be transferred to third parties or
              exchanged for cash.
            </p>
          </>
        ),
      }}
    </LegalShell>
  );
}
