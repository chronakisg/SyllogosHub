// Plain template function, returns HTML string. Δεν χρησιμοποιούμε JSX
// για να κρατήσουμε scope minimal (no react-email setup).
//
// Στέλνεται μία φορά, μετά τη δημιουργία club από το super admin panel
// (POST /api/admin/clubs Step 10). Δεν περιέχει password σε plaintext
// — security best practice. Ο admin θα συνδεθεί με τον κωδικό που του
// ανακοινώθηκε out-of-band από τον SyllogosHub administrator.

export type ClubWelcomeEmailProps = {
  clubName: string;
  adminName: string;
  adminEmail: string;
  appUrl: string;
};

export function renderClubWelcomeEmail(
  props: ClubWelcomeEmailProps,
): { subject: string; html: string; text: string } {
  const { clubName, adminName, adminEmail, appUrl } = props;

  const subject = `Καλώς ήρθες στο SyllogosHub — ${clubName}`;
  const loginUrl = `${appUrl}/login`;
  const primaryColor = "#800000";

  const html = `<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; max-width: 600px;">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 16px 32px; text-align: center; border-bottom: 4px solid ${primaryColor};">
              <div style="font-size: 22px; font-weight: 700; color: ${primaryColor};">SyllogosHub</div>
              <div style="font-size: 14px; color: #666; margin-top: 8px;">${clubName}</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 16px 0; font-size: 22px; color: #1a1a1a;">
                Καλώς ήρθες, ${adminName}!
              </h1>
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #333;">
                Ο σύλλογος <strong>${clubName}</strong> δημιουργήθηκε
                στο SyllogosHub και έχεις οριστεί ως ο διαχειριστής του.
              </p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #333;">
                Συνδέσου με το email σου και τον κωδικό που σου
                ανακοίνωσε ο διαχειριστής του SyllogosHub.
              </p>

              <!-- Login info box -->
              <div style="background-color: #f9f9f9; border: 1px solid #e5e5e5; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <div style="font-size: 13px; color: #666; margin-bottom: 4px;">Email σύνδεσης:</div>
                <div style="font-size: 15px; font-weight: 600; color: #1a1a1a; font-family: 'Courier New', monospace;">${adminEmail}</div>
              </div>

              <!-- CTA Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
                <tr>
                  <td>
                    <a href="${loginUrl}"
                       style="display: inline-block; padding: 14px 28px; background-color: ${primaryColor}; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
                      Σύνδεση στο SyllogosHub
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 24px 0 0 0; font-size: 13px; line-height: 1.6; color: #999;">
                Αν δεν θυμάσαι τον κωδικό σου, επικοινώνησε με τον
                διαχειριστή του SyllogosHub.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 16px 32px; background-color: #fafafa; border-top: 1px solid #eee; text-align: center;">
              <div style="font-size: 12px; color: #999;">
                SyllogosHub · Αυτόματο μήνυμα, μην απαντήσετε.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Καλώς ήρθες, ${adminName}!

Ο σύλλογος ${clubName} δημιουργήθηκε στο SyllogosHub και έχεις οριστεί
ως ο διαχειριστής του.

Email σύνδεσης: ${adminEmail}
Κωδικός: αυτός που σου ανακοίνωσε ο διαχειριστής του SyllogosHub.

Σύνδεση: ${loginUrl}

Αν δεν θυμάσαι τον κωδικό σου, επικοινώνησε με τον διαχειριστή του
SyllogosHub.

---
SyllogosHub
Αυτόματο μήνυμα, μην απαντήσετε.
`;

  return { subject, html, text };
}
