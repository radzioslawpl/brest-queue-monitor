# Brest BTS Queue Monitor

Collector + database schema for monitoring the Brest-BTS electronic queue.

## Source API discovered in Chrome DevTools

```text
GET https://belarusborder.by/info/monitoring-new?token=test&checkpointId=a9173a85-3fc0-424c-84f0-defa632481e4
GET https://belarusborder.by/info/statistics?token=test&checkpointId=a9173a85-3fc0-424c-84f0-defa632481e4
```

## Data model

- status 2 = waiting (confirmed by observation)
- status 3 = called to PP (confirmed by observation)
- status 1 = currently treated as unknown

The collector stores aggregate snapshots and hashes registration numbers with SHA-256 rather than storing raw plate numbers.

## Plan

Supabase Edge Function -> Supabase Cron every 15 minutes -> PostgreSQL history -> Vercel dashboard.

The estimator will eventually accept any target date/time and work backwards from it using observed queue dynamics and completed status 2 -> 3 events.
