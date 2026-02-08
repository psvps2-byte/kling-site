import LegalShell from "../components/LegalShell";

export default function ContactsPage() {
  return (
    <LegalShell
      title={{ uk: "Контакти", en: "Contacts" }}
      email="contact.vilna.pro@gmail.com"
    >
      {{
        uk: (
          <>
            <p>
              З усіх питань щодо роботи сервісу та оплати звертайтесь до служби
              підтримки:
            </p>

            <p><b>Email:</b> contact.vilna.pro@gmail.com</p>

            <hr />

            <p><b>Власник сервісу:</b> ФОП Глущенко Павло Сергійович</p>
            <p><b>ЄДРПОУ:</b> 3210721811</p>
            <p>
              <b>Юридична адреса:</b> м. Київ, проспект Володимира Івасюка 8, корпус 3
            </p>
          </>
        ),
        en: (
          <>
            <p>
              For any questions about the service or payments, contact support:
            </p>

            <p><b>Email:</b> contact.vilna.pro@gmail.com</p>

            <hr />

            <p><b>Service owner:</b> Individual Entrepreneur (FOP) Pavlo Hlushchenko</p>
            <p><b>Registration number:</b> 3210721811</p>
            <p>
              <b>Legal address:</b> 8 Volodymyra Ivasiuka Ave., Building 3, Kyiv, Ukraine
            </p>
          </>
        ),
      }}
    </LegalShell>
  );
}
