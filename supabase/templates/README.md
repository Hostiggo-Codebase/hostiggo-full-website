# Email login: 6-digit code, not a magic link

The app signs people in with `supabase.auth.signInWithOtp({ email })` and then
`verifyOtp({ email, token, type: 'email' })`. Whether the email carries a **code**
or a **link** is decided only by the Supabase email template, not by the code.
If the template holds `{{ .ConfirmationURL }}`, Supabase sends a magic link.

These templates live in Supabase, not in this repo's runtime, so they have to be
pasted in once (Dashboard -> Authentication -> Emails / Email Templates):

1. **Magic Link** -> paste `magic_link.html`. Existing users get this one.
2. **Confirm signup** -> paste `confirmation.html`. **New users get this one**
   (`shouldCreateUser: true`), so it needs the code too. Missing it is the usual
   reason "some people get a code and some get a link".
3. Subject for both: `Your Hostiggo verification code`.
4. Authentication -> Providers -> Email: set **Email OTP Length = 6** (the
   sign-in screen takes exactly 6 digits; any other length can never verify).
5. Keep **Confirm email** consistent with how you want sign-up to behave; the
   code works either way.

## If emails don't arrive at all

Supabase's built-in email sender is for testing: it is capped at a few emails per
hour for the whole project and only delivers to your team's addresses. For real
users set up **custom SMTP** (Authentication -> Emails -> SMTP Settings, e.g.
Resend/SES/Postmark). The app already reports `over_email_send_rate_limit` when
this is the cause.
