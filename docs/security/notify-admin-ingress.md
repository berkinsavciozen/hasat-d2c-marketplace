# notify-admin server-only ingress

`notify-admin` is not a browser/mobile API. A signed-in user creates a domain record under the
existing ownership RLS policy. Database triggers decide whether an admin event is warranted,
store one allowlisted event in `private.admin_sms_outbox`, and send only its UUID to the Edge
Function. The function loads the authoritative payload through service-role-only RPCs, renders a
bounded message, and calls Twilio.

## Secrets

Generate one random value with at least 32 bytes of entropy. Store the same value in these two
server-only locations; never put it in SQL, source, client environment variables, CI logs, or PR
text:

- Supabase Vault: `notify_admin_ingress_hmac`
- Edge Function secret: `NOTIFY_ADMIN_INGRESS_SECRET`

Store the recipient E.164 number only as the Edge secret `ADMIN_NOTIFY_PHONE`. Existing
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_MESSAGING_SERVICE_SID` secrets remain in
use. No phone number is kept in source.

## Release order

This is a fail-closed rollout and does not send a real test SMS.

1. In the Supabase dashboard, create the Vault and Edge HMAC entries above and add
   `ADMIN_NOTIFY_PHONE` under Edge Function secrets.
2. Deploy `notify-admin` from this commit with `verify_jwt=false`. Confirm unsigned, missing,
   incorrect, and stale signatures return 401/403 and Twilio request count remains zero. The old DB
   trigger will temporarily fail closed at this point.
3. Apply `20260915141507_l0_02b_secure_notify_admin_ingress.sql`. It creates the private outbox,
   service-role-only claim/completion RPCs, domain triggers, and the one-minute bounded retry job.
4. Insert one transaction-rolled-back fixture or use the committed SQL contract suite locally.
   Do not use a real production domain insert for verification. Inspect `net._http_response` and
   Edge logs only for status/opaque event IDs; do not log payloads or secrets.
5. Re-run Supabase security/performance advisors. The new objects must not add exposed-table,
   mutable-search-path, or public `SECURITY DEFINER` findings.

## Retry, idempotency, and rate limits

- `event_key` is unique, so a domain event produces one outbox row.
- The claim RPC locks the row; duplicate signed deliveries after `sent` are no-ops and concurrent
  deliveries cannot both call Twilio.
- At most five claims are accepted in a rolling minute across this admin-only channel.
- Definite provider rejections retry after 1 and then 5 minutes, for at most three attempts.
- A network exception or crash after claim is `uncertain`/`sending` and is never retried
  automatically. Twilio's standard Message-create endpoint has no documented idempotency key; an
  automatic retry after an uncertain POST could create a duplicate paid SMS. Reconcile these rows
  against Twilio logs before any manual action.

Operational query (dashboard SQL editor, read-only):

```sql
select status, attempt_count, count(*)
from private.admin_sms_outbox
group by status, attempt_count
order by status, attempt_count;
```

Alert if `failed`, `dead`, `uncertain`, or `sending` rows persist, or if `rate_limited` responses
appear in Edge logs.

## Rollback

For an application rollback, keep the secure Edge Function deployed and disable only the retry
job while investigating; this preserves the closed public ingress. Reverting to the former Edge
Function is prohibited because it restores unauthenticated arbitrary SMS sending and source PII.
If the migration itself must be reversed, first disable the triggers and cron job, preserve the
outbox for audit, and route both user flows to an alternative authenticated server-side notifier.
