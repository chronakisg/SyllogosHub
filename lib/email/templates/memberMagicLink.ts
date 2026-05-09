// Plain template function, returns HTML string. Δεν χρησιμοποιούμε JSX
// για να κρατήσουμε scope minimal (no react-email setup).

export type MemberMagicLinkEmailProps = {
  memberName: string;
  magicLinkUrl: string;
  clubName: string;
  logoUrl: string | null;
  primaryColor: string;
};

export function renderMemberMagicLinkEmail(
  props: MemberMagicLinkEmailProps
): { subject: string; html: string; text: string } {
  const { memberName, magicLinkUrl, clubName, logoUrl, primaryColor } = props;

  const subject = `Σύνδεση στο portal — ${clubName}`;

  const logoSection = logoUrl
    ? `<img src="${logoUrl}" alt="${clubName}" style="max-width: 120px; height: auto; margin-bottom: 16px;" />`
    : `<div style="font-size: 18px; font-weight: 700; color: ${primaryColor}; margin-bottom: 16px;">${clubName}</div>`;

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
          <!-- Header με logo -->
          <tr>
            <td style="padding: 32px 32px 16px 32px; text-align: center; border-bottom: 4px solid ${primaryColor};">
              ${logoSection}
              <div style="font-size: 14px; color: #666; margin-top: 8px;">${clubName}</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 16px 0; font-size: 22px; color: #1a1a1a;">
                Σύνδεση στο portal
              </h1>
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #333;">
                Γεια σου ${memberName},
              </p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #333;">
                Πατήστε το παρακάτω κουμπί για να συνδεθείτε στο portal του συλλόγου.
                Ο σύνδεσμος ισχύει για 1 ώρα.
              </p>

              <!-- CTA Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
                <tr>
                  <td>
                    <a href="${magicLinkUrl}"
                       style="display: inline-block; padding: 14px 28px; background-color: ${primaryColor}; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
                      Σύνδεση
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 24px 0 0 0; font-size: 13px; line-height: 1.6; color: #999;">
                Αν δεν ζητήσατε σύνδεση, αγνοήστε αυτό το email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 16px 32px; background-color: #fafafa; border-top: 1px solid #eee; text-align: center;">
              <div style="font-size: 12px; color: #999;">
                ${clubName} · Αυτόματο μήνυμα, μην απαντήσετε.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Σύνδεση στο portal — ${clubName}

Γεια σου ${memberName},

Πατήστε τον παρακάτω σύνδεσμο για να συνδεθείτε στο portal του συλλόγου:

${magicLinkUrl}

Ο σύνδεσμος ισχύει για 1 ώρα.

Αν δεν ζητήσατε σύνδεση, αγνοήστε αυτό το email.

---
${clubName}
`;

  return { subject, html, text };
}
