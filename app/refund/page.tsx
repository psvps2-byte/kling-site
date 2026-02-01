import LegalShell from "../components/LegalShell";

export default function RefundPage() {
  return (
    <LegalShell
      title={{ uk: "Політика повернення коштів", en: "Refund Policy" }}
    >
      {{
        uk: (
          <>
            <p>
              Користувач може запросити повернення коштів за невикористані бали
              протягом 14 днів з моменту покупки.
            </p>

            <p>
              Якщо бали були використані частково або повністю, повернення коштів
              не здійснюється.
            </p>

            <p>
              Для запиту повернення коштів необхідно звернутися до служби
              підтримки: contact.vilna.pro@gmail.com
            </p>

            <p>
              Рішення щодо повернення коштів приймається протягом 5 робочих днів.
            </p>
          </>
        ),
        en: (
          <>
            <p>
              Users may request a refund for unused points within 14 days of
              purchase.
            </p>

            <p>
              If points were partially or fully used, refunds are not provided.
            </p>

            <p>
              To request a refund, please contact support: contact.vilna.pro@gmail.com
            </p>

            <p>
              Refund requests are reviewed within 5 business days.
            </p>
          </>
        ),
      }}
    </LegalShell>
  );
}
