# Roadmap

## Multi-tenant SaaS isolation (current)
- [x] Audit DB schema, users, RLS policies, unique constraints
- [ ] Migration: shops + shop_members + helper fns (current_shop_id, is_shop_member, is_shop_owner)
- [ ] Migration: tenant_id on all business tables + backfill to original owner's shop
- [ ] Migration: per-tenant unique constraints (invoice_no, payment_no, purchase_no, product code)
- [ ] Migration: replace all business-table RLS policies with tenant-scoped ones
- [ ] Migration: insert/update triggers set & lock tenant_id; handle_new_user creates shop
- [ ] Frontend: clear React Query cache + phoenix.* localStorage on logout/account switch
- [ ] Tests: two accounts via PostgREST prove cross-tenant read/write/delete blocked
- [ ] Tests: browser E2E — owner sees existing data, fresh account sees none
- [ ] Summary of tables/policies/test results to user
- [ ] Mandatory security package floor update (bun add tanstack pinned versions)
