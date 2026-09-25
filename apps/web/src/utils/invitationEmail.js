export function invitationEmailMessage(delivery) {
  switch (delivery?.status) {
    case "accepted":
      return "Invitation email accepted by the email provider. It includes JU OKTA sign-in instructions; inbox delivery is not yet confirmed.";
    case "failed":
      return "Invitation saved, but the email provider rejected the email. Check email configuration before using Re-send email.";
    case "skipped":
      return "Invitation saved, but email sending is not configured for this environment. Share the sign-in instructions directly or contact an administrator.";
    case "sending":
    case "unknown":
      return "Invitation saved. Email delivery needs verification; another email will not be sent automatically. An administrator should check the email provider.";
    case "unavailable":
      return "This invitation is no longer pending. No email was sent.";
    default:
      return "No invitation email has been requested. Use Re-send email to send sign-in instructions.";
  }
}

export function canResendInvitationEmail(delivery) {
  return !["sending", "unknown"].includes(delivery?.status);
}
