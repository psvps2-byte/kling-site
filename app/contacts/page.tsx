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
          </>
        ),
        en: (
          <>
            <p>
              For any questions about the service or payments, contact support:
            </p>

            <p><b>Email:</b> contact.vilna.pro@gmail.com</p>
          </>
        ),
      }}
    </LegalShell>
  );
}
