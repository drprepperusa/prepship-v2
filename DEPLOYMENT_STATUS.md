# PrepShip V2 Deployment Status

**Date**: March 10-11, 2026  
**Status**: ✅ **ALL SYSTEMS OPERATIONAL**

## Services

### API Server (Port 4010)
- **URL**: `https://api.prepshipv2.drprepperusa.com` (via Cloudflare Tunnel)
- **Status**: ✅ Running
- **Managed By**: launchd (com.prepshipv2.api)
- **Logs**: `/Users/djmac/prepship-v2/logs/api.out.log` / `.err.log`
- **Health Check**: `curl http://localhost:4010/health`

### Web Server (Port 4011)
- **URL**: `https://prepshipv2.drprepperusa.com` (via Cloudflare Tunnel)
- **Status**: ✅ Running
- **Managed By**: launchd (com.prepshipv2.web)
- **Logs**: `/Users/djmac/prepship-v2/logs/web.out.log` / `.err.log`
- **Health Check**: `curl http://localhost:4011/`

## Recent Fixes

### 1. Date Filter Bug (✅ Fixed - Commit f43000f)
**Problem**: "Last 30 Days" filter showing orders from August 2025  
**Solution**: Refactored date calculation using milliseconds-based math  
**Result**: Filter now correctly returns only Feb 8 - Mar 11, 2026 orders

**Test Results**:
```
✅ API returns 50 orders for last 30 days
✅ All orders are within Feb 8 - Mar 11 range  
✅ No August 2025 orders in last 30 days results
✅ Frontend correctly calculates 30-day range
✅ All orders are from 2026, not 2025
```

### 2. Rate Display Logic (✅ Fixed - Commit ca27c65)
**Problem**: Order panel rate display was backwards  
**Solution**: Show cached bestRate when weight+dims present, auto-fetch on changes  
**Result**: Rate display now shows cached rates immediately when available

## Configuration Files

### Environment Variables (launchd)
```
DB_PROVIDER=sqlite
SQLITE_DB_PATH=/Users/djmac/.openclaw/workspace/prepship/prepship.db
PREPSHIP_SECRETS_PATH=/Users/djmac/prepship-v2/secrets.json
PREPSHIP_V1_ROOT=/Users/djmac/.openclaw/workspace/prepship
API_PORT=4010
WEB_PORT=4011
WORKER_SYNC_ENABLED=false (prevents ShipStation sync on startup)
```

### Launchd Plist Files
- API: `/Users/djmac/Library/LaunchAgents/com.prepshipv2.api.plist`
- Web: `/Users/djmac/Library/LaunchAgents/com.prepshipv2.web.plist`
- Both configured with `RunAtLoad=true` and `KeepAlive=true`

## Verification Instructions

### Local Testing
1. **API**: `curl http://localhost:4010/api/orders?dateStart=2026-02-08&dateEnd=2026-03-11`
2. **Web**: `curl http://localhost:4011/`

### Browser Testing
1. Navigate to `https://prepshipv2.drprepperusa.com`
2. Select "Last 30 Days" in the date filter dropdown
3. Verify no August 2025 orders appear
4. Check browser console for debug logs: `[Orders] Date filter: 2026-02-08 → 2026-03-11`

### Test Suite
Run the date filter test: `node /tmp/test-date-filter.mjs`

## Service Management

### Start Services
```bash
launchctl load /Users/djmac/Library/LaunchAgents/com.prepshipv2.api.plist
launchctl load /Users/djmac/Library/LaunchAgents/com.prepshipv2.web.plist
```

### Stop Services
```bash
launchctl unload /Users/djmac/Library/LaunchAgents/com.prepshipv2.api.plist
launchctl unload /Users/djmac/Library/LaunchAgents/com.prepshipv2.web.plist
```

### View Logs
```bash
tail -f /Users/djmac/prepship-v2/logs/api.out.log
tail -f /Users/djmac/prepship-v2/logs/web.out.log
```

## Latest Commits

1. **f43000f** - feat: add debug logging for date filter calculations
2. **824d7d2** - fix: standardize date range calculation using milliseconds to prevent timezone bugs
3. **16c7fbc** - feat: standardize date range filtering with last-30-day default sitewide
4. **ca27c65** - fix: correct rate display logic - show bestRate when weight+dims present, not when missing
5. **ceac708** - debug: add detailed logging to cached bestRate display logic

## Next Steps

1. **User Verification** (optional): Load web app in browser and verify date filter works
2. **Monitor Logs**: Check for any errors in `/Users/djmac/prepship-v2/logs/`
3. **Performance Baseline** (future): Establish baseline metrics for concurrent requests

---

**Deployment Verified**: March 11, 2026 02:25 PT  
**All Tests Passing**: ✅ Yes  
**Production Ready**: ✅ Yes
