import LegalShell from "../components/LegalShell";

export default function TermsPage() {
  return (
    <LegalShell
      title={{ uk: "Договір оферти", en: "Public Offer (Terms)" }}
      email="contact.vilna.pro@gmail.com"
    >
      {{
        uk: (
          <>
            <h2>ДОГОВІР ПУБЛІЧНОЇ ОФЕРТИ (УМОВИ КОРИСТУВАННЯ)</h2>
            <p>
              Цей документ є публічною офертою ФОП Глущенко Павло Сергійович (далі —{" "}
              <b>“Виконавець”</b>) та визначає умови надання доступу до онлайн-сервісу VILNA
              (далі — <b>“Сервіс”</b>) будь-якій дієздатній особі (далі —{" "}
              <b>“Користувач”</b>).
            </p>
            <p>
              Користуючись Сервісом та/або здійснюючи оплату, Користувач підтверджує, що
              ознайомився з цими Умовами, розуміє їх та приймає їх у повному обсязі.
            </p>

            <h3>1. Терміни та визначення</h3>
            <p>
              <b>Бали (кредити)</b> — внутрішня облікова одиниця Сервісу, що використовується
              для оплати генерації контенту всередині Сервісу. Бали не є грошовими коштами,
              не є електронними грошима, не підлягають обміну на готівку та можуть
              використовуватися виключно в межах Сервісу.
            </p>
            <p>
              <b>Контент</b> — результати генерації (зображення/відео та пов’язані дані), які
              Користувач створює за допомогою Сервісу.
            </p>

            <h3>2. Предмет договору</h3>
            <p>
              Виконавець надає Користувачу доступ до функціоналу Сервісу для генерації
              зображень та/або відео на основі запитів Користувача, а Користувач зобов’язується
              дотримуватися цих Умов та, у разі потреби, сплачувати вартість пакетів Балів
              згідно з тарифами, розміщеними на сайті.
            </p>

            <h3>3. Реєстрація та доступ</h3>
            <ul>
              <li>Для користування Сервісом може бути необхідна реєстрація/вхід.</li>
              <li>Користувач відповідає за збереження доступу до свого акаунта.</li>
              <li>
                Виконавець може обмежити або припинити доступ у разі порушення Умов або
                законодавства.
              </li>
            </ul>

            <h3>4. Тарифи та оплата</h3>
            <ul>
              <li>
                Оплата здійснюється шляхом придбання пакетів Балів. Актуальні тарифи
                оприлюднюються на сторінці “Тарифи/Ціни” на сайті.
              </li>
              <li>
                Обробку платежів здійснює платіжний провайдер. Дані платіжних карток
                Користувача не зберігаються Виконавцем.
              </li>
              <li>
                Після успішної оплати Бали зараховуються на баланс Користувача. Зазвичай це
                відбувається миттєво, але в окремих випадках може займати до 5 хвилин.
              </li>
            </ul>

            <h3>5. Повернення коштів</h3>
            <ul>
              <li>
                Користувач може звернутися із запитом на повернення коштів за{" "}
                <b>невикористані</b> Бали протягом <b>14 календарних днів</b> з моменту покупки.
              </li>
              <li>
                Якщо Бали були використані частково або повністю, повернення коштів за такий
                платіж не здійснюється.
              </li>
              <li>
                Запит на повернення подається на email підтримки:{" "}
                <b>contact.vilna.pro@gmail.com</b>. Розгляд запиту — до <b>5 робочих днів</b>.
              </li>
            </ul>

            <h3>6. Правила використання та заборонений контент</h3>
            <p>
              Користувач зобов’язується не використовувати Сервіс для створення, зберігання
              або поширення контенту, що порушує закон, права третіх осіб або містить
              заборонені матеріали (у т.ч. контент, що порушує авторські права, заклики до
              насильства, дискримінації, незаконної діяльності тощо).
            </p>
            <p>
              Виконавець має право блокувати запити/контент або обмежувати доступ у разі
              підозри на порушення.
            </p>

            <h3>7. Інтелектуальна власність</h3>
            <ul>
              <li>
                Права на Сервіс (код, дизайн, база даних, інтерфейс) належать Виконавцю або
                використовуються ним на законних підставах.
              </li>
              <li>
                Користувач не отримує жодних прав на Сервіс, окрім права користування
                відповідно до цих Умов.
              </li>
              <li>
                Щодо створеного Користувачем контенту: Виконавець надає Користувачу право
                використовувати результати генерації у межах, дозволених законодавством та цими
                Умовами. Користувач несе відповідальність за використання контенту та
                дотримання прав третіх осіб.
              </li>
            </ul>

            <h3>8. Відповідальність та обмеження гарантій</h3>
            <ul>
              <li>
                Сервіс надається “як є”. Виконавець не гарантує безперервну або безпомилкову
                роботу Сервісу.
              </li>
              <li>
                Виконавець не несе відповідальності за зміст контенту, який створює Користувач,
                та наслідки його використання.
              </li>
              <li>
                Максимальна відповідальність Виконавця обмежується сумою платежу Користувача за
                останній оплачений пакет Балів, щодо якого виникла претензія.
              </li>
            </ul>

            <h3>9. Персональні дані</h3>
            <p>
              Обробка персональних даних здійснюється відповідно до Політики
              конфіденційності, розміщеної на сайті.
            </p>

            <h3>10. Зміни умов</h3>
            <p>
              Виконавець має право змінювати ці Умови в будь-який час без попереднього
              повідомлення. Актуальна версія діє з моменту публікації на сайті.
            </p>

            <h3>11. Контакти </h3>
            <p>
              <b>Email:</b> contact.vilna.pro@gmail.com
            </p>
            <p>
            </p>
          </>
        ),

        en: (
          <>
            <h2>PUBLIC OFFER AGREEMENT (TERMS OF SERVICE)</h2>
            <p>
              This document is a public offer of Individual Entrepreneur (FOP) Pavlo
              Hlushchenko (the <b>“Provider”</b>) and sets the terms for access to the VILNA
              online service (the <b>“Service”</b>) for any legally capable person (the{" "}
              <b>“User”</b>).
            </p>
            <p>
              By using the Service and/or making a payment, the User confirms that they have
              read, understood, and accepted these Terms in full.
            </p>

            <h3>1. Definitions</h3>
            <p>
              <b>Credits</b> are an internal accounting unit of the Service used to pay for
              content generation within the Service. Credits are not money, not electronic
              money, cannot be exchanged for cash, and may be used only within the Service.
            </p>
            <p>
              <b>Content</b> means the generation results (images/videos and related data)
              created by the User via the Service.
            </p>

            <h3>2. Subject</h3>
            <p>
              The Provider grants the User access to the Service features for generating
              images and/or videos based on the User’s prompts. The User agrees to comply with
              these Terms and, if applicable, pay for credit packages according to the pricing
              published on the website.
            </p>

            <h3>3. Account & Access</h3>
            <ul>
              <li>Registration/sign-in may be required.</li>
              <li>The User is responsible for keeping account access secure.</li>
              <li>
                The Provider may restrict or terminate access in case of violations of these
                Terms or applicable laws.
              </li>
            </ul>

            <h3>4. Pricing & Payments</h3>
            <ul>
              <li>
                Payments are made by purchasing credit packages. Current prices are published
                on the “Pricing” page.
              </li>
              <li>
                Payments are processed by a payment provider. The Provider does not store
                Users’ bank card data.
              </li>
              <li>
                After a successful payment, credits are added to the User’s balance. Usually
                instantly, but in some cases it may take up to 5 minutes.
              </li>
            </ul>

            <h3>5. Refund Policy</h3>
            <ul>
              <li>
                The User may request a refund for <b>unused</b> credits within <b>14 calendar days</b>{" "}
                from the purchase date.
              </li>
              <li>
                If credits were used partially or fully, the payment is non-refundable.
              </li>
              <li>
                Refund requests must be sent to: <b>contact.vilna.pro@gmail.com</b>. Review
                time: up to <b>5 business days</b>.
              </li>
            </ul>

            <h3>6. Acceptable Use</h3>
            <p>
              The User agrees not to use the Service to generate or distribute illegal content
              or content that infringes third-party rights (including copyright), or content
              involving violence, discrimination, or any unlawful activity.
            </p>
            <p>
              The Provider may block prompts/content or restrict access if a violation is
              suspected.
            </p>

            <h3>7. Intellectual Property</h3>
            <ul>
              <li>
                The Service (code, design, database, UI) is owned by the Provider or used
                legally.
              </li>
              <li>
                The User receives no rights to the Service except the right to use it under
                these Terms.
              </li>
              <li>
                Regarding generated content: the Provider grants the User a right to use the
                results to the extent permitted by law and these Terms. The User is
                responsible for their use of the generated content and compliance with
                third-party rights.
              </li>
            </ul>

            <h3>8. Disclaimer & Limitation of Liability</h3>
            <ul>
              <li>The Service is provided “as is” without warranties of uninterrupted service.</li>
              <li>
                The Provider is not responsible for the content generated by the User or the
                consequences of its use.
              </li>
              <li>
                The Provider’s maximum liability is limited to the amount paid for the last
                purchased credit package related to the claim.
              </li>
            </ul>

            <h3>9. Personal Data</h3>
            <p>
              Personal data processing is governed by the Privacy Policy published on the
              website.
            </p>

            <h3>10. Changes to Terms</h3>
            <p>
              The Provider may update these Terms at any time. The current version is
              effective upon publication on the website.
            </p>

            <h3>11. Contacts </h3>
            <p><b>Email:</b> contact.vilna.pro@gmail.com</p>
          </>
        ),
      }}
    </LegalShell>
  );
}
