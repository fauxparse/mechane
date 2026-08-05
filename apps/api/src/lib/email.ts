// Transactional email sending, used by Better Auth's verification and
// password-reset flows (src/auth.ts).
//
// No email provider was specified by the PRD (§10 lists this as an open
// item alongside observability tooling), so for now this logs the message
// instead of delivering it — sufficient for local dev/testing, where the
// verification/reset URL is what actually matters. Swap the body of
// `sendEmail` for a real provider (e.g. Resend, Postmark) before shipping
// to real users; every call site here (auth.ts) is unaffected by that swap.
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  console.info(
    `[email] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`,
  );
}
