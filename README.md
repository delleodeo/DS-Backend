# Modular-Monolith
"# DS-Backend"

## Email configuration

This project sends transactional emails using an SMTP provider via `nodemailer`. To enable email delivery in production, ensure the following environment variables are set (and not committed to source):

- `SMTP_HOST` (e.g., `smtp.gmail.com`)
- `SMTP_PORT` (e.g., `587`)
- `SMTP_USER` (SMTP username / from address)
- `SMTP_PASS` (SMTP password / app password / API key)

The server performs a mailer verification during startup; if mailer verification fails, a warning is logged. To manually verify mail connectivity from a running container:

```bash
# inside the app container
node -e "require('./utils/verification').verifyMailer().then(()=>console.log('OK')).catch(e=>console.error('ERR',e.message))"
```

If you use Docker Compose for production, prefer injecting credentials with environment variables or Docker secrets rather than committing them to `.env` in the repo.
