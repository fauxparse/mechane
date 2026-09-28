import { render, toPlainText } from "@react-email/render";
import type { CSSProperties } from "react";
const studioOrigin = process.env.APP_STUDIO_URL ?? "http://localhost:5173";
const logoUrl = new URL("/logo-light.png", studioOrigin).toString();
interface ActionEmailProps {
  preview: string;
  heading: string;
  message: string;
  actionLabel: string;
  actionUrl: string;
  note: string;
}

function ActionEmail({
  preview,
  heading,
  message,
  actionLabel,
  actionUrl,
  note,
}: ActionEmailProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body style={styles.body}>
        <div style={styles.preview}>{preview}</div>
        <table
          role="presentation"
          width="100%"
          cellPadding="0"
          cellSpacing="0"
          style={styles.outerTable}
        >
          <tbody>
            <tr>
              <td align="center" style={styles.outerCell}>
                <table
                  role="presentation"
                  width="100%"
                  cellPadding="0"
                  cellSpacing="0"
                  style={styles.container}
                >
                  <tbody>
                    <tr>
                      <td style={styles.brandSection}>
                        <img
                          src={logoUrl}
                          alt="Mechanē"
                          width="200"
                          height="40"
                          style={styles.logo}
                        />
                      </td>
                    </tr>
                    <tr>
                      <td style={styles.content}>
                        <h1 style={styles.heading}>{heading}</h1>
                        <p style={styles.message}>{message}</p>
                        <table role="presentation" cellPadding="0" cellSpacing="0">
                          <tbody>
                            <tr>
                              <td style={styles.buttonCell}>
                                <a href={actionUrl} style={styles.button}>
                                  {actionLabel}
                                </a>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <p style={styles.note}>{note}</p>
                        <hr style={styles.rule} />
                        <p style={styles.fallback}>
                          Button not working? Copy and paste this link into your browser:
                        </p>
                        <p style={styles.url}>{actionUrl}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style={styles.footer}>
                        <p style={styles.footerText}>Mechanē: Lift your theatre game</p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

const styles = {
  body: {
    backgroundColor: "#f3f0e6",
    color: "#332d29",
    fontFamily: "Helvetica, Arial, sans-serif",
    margin: "0",
    padding: "0",
  },
  preview: {
    display: "none",
    fontSize: "1px",
    lineHeight: "1px",
    maxHeight: "0",
    maxWidth: "0",
    opacity: "0",
    overflow: "hidden",
  },
  outerTable: { backgroundColor: "#f3f0e6" },
  outerCell: { padding: "24px 12px" },
  container: { backgroundColor: "#ffffff", margin: "0 auto", maxWidth: "560px", width: "100%" },
  brandSection: { borderBottom: "1px solid #b9af9b", padding: "20px 36px" },
  logo: { display: "block", height: "40px", width: "200px" },
  content: { padding: "36px" },
  heading: {
    color: "#332d29",
    fontFamily: "Helvetica, Arial, sans-serif",
    fontSize: "28px",
    fontWeight: "normal",
    lineHeight: "1.25",
    margin: "0 0 16px",
  },
  message: { color: "#5b524c", fontSize: "16px", lineHeight: "1.6", margin: "0 0 26px" },
  buttonCell: { backgroundColor: "#e76900", borderRadius: "4px", padding: "14px 22px" },
  button: {
    color: "#ffffff",
    display: "inline-block",
    fontSize: "15px",
    fontWeight: "bold",
    textDecoration: "none",
  },
  note: { color: "#5b524c", fontSize: "14px", lineHeight: "1.5", margin: "22px 0" },
  rule: { border: "0", borderTop: "1px solid #b9af9b", margin: "24px 0" },
  fallback: { color: "#5b524c", fontSize: "13px", lineHeight: "1.5", margin: "0 0 8px" },
  url: {
    color: "#af3a03",
    fontSize: "13px",
    lineHeight: "1.5",
    overflowWrap: "anywhere",
    margin: "0",
  },
  footer: { borderTop: "1px solid #b9af9b", padding: "14px 36px" },
  footerText: { color: "#504945", fontSize: "12px", margin: "0" },
} satisfies Record<string, CSSProperties>;

export async function renderActionEmail(
  props: ActionEmailProps,
): Promise<{ html: string; text: string }> {
  const html = await render(<ActionEmail {...props} />);
  return { html, text: toPlainText(html) };
}
