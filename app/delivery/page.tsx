import LegalShell from "../components/LegalShell";

export default function DeliveryPage() {
  return (
    <LegalShell
      title={{ uk: "Надання послуги", en: "Service Delivery" }}
      email="contact.vilna.pro@gmail.com"
    >
      {{
        uk: (
          <>
            <p>
              Після успішної оплати бали автоматично зараховуються на баланс
              користувача.
            </p>

            <p>
              Зазвичай це відбувається миттєво, але в окремих випадках може
              тривати до 5 хвилин.
            </p>

            <p>
              Якщо оплата пройшла, але бали не зʼявилися — зверніться до служби
              підтримки: contact.vilna.pro@gmail.com
            </p>
          </>
        ),
        en: (
          <>
            <p>
              After a successful payment, points are automatically added to the
              user’s balance.
            </p>

            <p>
              Usually this happens instantly, but in some cases it may take up
              to 5 minutes.
            </p>

            <p>
              If payment was successful but points were not added, contact
              support: contact.vilna.pro@gmail.com
            </p>
          </>
        ),
      }}
    </LegalShell>
  );
}
